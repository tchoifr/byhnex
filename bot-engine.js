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
// With a log array, every candle that ends without an order is noted too, so the live bot shows each decision it takes.
export function runBot(state, candles, cfg, log = null) {
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
    let t = null, note = '';
    if (cfg.strategy === 'rsi') {
      const r = rsi[i];
      if (r === null) continue;
      if (state.qty === 0 && r < p.buyBelow) t = buy(state, c, state.cash, fee, `RSI ${r.toFixed(1)} sous ${p.buyBelow} : achat`)?.trade;
      else if (state.qty > 0 && r > p.sellAbove) t = sell(state, c, state.qty, fee, `RSI ${r.toFixed(1)} au-dessus de ${p.sellAbove} : vente`);
      note = state.qty > 0 ? `RSI ${r.toFixed(0)} : on garde, vente au-dessus de ${p.sellAbove}` : `RSI ${r.toFixed(0)} : pas d’achat, il faut passer sous ${p.buyBelow}`;
    } else if (cfg.strategy === 'ema') {
      if (fast[i - 1] === null || slow[i - 1] === null) continue;
      const up = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i], down = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
      if (up && state.qty === 0) t = buy(state, c, state.cash, fee, `EMA ${p.fast} passe au-dessus de l’EMA ${p.slow} : achat`)?.trade;
      else if (down && state.qty > 0) t = sell(state, c, state.qty, fee, `EMA ${p.fast} passe sous l’EMA ${p.slow} : vente`);
      note = `EMA ${p.fast} ${fast[i] > slow[i] ? 'au-dessus de' : 'sous'} l’EMA ${p.slow}, pas de croisement : ${state.qty > 0 ? 'on garde' : 'pas d’achat'}`;
    } else if (cfg.strategy === 'dca') {
      const avg = state.qty > 0 ? state.cost / state.qty : 0;
      if (p.takeProfit > 0 && state.qty > 0 && c.close >= avg * (1 + p.takeProfit / 100)) {
        t = sell(state, c, state.qty, fee, `+${p.takeProfit} % sur le prix moyen (${fmt(avg)} $) : prise de profit`);
      } else if (state.ticks % p.every === 0) {
        t = buy(state, c, p.amount, fee, `Achat programmé de ${fmt(Math.min(p.amount, state.cash))} $`)?.trade;
      }
      state.ticks++;
      const left = (p.every - state.ticks % p.every) % p.every;
      note = state.cash <= 0.01 ? 'Capital entièrement investi' : `Prochain achat ${left ? `dans ${left} bougie${left > 1 ? 's' : ''}` : 'à la prochaine clôture'}`;
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
      note = `Prix ${fmt(c.close)} $ : aucun palier touché (${state.lots.length}/${p.levels} achetés)`;
    }
    if (t) made.push(t);
    else if (log && note) log.push({t: c.closeTime, price: c.close, note});
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

// Splits the capital evenly between several cryptos (one independent bot each) and adds the portfolios up.
// The combined curve only keeps the candle times every crypto has, so the totals always compare like with like.
export function simulateMany(seriesByAsset, cfg) {
  validateConfig(cfg);
  const names = Object.keys(seriesByAsset);
  if (!names.length) throw Error('Choisis au moins une crypto.');
  const sub = {...cfg, capital: cfg.capital / names.length}, assets = {};
  for (const a of names) assets[a] = simulate(seriesByAsset[a], sub);
  const maps = names.map(a => new Map(assets[a].equity.map(e => [e.t, e])));
  const equity = assets[names[0]].equity.map(e => e.t).filter(t => maps.every(m => m.has(t)))
    .map(t => ({t, bot: maps.reduce((s, m) => s + m.get(t).bot, 0), hold: maps.reduce((s, m) => s + m.get(t).hold, 0)}));
  if (!equity.length) throw Error('Pas assez d’historique commun entre ces cryptos.');
  const trades = names.flatMap(a => assets[a].state.trades.map(t => ({...t, asset: a}))).sort((x, y) => x.t - y.t);
  const fees = names.reduce((s, a) => s + assets[a].state.fees, 0);
  return {assets, equity, trades, stats: stats({trades, fees}, equity, cfg.capital)};
}

// Plain-language reading of what the bot sees right now and what would make it act on the next close.
export function readNow(state, candles, cfg) {
  const p = validateConfig(cfg), closes = candles.map(c => c.close), last = closes.at(-1);
  const holding = state.qty > 0;
  if (cfg.strategy === 'rsi') {
    const r = rsiSeries(closes, p.period).at(-1);
    if (r === null || r === undefined) return {value: 'RSI —', wait: 'Pas encore assez de bougies.'};
    return {value: `RSI ${r.toFixed(0)}`, gauge: r / 100, wait: holding ? `vend au-dessus de ${p.sellAbove}` : `achète sous ${p.buyBelow}`};
  }
  if (cfg.strategy === 'ema') {
    const f = emaSeries(closes, p.fast).at(-1), s = emaSeries(closes, p.slow).at(-1);
    if (f === null || s === null) return {value: 'EMA —', wait: 'Pas encore assez de bougies.'};
    const gap = (f / s - 1) * 100, up = f > s;
    return {value: `EMA ${up ? '▲' : '▼'} ${Math.abs(gap).toFixed(2).replace('.', ',')} %`,
      wait: holding ? `vend si l’EMA ${p.fast} repasse sous l’EMA ${p.slow}` : up ? `tendance déjà haussière : achète au prochain croisement vers le haut` : `achète quand l’EMA ${p.fast} passe au-dessus de l’EMA ${p.slow}`};
  }
  if (cfg.strategy === 'dca') {
    const left = (p.every - state.ticks % p.every) % p.every;
    if (state.cash <= 0.01) return {value: 'Capital investi', wait: p.takeProfit > 0 ? `vend à +${p.takeProfit} % sur le prix moyen` : 'plus rien à acheter'};
    return {value: left === 0 ? 'Achat à la prochaine clôture' : `Achat dans ${left} bougie${left > 1 ? 's' : ''}`, wait: `${fmt(Math.min(p.amount, state.cash))} $ par achat`};
  }
  const lots = state.lots.length, buyAt = state.ref === null ? last : state.ref * (1 - p.step / 100);
  const sellAt = lots ? Math.min(...state.lots.map(l => l.price)) * (1 + p.step / 100) : null;
  return {value: `${lots}/${p.levels} paliers achetés`, wait: (lots < p.levels ? `achète sous ${fmt(buyAt)} $` : 'grille pleine') + (sellAt ? ` · vend au-dessus de ${fmt(sellAt)} $` : '')};
}
