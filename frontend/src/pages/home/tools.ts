// Tool cards of the home page, in display order.
export type ToolCategory = 'Marché' | 'Stratégie' | 'Historique'
export type ToolIconName = 'signals' | 'chart' | 'bot' | 'rainbow'

export interface Tool {
  file: string
  title: string
  category: ToolCategory
  /** Label shown on the card; may add a mention to the category. */
  categoryLabel: string
  description: string
  meta: string
  icon: ToolIconName
  color: number
}

export const TOOLS: readonly Tool[] = [
  {
    file: 'signaux-crypto.html',
    title: 'Signaux & positionnement',
    category: 'Marché',
    categoryLabel: 'Marché',
    description: 'RSI, tendance, funding et ratio long/short du top 20, dans un seul tableau en direct.',
    meta: 'Binance · temps réel',
    icon: 'signals',
    color: 1,
  },
  {
    file: 'accumulation.html',
    title: 'Graphiques & accumulation',
    category: 'Stratégie',
    categoryLabel: 'Stratégie',
    description: 'Trace tes niveaux, simule un cycle vente → rachat et compte les tokens gagnés.',
    meta: 'Simulation locale · aucun ordre réel',
    icon: 'chart',
    color: 6,
  },
  {
    file: 'bot.html',
    title: 'Bot virtuel',
    category: 'Stratégie',
    categoryLabel: 'Stratégie · nouveau',
    description: 'Choisis une stratégie, rejoue-la sur l’historique, puis laisse le bot trader en argent fictif.',
    meta: 'RSI · EMA · DCA · grille',
    icon: 'bot',
    color: 4,
  },
  {
    file: 'cycles.html',
    title: 'Cycles & Rainbow',
    category: 'Historique',
    categoryLabel: 'Historique',
    description: 'Le prix dans ses bandes de couleur et les mois qui ont souri au Bitcoin depuis 2014.',
    meta: 'Rainbow top 10 · saisonnalité BTC',
    icon: 'rainbow',
    color: 5,
  },
]

export const FILTERS = ['Tous', 'Marché', 'Stratégie', 'Historique', 'Favoris'] as const
export type ToolFilter = (typeof FILTERS)[number]

/** Text searched by the search field: everything written on the card, in page order. */
export function searchableText(tool: Tool, favorite: boolean): string {
  return (favorite ? '★' : '☆') + tool.categoryLabel + tool.title + '↗' + tool.description + tool.meta
}

export function isToolVisible(tool: Tool, filter: ToolFilter, query: string, favorites: readonly string[]): boolean {
  const favorite = favorites.includes(tool.file)
  const inFilter = filter === 'Tous' || (filter === 'Favoris' && favorite) || filter === tool.category
  return inFilter && searchableText(tool, favorite).toLocaleLowerCase('fr').includes(query.trim().toLocaleLowerCase('fr'))
}

export function toolCountLabel(count: number): string {
  return `${count} outil${count > 1 ? 's' : ''} pour voir plus loin`
}
