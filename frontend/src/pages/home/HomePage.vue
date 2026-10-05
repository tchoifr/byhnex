<script setup lang="ts">
import LiveStrip from './components/LiveStrip.vue'
import MarketPulse from './components/MarketPulse.vue'
import ToolLinks from './components/ToolLinks.vue'
</script>

<template>
  <header class="bn-topbar"><div><a class="bn-mobile-brand" href="index.html">byhnex.</a><span>Workspace</span><b>/</b>Vue d’ensemble</div><div class="bn-topbar-right"><a class="bn-button" href="accumulation.html">Ouvrir le graphique ↗</a></div></header>
  <div class="bn-content home-fit">
    <section class="w3-hero"><div><h1>Ton cockpit <span>crypto</span>.</h1></div><LiveStrip /></section>
    <MarketPulse />
    <ToolLinks />
    <p class="home-foot">Analyses et argent fictif uniquement · pas un conseil financier</p>
  </div>
</template>
