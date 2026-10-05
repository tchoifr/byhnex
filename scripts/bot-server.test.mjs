import test from 'node:test';
import assert from 'node:assert/strict';
import {readSettings, startBot, tickBot} from './bot-server.mjs';
import {newBot, runBot} from '../bot-engine.js';

const H = 36e5, candles = (n, f = i => 100 + 20 * Math.sin(i / 5)) => Array.from({length: n}, (_, i) => ({openTime: i * H, closeTime: (i + 1) * H - 1, close: f(i)}));
const market = (n, assets) => Object.fromEntries(assets.map(a => [a, {candles: candles(n), price: candles(n).at(-1).close}]));

test('the GitHub form is checked before the bot starts', () => {
  assert.deepEqual(readSettings({BOT_ASSETS: 'btc, sol'}).assets, ['BTC', 'SOL']);
  assert.throws(() => readSettings({BOT_ASSETS: 'BTC,ETH,SOL,XRP'}), /1 à 3/);
  assert.throws(() => readSettings({BOT_ASSETS: 'PEPE'}), /inconnue/);
  assert.throws(() => readSettings({BOT_STRATEGY: 'rsi', BOT_PARAMS: '{"buyBelow": 80}'}), /seuil/);
  assert.throws(() => readSettings({BOT_PARAMS: '{oops'}), /JSON/);
  assert.equal(readSettings({BOT_STRATEGY: 'dca', BOT_CAPITAL: '5000'}).cfg.capital, 5000);
});

test('the server bot decides exactly like the bot on the device', () => {
  const settings = readSettings({BOT_ASSETS: 'BTC', BOT_STRATEGY: 'grid', BOT_PARAMS: '{"step": 4, "levels": 3}'});
  const bot = startBot(settings, market(200, ['BTC']), 1);
  tickBot(bot, market(300, ['BTC']), 2);
  const device = newBot(1000);
  device.lastTime = candles(200).at(-2).closeTime;
  runBot(device, candles(300), settings.cfg);
  assert.deepEqual(bot.states.BTC.trades, device.trades);
  assert.equal(bot.history.length, 2);
  assert.ok(bot.checks.length > 0 && bot.checks.every(c => c.asset === 'BTC'));
});

test('a paused server bot keeps its portfolio and stops trading', () => {
  const bot = startBot(readSettings({BOT_ASSETS: 'BTC,ETH', BOT_STRATEGY: 'dca', BOT_PARAMS: '{"every": 1, "amount": 10}'}), market(100, ['BTC', 'ETH']), 1);
  const before = bot.states.BTC.trades.length;
  bot.stopped = true;
  tickBot(bot, market(120, ['BTC', 'ETH']), 2);
  assert.equal(bot.states.BTC.trades.length, before);
  bot.stopped = false; bot.resume = true;
  tickBot(bot, market(130, ['BTC', 'ETH']), 3);
  assert.equal(bot.states.BTC.trades.length, before + 1);
  assert.equal(bot.resume, undefined);
});

test('a missing price is reported without losing the bot', () => {
  const bot = startBot(readSettings({BOT_ASSETS: 'BTC,SOL'}), market(100, ['BTC', 'SOL']), 1);
  tickBot(bot, market(110, ['BTC']), 2);
  assert.match(bot.error, /SOL/);
  assert.equal(bot.assets.length, 2);
});
