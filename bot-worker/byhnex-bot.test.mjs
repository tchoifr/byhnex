import test from 'node:test';
import assert from 'node:assert/strict';
import worker, {pass, codeHash, clock as workerClock} from './byhnex-bot.js';

const H = 36e5, CODE = 'ABCD-EFGH-JKMN-PQRS';
const kv = () => { const m = new Map(); let writes = 0; return {m, get writes() { return writes; },
  async get(k, t) { const v = m.get(k); return v === undefined ? null : t === 'json' ? JSON.parse(v) : v; },
  async put(k, v) { writes++; m.set(k, v); }, async delete(k) { m.delete(k); }}; };
const env = async () => ({BOT: kv(), USERS: JSON.stringify({moi: {name: 'Moi', hash: await codeHash(CODE)}, collegue: {name: 'Collègue', hash: await codeHash('ZZZZ-YYYY-XXXX-WWWW')}})});
let clock = 1000 * H + 30 * 6e4;
workerClock.now = () => clock;
globalThis.fetch = async url => {
  const step = H, end = Math.floor(clock / step) * step, n = 300;
  const rows = Array.from({length: n}, (_, i) => { const t = end - (n - 1 - i) * step; return [t, '1', '1', '1', String(100 + 20 * Math.sin(t / step / 5)), '1', t + step - 1]; });
  return new Response(JSON.stringify(rows));
};
const call = (e, path, {code = CODE, body} = {}) => worker.fetch(new Request('https://bot.test' + path, {method: body === undefined ? (path === '/me' || path === '/health' ? 'GET' : 'POST') : 'POST', headers: {Authorization: 'Bearer ' + code, Origin: 'https://osvalt16.github.io'}, body: body === undefined ? undefined : JSON.stringify(body)}), e);

test('a wrong code is refused, each person only sees their own bot', async () => {
  const e = await env();
  assert.equal((await call(e, '/me', {code: 'NOPE-NOPE-NOPE-NOPE'})).status, 401);
  assert.equal((await call(e, '/health', {code: ''})).status, 200);
  await call(e, '/start', {body: {assets: ['BTC'], strategy: 'dca', interval: '1h', capital: 1000, fee: 0.1, params: {every: 1, amount: 10}}});
  assert.equal((await (await call(e, '/me')).json()).bot.assets[0], 'BTC');
  assert.equal((await (await call(e, '/me', {code: 'zzzz yyyy xxxx wwww'})).json()).bot, null);
});

test('the cron only works when a candle has closed, and keeps KV writes low', async () => {
  const e = await env();
  const r = await call(e, '/start', {body: {assets: ['BTC', 'SOL'], strategy: 'dca', interval: '1h', capital: 1000, fee: 0.1, params: {every: 1, amount: 10}}});
  assert.equal(r.status, 200);
  const w0 = e.BOT.writes;
  for (let m = 0; m < 20; m++) { clock += 6e4; assert.equal(await pass(e, clock), 'idle'); }
  assert.equal(e.BOT.writes, w0);
  clock = Math.ceil(clock / H) * H + 30000;
  assert.equal(await pass(e, clock), 'done');
  assert.equal(e.BOT.writes, w0 + 2);
  const bot = JSON.parse(e.BOT.m.get('bot:moi'));
  assert.equal(bot.states.BTC.trades.length, 2);
  assert.equal(await pass(e, clock + 6e4), 'idle');
});

test('two people due at the same close are served one per pass', async () => {
  const e = await env(), body = {assets: ['BTC'], strategy: 'rsi', interval: '1h', capital: 1000, fee: 0.1};
  await call(e, '/start', {body}); await call(e, '/start', {code: 'ZZZZ-YYYY-XXXX-WWWW', body});
  clock = Math.ceil(clock / H) * H + 30000;
  assert.equal(await pass(e, clock), 'done');
  assert.equal(await pass(e, clock + 6e4), 'done');
  assert.equal(await pass(e, clock + 12e4), 'idle');
});

test('pause, resume and reset from the page', async () => {
  const e = await env();
  await call(e, '/start', {body: {assets: ['ETH'], strategy: 'dca', interval: '1h', capital: 1000, fee: 0, params: {every: 1, amount: 10}}});
  assert.equal((await (await call(e, '/stop')).json()).bot.stopped, true);
  clock += 3 * H;
  assert.equal(await pass(e, clock), 'idle');
  const resumed = (await (await call(e, '/resume')).json()).bot;
  assert.equal(resumed.stopped, false);
  assert.equal(await pass(e, clock + 1000), 'done');
  const bot = JSON.parse(e.BOT.m.get('bot:moi'));
  assert.equal(bot.states.ETH.trades.length, 2, 'the paused hours are not traded afterwards');
  assert.equal((await (await call(e, '/reset')).json()).bot, null);
  assert.equal(await pass(e, clock + 2 * H), 'idle');
});

test('bad settings are refused with a readable message', async () => {
  const e = await env();
  const r = await call(e, '/start', {body: {assets: ['BTC', 'ETH', 'SOL', 'XRP'], strategy: 'rsi', interval: '1h', capital: 1000, fee: 0.1}});
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /1 à 3/);
});
