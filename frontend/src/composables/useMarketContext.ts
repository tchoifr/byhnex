import { onMounted, onUnmounted, ref } from 'vue'
import { fetchGlobal, fetchSentiment, type GlobalMarket, type Sentiment } from '@/services/marketContext'

const REFRESH = 5 * 60_000

/** Global market and sentiment, refreshed every 5 minutes and when the connection comes back. */
export function useMarketContext() {
  const global = ref<GlobalMarket | null>(null)
  const globalFailed = ref(false)
  const sentiment = ref<Sentiment | null>(null)
  const sentimentFailed = ref(false)

  async function updateGlobal(): Promise<void> {
    try {
      global.value = await fetchGlobal()
      globalFailed.value = false
    } catch {
      globalFailed.value = true
    }
  }

  async function updateSentiment(): Promise<void> {
    try {
      sentiment.value = await fetchSentiment()
      sentimentFailed.value = false
    } catch {
      sentimentFailed.value = true
    }
  }

  const refresh = () => Promise.allSettled([updateGlobal(), updateSentiment()])
  const onOnline = () => void refresh()
  let timer: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    void refresh()
    timer = setInterval(() => void refresh(), REFRESH)
    window.addEventListener('online', onOnline)
  })
  onUnmounted(() => {
    clearInterval(timer)
    window.removeEventListener('online', onOnline)
  })

  return { global, globalFailed, sentiment, sentimentFailed }
}
