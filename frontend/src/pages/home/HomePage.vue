<script setup lang="ts">
import LiveStrip from './components/LiveStrip.vue'
import MarketPulse from './components/MarketPulse.vue'
import ToolLibrary from './components/ToolLibrary.vue'
</script>

<template>
  <header class="bn-topbar"><div><a class="bn-mobile-brand" href="index.html">byhnex.</a><span>Workspace</span><b>/</b>Vue d’ensemble</div><div class="bn-topbar-right"><span class="bn-private">◉ Sans compte · données sur ton appareil</span><a class="bn-button" href="accumulation.html">Ouvrir le graphique ↗</a></div></header>
  <div class="bn-content">
    <section class="w3-hero"><div><p class="bn-eyebrow">Analyser · Tester · Accumuler</p><h1>Ton cockpit <span>crypto</span>.</h1><p class="bn-intro">Cours en direct, signaux et simulations réunis au même endroit. Rien n’est acheté ni vendu pour toi.</p></div><LiveStrip /></section>
    <ol class="w3-steps w3-rail" aria-label="Par où commencer"><li><a href="#pouls"><span>Prends le pouls<small>Humeur et dominance du marché</small></span></a></li><li><a href="signaux-crypto.html"><span>Lis les signaux<small>Qui est en zone d’achat ou de vente</small></span></a></li><li><a href="bot.html"><span>Teste un bot<small>Rejoue une stratégie en argent fictif</small></span></a></li></ol>
    <MarketPulse />
    <ToolLibrary />
    <section class="bn-bottom-note"><span>◈</span><div><b>Tu gardes la main.</b><p>Les analyses décrivent le marché, les simulations explorent des hypothèses. Les résultats futurs restent incertains. Pas un conseil financier.</p></div><a href="accumulation.html">Préparer un scénario →</a></section><footer class="bn-footer"><span>BYHNEX <i>Ton marché. Ta méthode.</i></span><span>CoinGecko · Binance · CoinCodex · Alternative.me</span><span>Les flux externes dépendent de leur disponibilité.</span></footer>
  </div>
</template>
