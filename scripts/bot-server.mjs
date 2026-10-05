// Bot virtuel « serveur » : tourne sur GitHub Actions, même application fermée.
// Argent fictif uniquement : aucune clé, aucun ordre réel. Même moteur que la page (bot-engine.js),
// donc les décisions sont identiques à celles du bot de l'appareil.
// Usage : node scripts/bot-server.mjs <état précédent.json> <nouvel état.json>
// Réglages (workflow_dispatch) : BOT_ACTION=tick|start|stop|resume|reset, BOT_ASSETS, BOT_STRATEGY,
// BOT_INTERVAL, BOT_CAPITAL, BOT_FEE, BOT_PARAMS (JSON).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {STRATEGIES, runBot, newBot, equityOf, validateConfig} from '../bot-engine.js';

export const ASSETS = ['BTC', 'ETH', 'SOL', 'XRP', 'BNB', 'DOGE', 'ADA', 'LINK'];
export const INTERVALS = ['15m', '1h', '4h', '1d'];
const MAX_HISTORY = 3000, MAX_CHECKS = 300;

// Reads the settings typed in the GitHub form; refuses anything the page could not run either.
export function readSettings(env) {
  const assets = [...new Set(String(env.BOT_ASSETS || 'BTC').toUpperCase().split(/[\s,;]+/).filter(Boolean))];
  if (!assets.length || assets.length > 3) throw Error('Choisis 1 à 3 cryptos.');
  for (const a of assets) if (!ASSETS.includes(a)) throw Error(`Crypto inconnue : ${a} (choix : ${ASSETS.join(', ')}).`);
  const interval = env.BOT_INTERVAL || '1h';
  if (!INTERVALS.includes(interval)) throw Error('Bougies : 15m, 1h, 4h ou 1d.');
  const strategy = env.BOT_STRATEGY || 'rsi';
  if (!STRATEGIES[strategy]) throw Error('Stratégie : rsi, ema, dca ou grid.');
  let params = {};
  if (env.BOT_PARAMS && env.BOT_PARAMS.trim()) {
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

async function fetchMarket(assets, interval) {
  const market = {};
  for (const a of assets) {
    try {
      const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${a}USDT&interval=${interval}&limit=500`, {headers: {'User-Agent': 'byhnex-bot'}});
      if (!r.ok) throw Error('HTTP ' + r.status);
      const rows = await r.json(), now = Date.now();
      const candles = rows.filter(k => k[6] <= now).map(k => ({openTime: k[0], closeTime: k[6], close: +k[4]})).filter(c => c.close > 0);
      if (!candles.length) throw Error('vide');
      market[a] = {candles, price: +rows.at(-1)[4] || candles.at(-1).close};
    } catch (e) { console.log(`${a} : cours indisponibles (${e.message})`); }
  }
  return market;
}

async function main([prevFile, outFile]) {
  const env = process.env, action = env.BOT_ACTION || 'tick', now = Date.now();
  let bot = null;
  try { bot = JSON.parse(fs.readFileSync(prevFile, 'utf8')); } catch { console.log('Pas de bot serveur enregistré.'); }
  if (bot && !bot.server) bot = null;
  if (action === 'reset') bot = null;
  else if (action === 'start') {
    const settings = readSettings(env), market = await fetchMarket(settings.assets, settings.interval);
    const missing = settings.assets.filter(a => !market[a]);
    if (missing.length) throw Error(`Impossible de démarrer : cours ${missing.join(', ')} indisponibles.`);
    bot = startBot(settings, market, now);
  } else if (bot) {
    if (action === 'stop') bot.stopped = true;
    if (action === 'resume' && bot.stopped) { bot.stopped = false; bot.resume = true; }
    bot = tickBot(bot, await fetchMarket(bot.assets, bot.interval), now);
  }
  fs.mkdirSync(path.dirname(outFile), {recursive: true});
  fs.writeFileSync(outFile, JSON.stringify(bot ? bot : {server: true, empty: true, updatedAt: now}));
  if (bot) {
    const trades = bot.assets.reduce((n, a) => n + bot.states[a].trades.length, 0);
    console.log(`Bot serveur ${bot.stopped ? 'en pause' : 'actif'} : ${bot.assets.join(', ')} · ${bot.cfg.strategy} · ${bot.interval} · ${trades} ordre(s) fictif(s) · passage n°${bot.runs}`);
  } else console.log('Aucun bot serveur actif.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exit(1); });
}
