<script setup lang="ts">
import type { ToolIconName } from '../tools'

defineProps<{ name: ToolIconName }>()
</script>

<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-if="name === 'signals'" d="M4 13h3l3-8 4 14 3-6h3" /><path v-else-if="name === 'chart'" d="M3 3v18h18 M7 15V7 M5 9h4v4H5 M13 18V6 M11 10h4v5h-4 M19 13V3 M17 6h4v4h-4" /><template v-else-if="name === 'bot'"><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 8V5 M9.5 13h.01 M14.5 13h.01 M9.5 16.2h5 M3 13v2 M21 13v2" /><circle cx="12" cy="4" r="1" /></template><path v-else d="M2 20a10 10 0 0 1 20 0 M6 20a6 6 0 0 1 12 0 M10 20a2 2 0 0 1 4 0" /></svg>
</template>
