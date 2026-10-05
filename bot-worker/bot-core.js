// Bot virtuel « serveur » : logique du Worker Cloudflare (bot-worker/byhnex-bot.js).
// Pure : aucun accès réseau ni disque.
// Argent fictif uniquement, même moteur que la page (bot-engine.js).
import {STRATEGIES, runBot, newBot, equityOf, validateConfig} from '../bot-engine.js';

export const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'LINK'];
export const INTERVALS = ['15m', '1h', '4h', '1d'];
const MAX_HISTORY = 3000, MAX_CHECKS = 300;

// Reads the settings sent by the page; refuses anything the page could not run either.
export function readSettings(env) {
  const list = Array.isArray(env.BOT_ASSETS) ? env.BOT_ASSETS.join(',') : String(env.BOT_ASSETS || 'BTC');
  const assets = [...new Set(list.toUpperCase().split(/[\s,;]+/).filter(Boolean))];
  if (!assets.length || assets.length > 3) throw Error('Choisis 1 à 3 cryptos.');
  for (const a of assets) if (!ASSETS.includes(a)) throw Error(`Crypto inconnue : ${a} (choix : ${ASSETS.join(', ')}).`);
  const interval = env.BOT_INTERVAL || '1h';
  if (!INTERVALS.includes(interval)) throw Error('Bougies : 15m, 1h, 4h ou 1d.');
  const strategy = env.BOT_STRATEGY || 'rsi';
  if (!STRATEGIES[strategy]) throw Error('Stratégie : rsi, ema, dca ou grid.');
  let params = {};
  if (env.BOT_PARAMS && typeof env.BOT_PARAMS === 'object') params = {...env.BOT_PARAMS};
  else if (env.BOT_PARAMS && String(env.BOT_PARAMS).trim()) {
    try { params = JSON.parse(env.BOT_PARAMS); } catch { throw Error('Réglages avancés : JSON invalide, ex. {"buyBelow": 35}.'); }
    for (const k of Object.keys(params)) if (!(k in STRATEGIES[strategy].defaults)) throw Error(`Réglage inconnu pour ${strategy} : ${k}.`);
  }
  const cfg = {strategy, params, capital: Number(env.BOT_CAPITAL || 1000), fee: Number(env.BOT_FEE || 0.1)};
  validateConfig(cfg);
  return {assets, interval, cfg};
}

const sub = bot => ({...bot.cfg, capital: bot.cfg.capital / bot.assets.length});

function record(bot, now) {
  const s = sub(bot), fee = bot.cfg.fee / 100;
  let value = 0, hold = 0;
  for (const a of bot.assets) {
    const price = bot.prices[a];
    value += equityOf(bot.states[a], price);
    hold += s.capital * (1 - fee) / bot.entry[a] * price;
  }
  bot.history.push({t: now, bot: value, hold});
  if (bot.history.length > MAX_HISTORY) bot.history.splice(0, bot.history.length - MAX_HISTORY);
}

// Starts a fresh bot: it decides at once on the candle that just closed, like the page does.
export function startBot({assets, interval, cfg}, market, now) {
  const bot = {server: true, assets, interval, cfg, states: {}, prices: {}, entry: {}, startedAt: now, checkedAt: now, updatedAt: now, runs: 1, history: [], checks: []};
  const s = sub(bot);
  for (const a of assets) {
    const {candles, price} = market[a], state = newBot(s.capital), log = [];
    state.lastTime = candles.at(-2)?.closeTime ?? 0;
    runBot(state, candles, s, log);
    bot.states[a] = state; bot.prices[a] = price; bot.entry[a] = price;
    bot.checks.push(...log.map(e => ({...e, asset: a})));
  }
  record(bot, now);
  return bot;
}

// One scheduled pass: every candle closed since the last pass is decided, in order.
export function tickBot(bot, market, now) {
  const s = sub(bot), failed = [];
  for (const a of bot.assets) {
    if (!market[a]) { failed.push(a); continue; }
    const {candles, price} = market[a];
    if (!bot.stopped) {
      // After a pause the bot picks up from the latest close: the paused stretch is never traded afterwards.
      if (bot.resume) bot.states[a].lastTime = Math.max(bot.states[a].lastTime, candles.at(-2)?.closeTime ?? 0);
      const log = [];
      runBot(bot.states[a], candles, s, log);
      bot.checks.push(...log.map(e => ({...e, asset: a})));
    }
    bot.prices[a] = price;
  }
  if (!failed.length) delete bot.resume;
  bot.checks.sort((x, y) => x.t - y.t);
  if (bot.checks.length > MAX_CHECKS) bot.checks.splice(0, bot.checks.length - MAX_CHECKS);
  bot.error = failed.length ? `Cours ${failed.join(', ')} indisponibles au dernier passage.` : null;
  bot.checkedAt = now; bot.updatedAt = now; bot.runs = (bot.runs || 0) + 1;
  if (!bot.stopped && !failed.length) record(bot, now);
  return bot;
}


export const STEP = {'15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5};
// Close time of the last candle that has closed at `now` (Binance: closeTime = openTime + step - 1).
export const lastClose = (interval, now) => Math.floor(now / STEP[interval]) * STEP[interval] - 1;
// When the bot next has something to decide: right away after a resume, else at the next candle close
// (plus a short delay so Binance has published it). A paused bot never needs a pass.
export function nextDue(bot, now) {
  if (!bot || bot.stopped) return null;
  if (bot.resume) return now;
  const done = Math.min(...bot.assets.map(a => bot.states[a].lastTime));
  const step = STEP[bot.interval];
  return done < lastClose(bot.interval, now) ? now : Math.floor(now / step) * step + step + 20000;
}

// Turns Binance klines rows into closed candles plus the live price.
export function parseKlines(rows, now) {
  const candles = [];
  for (const k of rows) if (k[6] <= now) { const close = +k[4]; if (close > 0) candles.push({openTime: k[0], closeTime: k[6], close}); }
  if (!candles.length) throw Error('Binance vide');
  return {candles, price: +rows.at(-1)[4] || candles.at(-1).close};
}
