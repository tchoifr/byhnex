// Tests of the subscribers' bot server: node --test bot-server/worker.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {PaidBotRoom, readAccess} from './worker.js';
import {clock} from '../bot-worker/byhnex-bot.js';

const H = 36e5, DAY = 24 * H;
let now = 1000 * H + 30 * 6e4;
clock.now = () => now;
const price = t => 100 + 10 * Math.sin(t / H / 5);
// Binance-style candles for every price request.
globalThis.fetch = async url => {
  const u = new URL(url), end = Math.floor(now / H) * H, n = +u.searchParams.get('limit') || 300;
  return new Response(JSON.stringify(Array.from({length: n}, (_, i) => end - (n - 1 - i) * H).map(t => [t, '1', '1', '1', String(price(t)), '1', t + H - 1])));
};

const keys = await crypto.subtle.generateKey({name: 'Ed25519'}, true, ['sign', 'verify']);
const publicHex = Buffer.from(await crypto.subtle.exportKey('raw', keys.publicKey)).toString('hex');
const other = await crypto.subtle.generateKey({name: 'Ed25519'}, true, ['sign', 'verify']);
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes) {
  let out = '', buffer = 0, bits = 0;
  for (const b of bytes) { buffer = (buffer << 8) | b; bits += 8; while (bits >= 5) { bits -= 5; out += B32[(buffer >> bits) & 31]; } buffer &= (1 << bits) - 1; }
  return bits ? out + B32[(buffer << (5 - bits)) & 31] : out;
}
// Same format as App\Bot\BotAccessToken: version, account id, end of the paid period (seconds), Ed25519 signature.
async function token(userId, paidUntilMs, key = keys.privateKey) {
  const payload = new Uint8Array(17), view = new DataView(payload.buffer);
  view.setUint8(0, 1); view.setBigUint64(1, BigInt(userId)); view.setBigUint64(9, BigInt(Math.floor(paidUntilMs / 1000)));
  const signature = new Uint8Array(await crypto.subtle.sign({name: 'Ed25519'}, key, payload));
  return base32([...payload, ...signature]);
}

function makeEnv() {
  const rooms = new Map(), env = {BOT_PUBLIC_KEY: publicHex, ALLOWED_ORIGINS: 'https://byhnex.com'};
  env.BOTS = {rooms, idFromName: n => n, get(id) {
    if (!rooms.has(id)) {
      const data = new Map(), storage = {alarm: null,
        async get(k) { return data.has(k) ? structuredClone(data.get(k)) : undefined; },
        async put(k, v) { data.set(k, structuredClone(v)); },
        async setAlarm(t) { storage.alarm = t; }, async deleteAlarm() { storage.alarm = null; }};
      rooms.set(id, new PaidBotRoom({storage}, env));
    }
    return rooms.get(id);
  }};
  return env;
}
const call = async (env, path, code, body) => {
  const r = await worker.fetch(new Request('https://bot.test' + path, {method: path === '/me' ? 'GET' : 'POST',
    headers: {Authorization: 'Bearer ' + code, Origin: 'https://byhnex.com'}, body: body && JSON.stringify(body)}), env);
  return {status: r.status, cors: r.headers.get('Access-Control-Allow-Origin'), ...(await r.json())};
};
const dca = {assets: ['BTC'], strategy: 'dca', interval: '1h', capital: 1000, fee: 0.1, params: {every: 1, amount: 10}};

test('access codes are checked with the public key only', async () => {
  const code = await token(42, now + 30 * DAY);
  assert.match(code, /^[A-Z2-7]{130}$/);
  assert.deepEqual(await readAccess(code, publicHex), {userId: '42', paidUntil: Math.floor((now + 30 * DAY) / 1000) * 1000});
  assert.equal(await readAccess(await token(42, now + 30 * DAY, other.privateKey), publicHex), null, 'Signé par une autre clé.');
  assert.equal(await readAccess(code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11), publicHex), null, 'Code modifié.');
  assert.equal(await readAccess('ABCD-EFGH-JKMN-PQRS', publicHex), null);
  assert.equal(await readAccess(code, ''), null, 'Sans clé publique, personne n’entre.');
});

test('a subscriber runs their own bot; others and forged codes are refused', async () => {
  const env = makeEnv(), anne = await token(1, now + 30 * DAY), bob = await token(2, now + 30 * DAY);
  assert.equal((await call(env, '/me', 'NOPE-NOPE-NOPE-NOPE')).status, 401);
  const started = await call(env, '/start', anne, dca);
  assert.equal(started.status, 200); assert.equal(started.bot.assets[0], 'BTC'); assert.equal(started.cors, 'https://byhnex.com');
  assert.equal((await call(env, '/me', anne)).name, 'Abonné');
  assert.equal((await call(env, '/me', bob)).bot, null, 'Chaque compte a son propre bot.');
  assert.deepEqual([...env.BOTS.rooms.keys()].sort(), ['u1', 'u2']);
});

test('the bot pauses itself when the paid period ends, and needs a renewal to restart', async () => {
  const env = makeEnv(), paidUntil = now + 2 * H, code = await token(7, paidUntil);
  assert.equal((await call(env, '/start', code, dca)).status, 200);
  const room = env.BOTS.rooms.get('u7');
  assert.ok(room.state.storage.alarm, 'Le bot tourne.');

  now = paidUntil + 1000;
  room.state.storage.alarm = null; await room.alarm();
  const me = await call(env, '/me', code);
  assert.equal(me.status, 200); assert.equal(me.bot.stopped, true, 'En pause à la fin de la période payée.');
  assert.equal(room.state.storage.alarm, null);
  const refused = await call(env, '/resume', code);
  assert.equal(refused.status, 403); assert.equal(refused.code, 'SUBSCRIPTION_REQUIRED');
  assert.equal((await call(env, '/start', code, dca)).status, 403);
  assert.equal((await call(env, '/stop', code)).status, 200, 'Pause et consultation restent possibles.');

  const renewed = await token(7, now + 30 * DAY);
  const resumed = await call(env, '/resume', renewed);
  assert.equal(resumed.status, 200); assert.equal(resumed.bot.stopped, false);
  // An old code no longer shortens the period: the room keeps the latest end date.
  await call(env, '/me', code);
  room.state.storage.alarm = null; await room.alarm();
  assert.equal((await call(env, '/me', renewed)).bot.stopped, false);
});

test('other sites cannot use the server from a browser', async () => {
  const env = makeEnv(), code = await token(3, now + DAY);
  const r = await worker.fetch(new Request('https://bot.test/me', {headers: {Authorization: 'Bearer ' + code, Origin: 'https://evil.example'}}), env);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://byhnex.com');
  const preflight = await worker.fetch(new Request('https://bot.test/start', {method: 'OPTIONS', headers: {Origin: 'https://byhnex.com'}}), env);
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), 'https://byhnex.com');
});
