<script setup lang="ts">
import { computed } from 'vue'
import { useMarketContext } from '@/composables/useMarketContext'
import { formatCap, formatPercent, sentimentLabel } from '@/services/marketContext'

const { global, globalFailed, sentiment, sentimentFailed } = useMarketContext()

const capAge = computed(() => {
  if (globalFailed.value) return 'CoinGecko indisponible · Réessai automatique'
  if (!global.value) return 'Connexion à CoinGecko…'
  return 'CoinGecko · ' + global.value.updatedAt.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
})
const dominanceAge = computed(() => {
  if (globalFailed.value) return 'Données non actualisées'
  if (!global.value) return 'CoinGecko · actualisation 5 min'
  return 'Données source · ' + global.value.updatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
})
const sentimentAge = computed(() => {
  if (sentimentFailed.value) return 'Source indisponible · '
  if (!sentiment.value) return 'Indice quotidien · '
  return 'Indice du ' + sentiment.value.date.toLocaleDateString('fr-FR') + ' · '
})
const dominanceWidth = computed(() => (global.value ? Math.min(100, Math.max(0, global.value.dominance)) + '%' : null))
</script>

<template>
  <section class="w3-pulse w3-rail" id="pouls" aria-label="Pouls du marché"><article class="w3-tile w3-mood"><span class="w3-label">Humeur du marché</span><div class="w3-gauge" id="fg-gauge" aria-hidden="true" :style="sentiment ? { '--v': String(sentiment.value) } : undefined"><svg viewBox="0 0 120 76"><defs><linearGradient id="fg-arc" x1="0" x2="1"><stop offset="0" stop-color="#ff5c7c" /><stop offset=".5" stop-color="#ffc861" /><stop offset="1" stop-color="#2cf5a3" /></linearGradient></defs><path d="M10 60a50 50 0 0 1 100 0" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="10" stroke-linecap="round" /><path d="M10 60a50 50 0 0 1 100 0" fill="none" stroke="url(#fg-arc)" stroke-width="10" stroke-linecap="round" opacity=".9" /><g class="needle"><path d="M60 60V18" stroke="#eef0ff" stroke-width="3" stroke-linecap="round" /><circle cx="60" cy="60" r="6" fill="#eef0ff" /></g><text x="4" y="75" font-size="8" fill="#8f95bd">Peur</text><text x="116" y="75" font-size="8" fill="#8f95bd" text-anchor="end">Euphorie</text></svg></div><b id="fear-greed">{{ sentiment ? sentimentLabel(sentiment) : '—' }}</b><small id="fear-greed-age">{{ sentimentAge }}<a href="https://alternative.me/crypto/fear-and-greed-index/" target="_blank" rel="noopener">Alternative.me ↗</a></small></article><article class="w3-tile"><span class="w3-label">Dominance Bitcoin</span><b id="btc-dominance">{{ global ? formatPercent(global.dominance) : '—' }}</b><div class="w3-meter" aria-hidden="true"><i id="dominance-bar" :style="dominanceWidth ? { width: dominanceWidth } : undefined"></i></div><small id="dominance-age">{{ dominanceAge }}</small></article><article class="w3-tile"><span class="w3-label">Capitalisation globale</span><b id="global-cap">{{ global ? formatCap(global.cap) : '—' }}</b><small id="global-cap-age">{{ capAge }}</small></article></section>
</template>
