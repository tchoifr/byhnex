<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { useFavorites } from '@/composables/useFavorites'
import { FILTERS, TOOLS, isToolVisible, toolCountLabel, type ToolFilter } from '../tools'
import ToolIcon from './ToolIcon.vue'

const query = ref('')
const filter = ref<ToolFilter>('Tous')
const { favorites, toggle } = useFavorites()
const search = useTemplateRef<HTMLInputElement>('search')

const visible = computed(() => new Set(TOOLS.filter((t) => isToolVisible(t, filter.value, query.value, favorites.value)).map((t) => t.file)))
const isFavorite = (file: string) => favorites.value.includes(file)

// "/" focuses the search, Escape clears it.
function onKeydown(e: KeyboardEvent): void {
  const active = document.activeElement
  if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(active?.tagName ?? '')) {
    e.preventDefault()
    search.value?.focus()
  }
  if (e.key === 'Escape' && active === search.value) {
    query.value = ''
    search.value?.blur()
  }
}
onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <section class="bn-library"><div class="bn-library-title"><div><h2>Tes outils</h2><span id="tool-count">{{ toolCountLabel(visible.size) }}</span></div><span class="w3-swipe-hint" aria-hidden="true">Glisse <i>→</i></span><label class="bn-search"><span>⌕</span><input ref="search" v-model="query" type="search" id="tool-search" placeholder="Rechercher un outil…" aria-label="Rechercher un outil"><kbd>/</kbd></label></div><div class="bn-filters" role="group" aria-label="Filtrer les outils"><button v-for="f in FILTERS" :key="f" :class="{ selected: filter === f }" :data-filter="f" @click="filter = f"><template v-if="f === 'Tous'">Tous <span>{{ TOOLS.length }}</span></template><template v-else-if="f === 'Favoris'">☆ Favoris</template><template v-else>{{ f }}</template></button></div><div class="bn-tool-grid w3-rail"><article v-for="tool in TOOLS" :key="tool.file" class="bn-tool-card" :data-category="tool.category" :data-title="tool.title" :data-file="tool.file" :hidden="!visible.has(tool.file)"><div class="bn-card-top"><div class="bn-tool-icon" :class="'bn-color-' + tool.color"><ToolIcon :name="tool.icon" /></div><button class="bn-favorite" :data-favorite="tool.file" :aria-label="(isFavorite(tool.file) ? 'Retirer des favoris : ' : 'Ajouter aux favoris : ') + tool.title" :aria-pressed="isFavorite(tool.file)" @click="toggle(tool.file)">{{ isFavorite(tool.file) ? '★' : '☆' }}</button></div><a :href="tool.file" class="bn-tool-link"><span class="bn-card-category">{{ tool.categoryLabel }}</span><h3>{{ tool.title }}<span>↗</span></h3><p>{{ tool.description }}</p></a><div class="bn-card-meta"><span></span>{{ tool.meta }}</div></article></div><div class="bn-empty" id="empty-tools" :hidden="visible.size !== 0">Aucun outil ne correspond. Essaie un autre filtre.</div></section>
</template>
