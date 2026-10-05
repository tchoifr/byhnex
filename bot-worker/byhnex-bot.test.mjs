import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {BotRoom, codeHash, clock as workerClock} from './byhnex-bot.js';

const H = 36e5, CODE = 'ABCD-EFGH-JKMN-PQRS', CODE2 = 'ZZZZ-YYYY-XXXX-WWWW';
let clock = 1000 * H + 30 * 6e4, binanceDown = false, fetched = [];
workerClock.now = () => clock;
globalThis.fetch = async url => {
  fetched.push(String(url));
  if (binanceDown) return new Response('{}', {status: 451});
  const u = new URL(url), step = H, end = Math.floor(clock / step) * step, n = +u.searchParams.get('limit');
  const rows = Array.from({length: n}, (_, i) => { const t = end - (n - 1 - i) * step; return [t, '1', '1', '1', String(100 + 20 * Math.sin(t / step / 5)), '1', t + step - 1]; });
  return new Response(JSON.stringify(rows));
};
// Minimal Durable Object runtime: one instance per name, storage with writes counted, a single alarm.
function namespace(env) {
  const rooms = new Map();
  return {rooms, idFromName: n => n, get(id) {
    if (!rooms.has(id)) {
      const data = new Map(), storage = {writes: 0, alarm: null,
        async get(k) { return data.has(k) ? structuredClone(data.get(k)) : undefined; },
        async put(k, v) { storage.writes++; data.set(k, structuredClone(v)); },
        async setAlarm(t) { storage.alarm = t; }, async deleteAlarm() { storage.alarm = null; }};
      rooms.set(id, new BotRoom({storage}, env));
    }
    return rooms.get(id);
  }};
}
async function makeEnv(old = {}) {
  const env = {USERS: JSON.stringify({moi: {name: 'Moi', hash: await codeHash(CODE)}, collegue: {name: 'Collègue', hash: await codeHash(CODE2)}}),
    OLD: {async get(k) { return old[k] ? structuredClone(old[k]) : null; }}};
  env.BOTS = namespace(env);
  return env;
}
const call = async (env, path, {code = CODE, body} = {}) => {
  const r = await worker.fetch(new Request('https://bot.test' + path, {method: path === '/me' || path.startsWith('/health') ? 'GET' : 'POST',
    headers: {Authorization: 'Bearer ' + code, Origin: 'https://osvalt16.github.io'}, body: body === undefined ? undefined : JSON.stringify(body)}), env);
  return {status: r.status, ...(await r.json())};
};
// Fires the alarm of a room when its time has come, like Cloudflare does.
async function tickAlarms(env) {
  let fired = 0;
  for (const room of env.BOTS.rooms.values()) if (room.state.storage.alarm !== null && room.state.storage.alarm <= clock) { room.state.storage.alarm = null; await room.alarm(); fired++; }
  return fired;
}
const dca = {assets: ['BTC', 'SOL'], strategy: 'dca', interval: '1h', capital: 1000, fee: 0.1, params: {every: 1, amount: 10}};

test('a wrong code is refused, each person only sees their own bot', async () => {
  const env = await makeEnv();
  assert.equal((await call(env, '/me', {code: 'NOPE-NOPE-NOPE-NOPE'})).status, 401);
  assert.equal((await call(env, '/start', {body: dca})).bot.assets[0], 'BTC');
  assert.equal((await call(env, '/me')).name, 'Moi');
  assert.equal((await call(env, '/me', {code: 'zzzz yyyy xxxx wwww'})).bot, null);
});

test('the bot sleeps until the next candle close, then decides it', async () => {
  const env = await makeEnv();
  await call(env, '/start', {body: dca});
  const room = env.BOTS.get('moi'), nextClose = Math.ceil(clock / H) * H;
  assert.equal(room.state.storage.alarm, nextClose + 20000, 'alarm set right after the next close');
  const writes = room.state.storage.writes;
  clock = nextClose - 1000; assert.equal(await tickAlarms(env), 0);
  clock = nextClose + 20000; assert.equal(await tickAlarms(env), 1);
  assert.equal(room.state.storage.writes, writes + 1, 'one write per close');
  assert.equal((await call(env, '/me')).bot.states.BTC.trades.length, 2);
  assert.equal(room.state.storage.alarm, nextClose + H + 20000);
});

test('a pause is immediate and survives the next close', async () => {
  const env = await makeEnv();
  await call(env, '/start', {body: dca});
  assert.equal((await call(env, '/stop')).bot.stopped, true);
  assert.equal(env.BOTS.get('moi').state.storage.alarm, null);
  clock += 3 * H; assert.equal(await tickAlarms(env), 0);
  const resumed = (await call(env, '/resume')).bot;
  assert.equal(resumed.stopped, false);
  clock += 1000; await tickAlarms(env);
  const bot = (await call(env, '/me')).bot;
  assert.equal(bot.states.BTC.trades.length, 2, 'the paused hours are not traded afterwards');
  assert.equal(bot.resume, undefined);
  assert.equal((await call(env, '/reset')).bot, null);
});

test('Binance down: retry in 5 minutes without rewriting the bot', async () => {
  const env = await makeEnv();
  await call(env, '/start', {body: dca});
  const room = env.BOTS.get('moi'), writes = room.state.storage.writes;
  clock = Math.ceil(clock / H) * H + 20000; binanceDown = true;
  await tickAlarms(env);
  binanceDown = false;
  assert.equal(room.state.storage.writes, writes);
  assert.equal(room.state.storage.alarm, clock + 5 * 60000);
});

test('the main Binance API is used when the data mirror refuses', async () => {
  const env = await makeEnv(), real = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('data-api') ? new Response('{}', {status: 403}) : real(url);
  try { assert.equal((await call(env, '/start', {body: dca})).status, 200); }
  finally { globalThis.fetch = real; }
  const h = await (await worker.fetch(new Request('https://bot.test/health?binance'), env)).json();
  assert.equal(h.binance, true);
});

test('a bot from the previous version is carried over', async () => {
  const env0 = await makeEnv(); await call(env0, '/start', {body: dca});
  const oldBot = (await call(env0, '/me')).bot;
  const env = await makeEnv({'bot:moi': oldBot});
  assert.deepEqual((await call(env, '/me')).bot.states, oldBot.states);
  assert.notEqual(env.BOTS.get('moi').state.storage.alarm, null);
  assert.equal((await call(env, '/me', {code: CODE2})).bot, null);
});

test('bad settings are refused with a readable message', async () => {
  const env = await makeEnv();
  const r = await call(env, '/start', {body: {...dca, assets: ['BTC', 'ETH', 'SOL', 'XRP']}});
  assert.equal(r.status, 400);
  assert.match(r.error, /1 à 3/);
});
