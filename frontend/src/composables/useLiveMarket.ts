import { onMounted, onUnmounted, ref, shallowRef } from 'vue'
// Shared with the pages not migrated yet; moves into src/ once they all use it from here.
import { LiveMarket } from '../../../market-data.js'

export interface Quote {
  price: number
  change: number
}

export interface LiveSnapshot {
  quotes: Record<string, Quote | undefined>
  source: string
  quote: string
  status: string
  lastUpdate: number | null
}

/** Live BTC/SOL quotes from the market feed, plus a clock ticking every second for the data age. */
export function useLiveMarket() {
  const market = new LiveMarket()
  const snapshot = shallowRef<LiveSnapshot | null>(null)
  const now = ref(Date.now())
  let clock: ReturnType<typeof setInterval> | undefined

  const onUpdate = () => {
    snapshot.value = {
      quotes: { ...(market.quotes as Record<string, Quote | undefined>) },
      source: String(market.provider),
      quote: String(market.quote),
      status: String(market.status),
      lastUpdate: market.lastUpdate ?? null,
    }
    now.value = Date.now()
  }
  const onOnline = () => void market.refresh(true).then(() => market.connect())
  const onOffline = () => {
    market.status = 'stale'
    market.emit()
  }
  const onPageHide = () => market.close()
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) void market.start()
  }

  onMounted(() => {
    market.addEventListener('update', onUpdate)
    void market.start()
    clock = setInterval(() => (now.value = Date.now()), 1000)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
  })
  onUnmounted(() => {
    clearInterval(clock)
    market.removeEventListener('update', onUpdate)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    market.close()
  })

  return { snapshot, now }
}

/** Texts of the live strip, as computed by the original page. */
export function liveStripState(s: LiveSnapshot, now: number) {
  const age = s.lastUpdate ? Math.max(0, Math.floor((now - s.lastUpdate) / 1000)) : null
  const stale = age === null || age > 90 || ['stale', 'unavailable'].includes(s.status)
  return {
    stale,
    source: (stale ? 'FLUX EN ATTENTE' : s.status === 'live' ? 'EN DIRECT' : 'ACTUALISATION 30 s') + ' · ' + s.source,
    age: age === null ? 'En attente du flux' : `Dernière mise à jour : ${age} s`,
  }
}
