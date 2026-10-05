<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { liveStripState, useLiveMarket, type Quote } from '@/composables/useLiveMarket'

type Asset = 'BTC' | 'SOL'

const { snapshot, now } = useLiveMarket()
const state = computed(() => (snapshot.value ? liveStripState(snapshot.value, now.value) : null))

// A price stays displayed until a newer valid one arrives, as on the original page.
const shown = reactive<Partial<Record<Asset, { price: string; change: string; up: boolean }>>>({})
watch(snapshot, (s) => {
  if (!s) return
  for (const code of ['BTC', 'SOL'] as const) {
    const q: Quote | undefined = s.quotes[code]
    if (!q || !(q.price > 0)) continue
    shown[code] = {
      price: q.price.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ' + s.quote,
      change: (q.change >= 0 ? '+' : '') + q.change.toFixed(2) + ' %',
      up: q.change >= 0,
    }
  }
})
const changeStyle = (code: Asset) => {
  const q = shown[code]
  return q ? { color: q.up ? 'var(--w3-up)' : 'var(--w3-down)' } : undefined
}
</script>

<!-- The two tickers are written out (no v-for) so the DOM matches the original page node for node. -->
<template>
  <section class="bn-live-strip" :class="{ 'is-stale': state?.stale }" aria-label="Cours de marché" aria-live="polite"><div class="w3-live-head"><span class="bn-status-dot"></span><b id="live-source">{{ state ? state.source : 'Connexion aux marchés…' }}</b><small id="live-age">{{ state ? state.age : 'En attente du flux' }}</small></div><div class="w3-ticker"><i class="w3-coin btc" aria-hidden="true">₿</i><div><span>Bitcoin</span><b id="live-btc">{{ shown.BTC?.price ?? '—' }}</b></div><small id="live-btc-change" :style="changeStyle('BTC')">{{ shown.BTC?.change ?? '—' }}</small></div><div class="w3-ticker"><i class="w3-coin sol" aria-hidden="true">◎</i><div><span>Solana</span><b id="live-sol">{{ shown.SOL?.price ?? '—' }}</b></div><small id="live-sol-change" :style="changeStyle('SOL')">{{ shown.SOL?.change ?? '—' }}</small></div></section>
</template>
