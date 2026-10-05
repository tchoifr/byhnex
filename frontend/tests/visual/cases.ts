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
      { label: 'focus-clavier', run: async (p) => { await p.locator('body').press('Tab'); await p.locator('body').press('Tab') }, on: ['desktop'] },
    ],
  },
]
