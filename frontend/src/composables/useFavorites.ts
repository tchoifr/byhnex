import { ref } from 'vue'

export const FAVORITES_KEY = 'byhnex-favorites'

function read(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? 'null')
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** Favorite tools, kept in localStorage (synced with the account when signed in). */
export function useFavorites() {
  const favorites = ref<string[]>(read())

  function toggle(file: string): void {
    favorites.value = favorites.value.includes(file) ? favorites.value.filter((f) => f !== file) : [...favorites.value, file]
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites.value))
    } catch {
      /* Storage unavailable: the favorite stays for this visit only. */
    }
  }

  return { favorites, toggle }
}
