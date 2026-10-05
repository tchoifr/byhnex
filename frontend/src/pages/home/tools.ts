// Tool links of the home page, in display order.
export type ToolIconName = 'signals' | 'chart' | 'bot' | 'rainbow'

export interface Tool {
  file: string
  title: string
  /** Small label above the title. */
  category: string
  icon: ToolIconName
  color: number
}

export const TOOLS: readonly Tool[] = [
  { file: 'signaux-crypto.html', title: 'Signaux & positionnement', category: 'Marché', icon: 'signals', color: 1 },
  { file: 'accumulation.html', title: 'Graphiques & accumulation', category: 'Stratégie', icon: 'chart', color: 6 },
  { file: 'bot.html', title: 'Bot virtuel', category: 'Stratégie · nouveau', icon: 'bot', color: 4 },
  { file: 'cycles.html', title: 'Cycles & Rainbow', category: 'Historique', icon: 'rainbow', color: 5 },
]
