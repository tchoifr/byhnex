// Byhnex bot server (Cloudflare Worker, free plan). Virtual money only: no exchange key, no real order.
// - One private bot per person, unlocked with a personal code (only its SHA-256 is stored, in USERS).
// - Cron every minute, but work happens only when a candle has closed: one KV read per idle minute,
//   two writes per close. One person per pass and 300 candles keep each pass well under the 10 ms CPU limit.
// - The page drives it: /me, /start, /stop, /resume, /reset. Same engine as the page (bot-engine.js).
// Bindings: BOT (KV). Vars: USERS = {"id": {"name": "...", "hash": "<sha256 hex of 'byhnex-bot:' + code>"}}.
import {readSettings, startBot, tickBot, nextDue, parseKlines} from './bot-core.js';

const ORIGINS = ['https://osvalt16.github.io', 'http://localhost:5173'];
const LIMIT = 300, RETRY = 5 * 60000;
export const clock = {now: () => Date.now()};

export const normCode = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export async function codeHash(code) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('byhnex-bot:' + normCode(code)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (request, body, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(request)}});

async function whoIs(request, env) {
  const code = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (normCode(code).length < 12) return null;
  const hash = await codeHash(code), users = JSON.parse(env.USERS || '{}');
  const id = Object.keys(users).find(k => users[k].hash === hash);
  return id ? {id, name: users[id].name} : null;
}

// Candles are fetched once per crypto and interval, even when both bots follow the same one.
async function fetchMarket(assets, interval, now) {
  const market = {};
  await Promise.all(assets.map(async a => {
    try {
      const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${a}USDT&interval=${interval}&limit=${LIMIT}`);
      if (!r.ok) throw Error('HTTP ' + r.status);
      market[a] = parseKlines(await r.json(), now);
    } catch (e) { console.log(`${a} indisponible : ${e.message}`); }
  }));
  return market;
}

const readIndex = async env => (await env.BOT.get('index', 'json')) || {};
async function setDue(env, id, due) {
  const index = await readIndex(env);
  if (due === undefined) delete index[id]; else index[id] = due;
  await env.BOT.put('index', JSON.stringify(index));
}

// One scheduled pass: the person whose bot is due first gets its closed candles decided.
export async function pass(env, now = Date.now()) {
  const index = await readIndex(env);
  const due = Object.entries(index).filter(([, t]) => t !== null && t <= now).sort((x, y) => x[1] - y[1]);
  if (!due.length) return 'idle';
  const [id] = due[0], bot = await env.BOT.get('bot:' + id, 'json');
  if (!bot) { delete index[id]; await env.BOT.put('index', JSON.stringify(index)); return 'gone'; }
  const before = bot.assets.map(a => bot.states[a].lastTime).join(), wasResume = !!bot.resume;
  const market = await fetchMarket(bot.assets, bot.interval, now);
  if (bot.assets.some(a => !market[a])) {
    // Binance unreachable: try again in 5 minutes without rewriting the bot (keeps KV writes low).
    index[id] = now + RETRY; await env.BOT.put('index', JSON.stringify(index));
    return 'retry';
  }
  tickBot(bot, market, now);
  const progressed = wasResume || bot.assets.map(a => bot.states[a].lastTime).join() !== before;
  if (progressed) await env.BOT.put('bot:' + id, JSON.stringify(bot));
  index[id] = progressed ? nextDue(bot, now) : now + 60000;
  await env.BOT.put('index', JSON.stringify(index));
  return progressed ? 'done' : 'wait';
}

async function api(request, env, url) {
  if (request.method === 'GET' && url.pathname === '/health') return json(request, {ok: true});
  const user = await whoIs(request, env);
  if (!user) return json(request, {error: 'Code inconnu.'}, 401);
  const key = 'bot:' + user.id, now = clock.now();
  if (request.method === 'GET' && url.pathname === '/me') return json(request, {name: user.name, bot: await env.BOT.get(key, 'json')});
  if (request.method !== 'POST') return json(request, {error: 'Méthode non prise en charge.'}, 405);
  const text = await request.text();
  if (text.length > 2000) return json(request, {error: 'Requête trop longue.'}, 413);
  if (url.pathname === '/start') {
    const body = text ? JSON.parse(text) : {};
    const settings = readSettings({BOT_ASSETS: body.assets, BOT_STRATEGY: body.strategy, BOT_INTERVAL: body.interval,
      BOT_CAPITAL: body.capital, BOT_FEE: body.fee, BOT_PARAMS: body.params});
    const market = await fetchMarket(settings.assets, settings.interval, now);
    const missing = settings.assets.filter(a => !market[a]);
    if (missing.length) return json(request, {error: `Cours ${missing.join(', ')} indisponibles, réessaie dans un instant.`}, 503);
    const bot = startBot(settings, market, now);
    await env.BOT.put(key, JSON.stringify(bot));
    await setDue(env, user.id, nextDue(bot, now));
    return json(request, {name: user.name, bot});
  }
  const bot = await env.BOT.get(key, 'json');
  if (url.pathname === '/reset') { await env.BOT.delete(key); await setDue(env, user.id, undefined); return json(request, {name: user.name, bot: null}); }
  if (!bot) return json(request, {error: 'Aucun bot serveur lancé.'}, 404);
  if (url.pathname === '/stop') { bot.stopped = true; bot.updatedAt = now; }
  else if (url.pathname === '/resume') { if (bot.stopped) { bot.stopped = false; bot.resume = true; bot.updatedAt = now; } }
  else return json(request, {error: 'Action inconnue.'}, 404);
  await env.BOT.put(key, JSON.stringify(bot));
  await setDue(env, user.id, bot.stopped ? null : now);
  return json(request, {name: user.name, bot});
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(request)});
    try { return await api(request, env, new URL(request.url)); }
    catch (e) { return json(request, {error: e.message || 'Erreur du serveur.'}, 400); }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pass(env, event.scheduledTime || clock.now()).then(r => console.log('passage :', r)));
  },
};
