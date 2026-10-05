<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { liveStripState, useLiveMarket, type Quote } from '@/composables/useLiveMarket'

const ASSETS = [
  { code: 'BTC', name: 'Bitcoin', coin: 'btc', symbol: '₿' },
  { code: 'SOL', name: 'Solana', coin: 'sol', symbol: '◎' },
] as const

const { snapshot, now } = useLiveMarket()
const state = computed(() => (snapshot.value ? liveStripState(snapshot.value, now.value) : null))

// A price stays displayed until a newer valid one arrives, as on the original page.
const shown = reactive<Record<string, { price: string; change: string; up: boolean } | undefined>>({})
watch(snapshot, (s) => {
  if (!s) return
  for (const { code } of ASSETS) {
    const q: Quote | undefined = s.quotes[code]
    if (!q || !(q.price > 0)) continue
    shown[code] = {
      price: q.price.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' ' + s.quote,
      change: (q.change >= 0 ? '+' : '') + q.change.toFixed(2) + ' %',
      up: q.change >= 0,
    }
  }
})
</script>

<template>
  <section class="bn-live-strip" :class="{ 'is-stale': state?.stale }" aria-label="Cours de marché" aria-live="polite"><div class="w3-live-head"><span class="bn-status-dot"></span><b id="live-source">{{ state ? state.source : 'Connexion aux marchés…' }}</b><small id="live-age">{{ state ? state.age : 'En attente du flux' }}</small></div><div v-for="asset in ASSETS" :key="asset.code" class="w3-ticker"><i class="w3-coin" :class="asset.coin" aria-hidden="true">{{ asset.symbol }}</i><div><span>{{ asset.name }}</span><b :id="'live-' + asset.coin">{{ shown[asset.code]?.price ?? '—' }}</b></div><small :id="'live-' + asset.coin + '-change'" :style="shown[asset.code] ? { color: shown[asset.code]?.up ? 'var(--w3-up)' : 'var(--w3-down)' } : undefined">{{ shown[asset.code]?.change ?? '—' }}</small></div></section>
</template>
