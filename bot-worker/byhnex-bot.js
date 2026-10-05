// Byhnex bot server (Cloudflare Workers free plan). Virtual money only: no exchange key, no real order.
// - One private bot per person, unlocked with a personal code (only its SHA-256 is stored, in USERS).
// - Each person has their own Durable Object (BotRoom): strongly consistent storage, and an alarm that wakes
//   it right after each candle close. Nothing runs in between, and a pause can never be overwritten by a pass.
// - The page drives it: /me, /start, /stop, /resume, /reset. Same engine as the page (bot-engine.js).
// Bindings: BOTS (Durable Object BotRoom), OLD (KV of the previous version, read once to carry a bot over).
// Vars: USERS = {"id": {"name": "...", "hash": "<sha256 hex of 'byhnex-bot:' + code>"}}.
import {readSettings, startBot, tickBot, nextDue, parseKlines} from './bot-core.js';

const ORIGINS = ['https://osvalt16.github.io', 'http://localhost:5173'];
// Binance market-data mirror first (meant for data, open to cloud servers), main API as a fallback.
const HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
const LIMIT = 300, RETRY = 5 * 60000, SOON = 60000;
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
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers}});

async function whoIs(request, env) {
  const code = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (normCode(code).length < 12) return null;
  const hash = await codeHash(code), users = JSON.parse(env.USERS || '{}');
  const id = Object.keys(users).find(k => users[k].hash === hash);
  return id ? {id, name: users[id].name} : null;
}

async function klines(symbol, interval, limit) {
  let last;
  for (const host of HOSTS) {
    try {
      const r = await fetch(`${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      if (r.ok) return await r.json();
      last = Error(`${host} HTTP ${r.status}`);
    } catch (e) { last = e; }
  }
  throw last;
}
async function fetchMarket(assets, interval, now) {
  const market = {};
  await Promise.all(assets.map(async a => {
    try { market[a] = parseKlines(await klines(a + 'USDT', interval, LIMIT), now); }
    catch (e) { console.log(`${a} indisponible : ${e.message}`); }
  }));
  return market;
}

// One person's bot. Storage key 'bot'; the alarm is the next moment the bot has something to decide.
export class BotRoom {
  constructor(state, env) { this.state = state; this.env = env; }

  async load(userId) {
    let bot = await this.state.storage.get('bot');
    if (bot === undefined && userId && this.env.OLD) {
      // Carry over a bot started with the previous KV version, once.
      bot = (await this.env.OLD.get('bot:' + userId, 'json')) || null;
      await this.state.storage.put('bot', bot);
      if (bot) await this.schedule(bot, clock.now());
    }
    return bot || null;
  }
  async save(bot) { await this.state.storage.put('bot', bot); }
  async schedule(bot, now, at) {
    const due = at ?? nextDue(bot, now);
    if (due === null || due === undefined) await this.state.storage.deleteAlarm();
    else await this.state.storage.setAlarm(Math.max(due, now + 1000));
  }

  async alarm() {
    const now = clock.now(), bot = await this.load();
    if (!bot || bot.stopped) return;
    const before = bot.assets.map(a => bot.states[a].lastTime).join(), wasResume = !!bot.resume;
    const market = await fetchMarket(bot.assets, bot.interval, now);
    if (bot.assets.some(a => !market[a])) return this.schedule(bot, now, now + RETRY);
    tickBot(bot, market, now);
    const progressed = wasResume || bot.assets.map(a => bot.states[a].lastTime).join() !== before;
    if (progressed) await this.save(bot);
    const due = nextDue(bot, now);
    await this.schedule(bot, now, !progressed || due <= now ? now + SOON : due);
  }

  async fetch(request) {
    const url = new URL(request.url), user = request.headers.get('X-User'), now = clock.now();
    const bot = await this.load(user);
    if (url.pathname === '/me') return json({bot});
    if (url.pathname === '/start') {
      const body = JSON.parse((await request.text()) || '{}');
      const settings = readSettings({BOT_ASSETS: body.assets, BOT_STRATEGY: body.strategy, BOT_INTERVAL: body.interval,
        BOT_CAPITAL: body.capital, BOT_FEE: body.fee, BOT_PARAMS: body.params});
      const market = await fetchMarket(settings.assets, settings.interval, now);
      const missing = settings.assets.filter(a => !market[a]);
      if (missing.length) return json({error: `Cours ${missing.join(', ')} indisponibles, réessaie dans un instant.`}, 503);
      const fresh = startBot(settings, market, now);
      await this.save(fresh);
      await this.schedule(fresh, now);
      return json({bot: fresh});
    }
    if (url.pathname === '/reset') { await this.save(null); await this.state.storage.deleteAlarm(); return json({bot: null}); }
    if (!bot) return json({error: 'Aucun bot serveur lancé.'}, 404);
    if (url.pathname === '/stop') { bot.stopped = true; bot.updatedAt = now; await this.save(bot); await this.state.storage.deleteAlarm(); return json({bot}); }
    if (url.pathname === '/resume') {
      if (bot.stopped) { bot.stopped = false; bot.resume = true; bot.updatedAt = now; await this.save(bot); }
      await this.schedule(bot, now, now);
      return json({bot});
    }
    return json({error: 'Action inconnue.'}, 404);
  }
}

async function health(url) {
  if (!url.searchParams.has('binance')) return {ok: true};
  try { const k = await klines('BTCUSDT', '1h', 2); return {ok: true, binance: Array.isArray(k) && k.length > 0, btc: +k.at(-1)[4]}; }
  catch (e) { return {ok: true, binance: false, error: e.message}; }
}

export default {
  async fetch(request, env) {
    const h = cors(request), url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: h});
    try {
      if (request.method === 'GET' && url.pathname === '/health') return json(await health(url), 200, h);
      const user = await whoIs(request, env);
      if (!user) return json({error: 'Code inconnu.'}, 401, h);
      const isMe = url.pathname === '/me';
      if (isMe ? request.method !== 'GET' : request.method !== 'POST') return json({error: 'Méthode non prise en charge.'}, 405, h);
      if (!['/me', '/start', '/stop', '/resume', '/reset'].includes(url.pathname)) return json({error: 'Action inconnue.'}, 404, h);
      const body = isMe ? undefined : await request.text();
      if (body && body.length > 2000) return json({error: 'Requête trop longue.'}, 413, h);
      const room = env.BOTS.get(env.BOTS.idFromName(user.id));
      const r = await room.fetch(new Request('https://room' + url.pathname, {method: isMe ? 'GET' : 'POST', headers: {'X-User': user.id}, body}));
      const data = await r.json();
      return json({name: user.name, ...data}, r.status, h);
    } catch (e) { return json({error: e.message || 'Erreur du serveur.'}, 400, h); }
  },
};
