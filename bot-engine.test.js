import test from 'node:test';
import assert from 'node:assert/strict';
import {rsiSeries, emaSeries, newBot, runBot, simulate, equityOf, validateConfig} from './bot-engine.js';

const candles = closes => closes.map((close, i) => ({closeTime: (i + 1) * 1000, close}));
const wave = n => Array.from({length: n}, (_, i) => 100 + 20 * Math.sin(i / 6));

test('RSI stays within 0-100 and reads 100 on a steady rise', () => {
  const up = rsiSeries(Array.from({length: 30}, (_, i) => 10 + i), 14);
  assert.equal(up[14], 100);
  for (const v of rsiSeries(wave(200), 14).filter(v => v !== null)) assert.ok(v >= 0 && v <= 100);
});

test('EMA starts from the simple average of its first period', () => {
  const e = emaSeries([1, 2, 3, 4, 5], 3);
  assert.deepEqual(e.slice(0, 2), [null, null]);
  assert.equal(e[2], 2);
  assert.equal(e[3], 3);
});

test('a decision never uses future candles', () => {
  const cfg = {strategy: 'rsi', params: {}, capital: 1000, fee: 0.1};
  const full = wave(300), cut = full.slice(0, 150);
  const a = simulate(candles(full), cfg).state.trades.filter(t => t.t <= 150000);
  const b = simulate(candles(cut), cfg).state.trades;
  assert.deepEqual(a, b);
});

test('fees are charged on both sides of a round trip', () => {
  const state = newBot(1000);
  const cfg = {strategy: 'grid', params: {step: 10, levels: 1}, capital: 1000, fee: 1};
  runBot(state, candles([100, 111]), cfg);
  assert.equal(state.trades.length, 2);
  const expected = 1000 * 0.99 / 100 * 111 * 0.99;
  assert.ok(Math.abs(state.cash - expected) < 1e-9);
  assert.ok(Math.abs(state.fees - (10 + 1000 * 0.99 / 100 * 111 * 0.01)) < 1e-9);
});

test('the live bot only acts on candles it has not seen yet', () => {
  const cfg = {strategy: 'dca', params: {every: 1, amount: 10}, capital: 100, fee: 0};
  const state = newBot(100);
  state.lastTime = 2000;
  runBot(state, candles([10, 10, 10, 10]), cfg);
  assert.equal(state.trades.length, 2);
  runBot(state, candles([10, 10, 10, 10]), cfg);
  assert.equal(state.trades.length, 2);
});

test('DCA never spends more than the cash left', () => {
  const r = simulate(candles(new Array(20).fill(50)), {strategy: 'dca', params: {every: 1, amount: 30}, capital: 100, fee: 0});
  assert.ok(r.state.cash >= 0);
  assert.ok(Math.abs(equityOf(r.state, 50) - 100) < 1e-9);
});

test('replay reports performance next to buy-and-hold', () => {
  const r = simulate(candles(wave(400)), {strategy: 'ema', params: {fast: 5, slow: 20}, capital: 1000, fee: 0.1});
  assert.equal(r.equity.length, 400 - 21);
  assert.equal(simulate(candles(wave(50)), {strategy: 'grid', params: {}, capital: 1000, fee: 0}).equity.length, 50);
  assert.ok(Number.isFinite(r.stats.pct) && Number.isFinite(r.stats.holdPct));
  assert.ok(r.stats.maxDrawdown >= 0 && r.stats.maxDrawdown <= 100);
});

test('invalid settings are refused with a readable message', () => {
  assert.throws(() => validateConfig({strategy: 'rsi', params: {buyBelow: 80, sellAbove: 70}, capital: 1000, fee: 0.1}), /seuil/);
  assert.throws(() => validateConfig({strategy: 'ema', params: {fast: 50, slow: 20}, capital: 1000, fee: 0.1}), /rapide/);
  assert.throws(() => validateConfig({strategy: 'rsi', params: {}, capital: -5, fee: 0.1}), /capital/);
});

test('several cryptos share the capital and add up', async () => {
  const {simulateMany} = await import('./bot-engine.js');
  const cfg = {strategy: 'grid', params: {step: 5, levels: 2}, capital: 900, fee: 0.1};
  const a = candles(wave(120)), b = candles(wave(120).map(v => v * 3)), c = candles(wave(100));
  const r = simulateMany({A: a, B: b, C: c}, cfg);
  const solo = simulate(a, {...cfg, capital: 300});
  assert.deepEqual(r.assets.A.state.trades, solo.state.trades);
  assert.equal(r.equity.length, 100);
  const t = r.equity.at(-1).t, sum = ['A', 'B', 'C'].reduce((s, k) => s + r.assets[k].equity.find(e => e.t === t).bot, 0);
  assert.ok(Math.abs(r.equity.at(-1).bot - sum) < 1e-9);
  assert.ok(r.trades.every(x => ['A', 'B', 'C'].includes(x.asset)));
  assert.throws(() => simulateMany({}, cfg), /au moins une/);
});

test('the current reading explains what the bot waits for', async () => {
  const {readNow} = await import('./bot-engine.js');
  const data = candles(wave(80));
  assert.match(readNow(newBot(1000), data, {strategy: 'rsi', params: {}, capital: 1000, fee: 0.1}).wait, /achète sous 30/);
  const dca = {strategy: 'dca', params: {every: 4, amount: 10}, capital: 100, fee: 0}, s = newBot(100);
  assert.match(readNow(s, data, dca).value, /prochaine clôture/);
  s.ticks = 1;
  assert.match(readNow(s, data, dca).value, /3 bougies/);
});

test('the live bot notes every candle it checks without trading', () => {
  const state = newBot(1000), log = [];
  state.lastTime = 30000;
  runBot(state, candles(Array.from({length: 40}, (_, i) => 100 + i)), {strategy: 'rsi', params: {}, capital: 1000, fee: 0.1}, log);
  assert.equal(state.trades.length, 0);
  assert.equal(log.length, 10);
  assert.match(log[0].note, /pas d’achat, il faut passer sous 30/);
});
