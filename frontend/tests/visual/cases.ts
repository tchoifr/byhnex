import type { Page } from '@playwright/test'

export type Device = 'desktop' | 'mobile'

export interface Step {
  label: string
  run?: (page: Page) => Promise<void>
  /** Screen sizes where the step is played and compared (default: desktop only). */
  on?: Device[]
}

export interface PageCase {
  /** Name of the recorded network fixture: fixtures/<name>.har */
  name: string
  path: string
  steps: Step[]
}

export const stepRunsOn = (step: Step, device: Device) => (step.on ?? ['desktop']).includes(device)

/** Migrated pages and the interactions compared with the original version. Add one entry per migrated page. */
export const CASES: PageCase[] = [
  {
    name: 'home',
    path: '/index.html',
    steps: [
      { label: 'chargement', on: ['desktop', 'mobile'] },
      { label: 'filtre-historique-mobile', run: (p) => p.click('[data-filter="Historique"]'), on: ['mobile'] },
      { label: 'recherche', run: (p) => p.fill('#tool-search', 'bot') },
      { label: 'aucun-resultat', run: (p) => p.fill('#tool-search', 'zzz') },
      { label: 'filtre-strategie', run: async (p) => { await p.fill('#tool-search', ''); await p.click('[data-filter="Stratégie"]') } },
      { label: 'favori', run: async (p) => { await p.click('[data-favorite="bot.html"]'); await p.click('[data-filter="Favoris"]') } },
      { label: 'raccourci-recherche', run: async (p) => { await p.click('[data-filter="Tous"]'); await p.locator('body').press('/'); await p.keyboard.type('cy') } },
      { label: 'echap', run: (p) => p.keyboard.press('Escape') },
    ],
  },
]
