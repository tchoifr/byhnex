// Subscribers' bot server for byhnex.com (Cloudflare Workers, Byhnex's own account).
// The engine is osvalt16's bot server (bot-worker/byhnex-bot.js), imported unchanged. This file only adds:
// - access: an Ed25519-signed code issued by the API (POST /api/bot/token) to accounts with an active subscription.
//   The code carries the account id and the end of the paid period; only the public key lives here.
// - the paid period: /start and /resume answer 403 SUBSCRIPTION_REQUIRED once it has ended, and the bot's alarm
//   pauses the bot at the end of the period (no automatic renewal, nothing is charged).
// Vars: BOT_PUBLIC_KEY (64 hex characters), ALLOWED_ORIGINS (comma-separated). Binding: BOTS (PaidBotRoom).
import engine, {BotRoom, codeHash, normCode, clock} from '../bot-worker/byhnex-bot.js';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PAID_ONLY = ['/start', '/resume'];

function base32Decode(text) {
  const out = [];
  let buffer = 0, bits = 0;
  for (const char of text) {
    const value = BASE32.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 5) | value; bits += 5;
    if (bits >= 8) { bits -= 8; out.push((buffer >> bits) & 255); buffer &= (1 << bits) - 1; }
  }
  return new Uint8Array(out);
}
const hexBytes = hex => /^[0-9a-f]{64}$/.test(hex || '') ? new Uint8Array(hex.match(/../g).map(b => parseInt(b, 16))) : null;

// Reads and checks an access code: {userId, paidUntil (ms)} or null.
export async function readAccess(code, publicKeyHex) {
  const raw = base32Decode(normCode(code)), key = hexBytes(publicKeyHex);
  if (!raw || raw.length !== 81 || !key || raw[0] !== 1) return null;
  const payload = raw.slice(0, 17), signature = raw.slice(17);
  const publicKey = await crypto.subtle.importKey('raw', key, {name: 'Ed25519'}, false, ['verify']);
  if (!await crypto.subtle.verify({name: 'Ed25519'}, publicKey, signature, payload)) return null;
  const view = new DataView(payload.buffer);
  return {userId: String(view.getBigUint64(1)), paidUntil: Number(view.getBigUint64(9)) * 1000};
}

// osvalt16's bot room, plus the end of the paid period, stored next to the bot.
export class PaidBotRoom extends BotRoom {
  async fetch(request) {
    if (new URL(request.url).pathname === '/__paid') {
      const until = Number(request.headers.get('X-Paid-Until')) || 0;
      if (until > ((await this.state.storage.get('paidUntil')) || 0)) await this.state.storage.put('paidUntil', until);
      return new Response(null, {status: 204});
    }
    return super.fetch(request);
  }

  async alarm() {
    const paidUntil = (await this.state.storage.get('paidUntil')) || 0;
    if (clock.now() < paidUntil) return super.alarm();
    const bot = await this.load();
    if (bot && !bot.stopped) { bot.stopped = true; bot.updatedAt = clock.now(); await this.save(bot); }
    await this.state.storage.deleteAlarm();
  }
}

const origins = env => String(env.ALLOWED_ORIGINS || 'https://byhnex.com').split(',').map(o => o.trim()).filter(Boolean);
function withCors(response, request, env) {
  const origin = request.headers.get('Origin') || '', allowed = origins(env);
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : allowed[0]);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  headers.set('Vary', 'Origin');
  return new Response(response.body, {status: response.status, headers});
}
const json = (body, status) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return withCors(new Response(null, {status: 204}), request, env);
    if (url.pathname === '/health') return withCors(await engine.fetch(request, env), request, env);
    const code = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const access = await readAccess(code, env.BOT_PUBLIC_KEY).catch(() => null);
    if (!access) return withCors(json({error: 'Code inconnu.'}, 401), request, env);
    const id = 'u' + access.userId;
    // Tell the bot's room how long it is paid for (it keeps the latest date it has seen).
    await env.BOTS.get(env.BOTS.idFromName(id), {locationHint: 'weur'})
      .fetch(new Request('https://room/__paid', {method: 'POST', headers: {'X-Paid-Until': String(access.paidUntil)}}));
    if (PAID_ONLY.includes(url.pathname) && clock.now() >= access.paidUntil) {
      return withCors(json({error: 'Ton abonnement au bot est terminé. Renouvelle-le (1 USDC pour 30 jours) pour relancer ton bot.', code: 'SUBSCRIPTION_REQUIRED'}, 403), request, env);
    }
    // The engine authenticates with its USERS list: give it this one person, under their account id.
    const users = JSON.stringify({[id]: {name: 'Abonné', hash: await codeHash(code)}});
    return withCors(await engine.fetch(request, {...env, USERS: users, OLD: undefined}), request, env);
  },
};
