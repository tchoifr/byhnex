// Virtual trading bot: pure decision + portfolio engine. No network, no real orders.
// The same step function drives the history replay and the live paper bot, so both behave identically.
// Every decision only reads candles up to the one being processed and fills at its close.

export const STRATEGIES = {
  rsi: {label: 'RSI : acheter la peur, vendre l’euphorie', defaults: {period: 14, buyBelow: 30, sellAbove: 70}},
  ema: {label: 'Croisement de moyennes EMA', defaults: {fast: 20, slow: 50}},
  dca: {label: 'DCA : achat régulier', defaults: {every: 24, amount: 100, takeProfit: 0}},
  grid: {label: 'Grille : acheter les baisses, vendre les rebonds', defaults: {step: 3, levels: 5}},
};

export function rsiSeries(closes, period) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i - 1]; gain += Math.max(d, 0); loss += Math.max(-d, 0); }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function emaSeries(closes, period) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < period) return out;
  let ema = closes.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = ema;
  const k = 2 / (period + 1);
  for (let i = period; i < closes.length; i++) { ema = closes[i] * k + ema * (1 - k); out[i] = ema; }
  return out;
}

export function warmup(cfg) {
  const p = {...STRATEGIES[cfg.strategy].defaults, ...cfg.params};
  if (cfg.strategy === 'rsi') return p.period + 1;
  if (cfg.strategy === 'ema') return Math.max(p.fast, p.slow) + 1;
  return 0;
}

export function validateConfig(cfg) {
  if (!STRATEGIES[cfg.strategy]) throw Error('Stratégie inconnue.');
  const p = {...STRATEGIES[cfg.strategy].defaults, ...cfg.params};
  const ok = Object.values(p).every(Number.isFinite) && Number.isFinite(cfg.capital) && cfg.capital > 0 && Number.isFinite(cfg.fee) && cfg.fee >= 0 && cfg.fee < 10;
  if (!ok) throw Error('Vérifie le capital, les frais et les réglages.');
  if (cfg.strategy === 'rsi' && !(p.period >= 2 && p.buyBelow > 0 && p.buyBelow < p.sellAbove && p.sellAbove < 100)) throw Error('RSI : il faut 0 < seuil d’achat < seuil de vente < 100.');
  if (cfg.strategy === 'ema' && !(p.fast >= 2 && p.fast < p.slow)) throw Error('EMA : la moyenne rapide doit être plus courte que la lente.');
  if (cfg.strategy === 'dca' && !(p.every >= 1 && p.amount > 0 && p.takeProfit >= 0)) throw Error('DCA : intervalle et montant doivent être positifs.');
  if (cfg.strategy === 'grid' && !(p.step > 0 && p.step < 50 && p.levels >= 1 && p.levels <= 50)) throw Error('Grille : écart entre 0 et 50 %, 1 à 50 paliers.');
  return p;
}

export function newBot(capital) {
  return {cash: capital, qty: 0, cost: 0, lots: [], trades: [], fees: 0, lastTime: 0, ref: null, ticks: 0};
}

export const equityOf = (state, price) => state.cash + state.qty * price;

function buy(state, candle, amount, fee, reason) {
  const spend = Math.min(amount, state.cash);
  if (!(spend > 0.01)) return null;
  const qty = spend * (1 - fee) / candle.close;
  state.cash -= spend; state.qty += qty; state.cost += spend; state.fees += spend * fee;
  state.ref = candle.close;
  const trade = {t: candle.closeTime, side: 'buy', price: candle.close, qty, value: spend, reason};
  state.trades.push(trade);
  return {trade, qty};
}

function sell(state, candle, qty, fee, reason) {
  qty = Math.min(qty, state.qty);
  if (!(qty > 0)) return null;
  const gross = qty * candle.close, net = gross * (1 - fee);
  const basis = state.qty > 0 ? state.cost * qty / state.qty : 0;
  state.cash += net; state.qty -= qty; state.cost -= basis; state.fees += gross * fee;
  if (state.qty < 1e-12) { state.qty = 0; state.cost = 0; }
  state.ref = candle.close;
  const trade = {t: candle.closeTime, side: 'sell', price: candle.close, qty, value: net, pnl: net - basis, reason};
  state.trades.push(trade);
  return trade;
}

const fmt = v => v.toLocaleString('fr-FR', {maximumFractionDigits: v >= 100 ? 0 : v >= 1 ? 2 : 6});

// Processes every candle closed after state.lastTime. Returns the trades made in this call.
export function runBot(state, candles, cfg) {
  const p = validateConfig(cfg), fee = cfg.fee / 100;
  const closes = candles.map(c => c.close);
  const rsi = cfg.strategy === 'rsi' ? rsiSeries(closes, p.period) : null;
  const fast = cfg.strategy === 'ema' ? emaSeries(closes, p.fast) : null;
  const slow = cfg.strategy === 'ema' ? emaSeries(closes, p.slow) : null;
  const start = warmup(cfg), made = [];
  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    if (c.closeTime <= state.lastTime) continue;
    state.lastTime = c.closeTime;
    let t = null;
    if (cfg.strategy === 'rsi') {
      const r = rsi[i];
      if (r === null) continue;
      if (state.qty === 0 && r < p.buyBelow) t = buy(state, c, state.cash, fee, `RSI ${r.toFixed(1)} sous ${p.buyBelow} : achat`)?.trade;
      else if (state.qty > 0 && r > p.sellAbove) t = sell(state, c, state.qty, fee, `RSI ${r.toFixed(1)} au-dessus de ${p.sellAbove} : vente`);
    } else if (cfg.strategy === 'ema') {
      if (fast[i - 1] === null || slow[i - 1] === null) continue;
      const up = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i], down = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
      if (up && state.qty === 0) t = buy(state, c, state.cash, fee, `EMA ${p.fast} passe au-dessus de l’EMA ${p.slow} : achat`)?.trade;
      else if (down && state.qty > 0) t = sell(state, c, state.qty, fee, `EMA ${p.fast} passe sous l’EMA ${p.slow} : vente`);
    } else if (cfg.strategy === 'dca') {
      const avg = state.qty > 0 ? state.cost / state.qty : 0;
      if (p.takeProfit > 0 && state.qty > 0 && c.close >= avg * (1 + p.takeProfit / 100)) {
        t = sell(state, c, state.qty, fee, `+${p.takeProfit} % sur le prix moyen (${fmt(avg)} $) : prise de profit`);
      } else if (state.ticks % p.every === 0) {
        t = buy(state, c, p.amount, fee, `Achat programmé de ${fmt(Math.min(p.amount, state.cash))} $`)?.trade;
      }
      state.ticks++;
    } else if (cfg.strategy === 'grid') {
      const lot = cfg.capital / p.levels;
      const sellable = state.lots.filter(l => c.close >= l.price * (1 + p.step / 100));
      if (sellable.length) {
        const qty = sellable.reduce((s, l) => s + l.qty, 0);
        state.lots = state.lots.filter(l => !sellable.includes(l));
        t = sell(state, c, qty, fee, `Rebond de +${p.step} % sur ${sellable.length} palier(s) : vente`);
      } else if (state.lots.length < p.levels && (state.ref === null || c.close <= state.ref * (1 - p.step / 100))) {
        const done = buy(state, c, lot, fee, state.ref === null ? 'Ouverture de la grille : premier palier' : `Baisse de −${p.step} % : achat d’un palier`);
        if (done) { state.lots.push({price: c.close, qty: done.qty}); t = done.trade; }
      }
    }
    if (t) made.push(t);
  }
  return made;
}

// Replays the strategy over the given history from a fresh portfolio, next to buy-and-hold.
export function simulate(candles, cfg) {
  validateConfig(cfg);
  const state = newBot(cfg.capital), equity = [];
  const start = warmup(cfg);
  if (candles.length <= start) throw Error('Historique trop court pour cette stratégie.');
  const fee = cfg.fee / 100, entry = candles[start].close, holdQty = cfg.capital * (1 - fee) / entry;
  for (let i = start; i < candles.length; i++) {
    runBot(state, candles.slice(0, i + 1), cfg);
    equity.push({t: candles[i].closeTime, bot: equityOf(state, candles[i].close), hold: holdQty * candles[i].close});
  }
  return {state, equity, stats: stats(state, equity, cfg.capital)};
}

export function stats(state, equity, capital) {
  const last = equity.at(-1);
  let peak = -Infinity, maxDd = 0;
  for (const e of equity) { peak = Math.max(peak, e.bot); maxDd = Math.max(maxDd, (peak - e.bot) / peak); }
  const sells = state.trades.filter(t => t.side === 'sell');
  return {
    final: last.bot, pct: (last.bot / capital - 1) * 100, holdPct: (last.hold / capital - 1) * 100,
    trades: state.trades.length, sells: sells.length,
    winRate: sells.length ? sells.filter(t => t.pnl > 0).length / sells.length * 100 : null,
    maxDrawdown: maxDd * 100, fees: state.fees,
  };
}
