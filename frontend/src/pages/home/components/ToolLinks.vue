<script setup lang="ts">
import { TOOLS } from '../tools'
import ToolIcon from './ToolIcon.vue'
</script>

<template>
  <nav class="home-tools" aria-label="Outils"><a v-for="tool in TOOLS" :key="tool.file" class="home-tool" :href="tool.file"><div class="bn-tool-icon" :class="'bn-color-' + tool.color"><ToolIcon :name="tool.icon" /></div><span><small>{{ tool.category }}</small><b>{{ tool.title }}</b></span><em aria-hidden="true">↗</em></a></nav>
</template>
