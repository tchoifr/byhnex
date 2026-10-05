// Market context of the home page: global capitalisation (CoinGecko) and Fear & Greed index (Alternative.me).

export interface GlobalMarket {
  /** Total capitalisation in USD. */
  cap: number
  /** Bitcoin dominance in percent. */
  dominance: number
  updatedAt: Date
}

export interface Sentiment {
  value: number
  classification: string
  date: Date
}

const TIMEOUT = 10_000

const FEAR_GREED_LABELS: Record<string, string> = {
  'Extreme Fear': 'Peur extrême',
  Fear: 'Peur',
  Neutral: 'Neutre',
  Greed: 'Optimisme',
  'Extreme Greed': 'Euphorie',
}

export function parseGlobal(body: unknown): GlobalMarket {
  const data = (body as { data?: { total_market_cap?: { usd?: unknown }; market_cap_percentage?: { btc?: unknown }; updated_at?: unknown } }).data
  const cap = Number(data?.total_market_cap?.usd)
  const dominance = Number(data?.market_cap_percentage?.btc)
  if (!Number.isFinite(cap) || !Number.isFinite(dominance)) throw new Error('Réponse CoinGecko invalide')
  return { cap, dominance, updatedAt: new Date(Number(data?.updated_at) * 1000) }
}

export function parseSentiment(body: unknown): Sentiment {
  const d = (body as { data?: { value?: unknown; value_classification?: unknown; timestamp?: unknown }[] }).data?.[0]
  const value = Number(d?.value)
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('Réponse Alternative.me invalide')
  return { value, classification: String(d?.value_classification), date: new Date(Number(d?.timestamp) * 1000) }
}

export function sentimentLabel(s: Sentiment): string {
  return `${s.value} / 100 · ${FEAR_GREED_LABELS[s.classification] ?? s.classification}`
}

export function formatCap(cap: number): string {
  return (cap / 1e12).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' T $'
}

export function formatPercent(value: number): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' %'
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export const fetchGlobal = async () => parseGlobal(await getJson('https://api.coingecko.com/api/v3/global'))
export const fetchSentiment = async () => parseSentiment(await getJson('https://api.alternative.me/fng/?limit=1'))
