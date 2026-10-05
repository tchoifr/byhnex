import { test } from '@playwright/test'
import { LEGACY_URL } from '../../playwright.config'
import { CASES } from './cases'
import { prepare, settle } from './harness'

// Records the external responses (prices, indices, fonts) of each original page and its interactions.
// Run again only when a page starts calling a new service: npm run test:visual:record
for (const pageCase of CASES) {
  test(`enregistrement des données de ${pageCase.name}`, async ({ browser }) => {
    // The requests do not depend on the screen size: one desktop pass records them all.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await prepare(page, pageCase.name, true)
    await page.goto(LEGACY_URL + pageCase.path)
    await settle(page)
    for (const step of pageCase.steps.filter((s) => (s.on ?? ['desktop']).includes('desktop'))) {
      await step.run?.(page)
      await settle(page)
    }
    // The fixture file is written when the context closes.
    await context.close()
  })
}
