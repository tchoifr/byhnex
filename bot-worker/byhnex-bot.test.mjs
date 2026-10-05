import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {BotRoom, codeHash, clock as workerClock} from './byhnex-bot.js';

const H = 36e5, CODE = 'ABCD-EFGH-JKMN-PQRS', CODE2 = 'ZZZZ-YYYY-XXXX-WWWW';
let clock = 1000 * H + 30 * 6e4, binanceDown = false, fetched = [];
workerClock.now = () => clock;
// Fake markets: Binance-style rows, also served the way OKX and Coinbase shape them. `blocked` lists refused hosts.
let blocked = [];
const price = t => 100 + 20 * Math.sin(t / H / 5);
globalThis.fetch = async url => {
  fetched.push(String(url));
  const u = new URL(url);
  if (binanceDown || blocked.some(h => u.host.includes(h))) return new Response('{}', {status: 403});
  const step = H, end = Math.floor(clock / step) * step;
  const times = n => Array.from({length: n}, (_, i) => end - (n - 1 - i) * step);
  if (u.host.includes('okx')) return new Response(JSON.stringify({code: '0', msg: '', data: times(+u.searchParams.get('limit')).reverse().map(t => [String(t), '1', '1', '1', String(price(t)), '1', '1', '1', t + step <= clock ? '1' : '0'])}));
  if (u.host.includes('coinbase')) return new Response(JSON.stringify(times(300).reverse().map(t => [t / 1000, 1, 1, 1, price(t), 1])));
  return new Response(JSON.stringify(times(+u.searchParams.get('limit')).map(t => [t, '1', '1', '1', String(price(t)), '1', t + step - 1])));
};
// Minimal Durable Object runtime: one instance per name, storage with writes counted, a single alarm.
function namespace(env) {
  const rooms = new Map();
  return {rooms, places: [], idFromName: n => n, get(id, opts) {
    this.places.push(opts?.locationHint);
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

test('Binance refused: OKX then Coinbase take over with the same candles', async () => {
  const {SOURCES} = await import('./byhnex-bot.js');
  const ref = await SOURCES[0].get('BTC', '1h', 300);
  for (const name of ['OKX', 'Coinbase']) {
    const rows = await SOURCES.find(x => x.name === name).get('BTC', '1h', 300);
    assert.deepEqual(rows.map(r => [r[0], r[6], +r[4]]), ref.map(r => [r[0], r[6], +r[4]]), name + ' rows line up with Binance');
  }
  const env = await makeEnv();
  blocked = ['binance'];
  try {
    const r = await call(env, '/start', {body: dca});
    assert.equal(r.status, 200);
    assert.equal(r.bot.states.BTC.trades.length, 1);
    const h = await (await worker.fetch(new Request('https://bot.test/health?prices'), env)).json();
    assert.deepEqual([h.prices, h.source], [true, 'OKX']);
    blocked = ['binance', 'okx'];
    assert.equal((await (await worker.fetch(new Request('https://bot.test/health?prices'), env)).json()).source, 'Coinbase');
    assert.equal((await call(env, '/start', {body: {...dca, interval: '4h'}})).status, 503, 'no source left for 4h candles');
  } finally { blocked = []; }
});

test('the main Binance API is used when the data mirror refuses', async () => {
  const env = await makeEnv(), real = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('data-api') ? new Response('{}', {status: 403}) : real(url);
  try { assert.equal((await call(env, '/start', {body: dca})).status, 200); }
  finally { globalThis.fetch = real; }
  const h = await (await worker.fetch(new Request('https://bot.test/health?binance'), env)).json();
  assert.equal(h.prices, true);
  assert.ok(env.BOTS.places.length && env.BOTS.places.every(p => p === 'weur'), 'bots and the check live in Western Europe');
});

test('a bot from the previous version is carried over', async () => {
  const env0 = await makeEnv(); await call(env0, '/start', {body: dca});
  const oldBot = (await call(env0, '/me')).bot;
  const env = await makeEnv({'bot:moi': oldBot});
  assert.deepEqual((await call(env, '/me')).bot.states, oldBot.states);
  assert.notEqual(env.BOTS.get('moi').state.storage.alarm, null);
  assert.equal((await call(env, '/me', {code: CODE2})).bot, null);
});

test('every source blocked: the check says so, with each one tried', async () => {
  const env = await makeEnv();
  binanceDown = true;
  try {
    const h = await (await worker.fetch(new Request('https://bot.test/health?binance'), env)).json();
    assert.equal(h.prices, false);
    assert.match(h.error, /Binance HTTP 403 ; Binance \(API\) HTTP 403 ; OKX HTTP 403 ; Coinbase HTTP 403/);
  } finally { binanceDown = false; }
});

test('bad settings are refused with a readable message', async () => {
  const env = await makeEnv();
  const r = await call(env, '/start', {body: {...dca, assets: ['BTC', 'ETH', 'SOL', 'XRP']}});
  assert.equal(r.status, 400);
  assert.match(r.error, /1 à 3/);
});
