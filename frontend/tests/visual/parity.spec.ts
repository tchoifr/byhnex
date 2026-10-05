import { writeFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { LEGACY_URL, VUE_URL } from '../../playwright.config'
import { CASES, stepRunsOn, type Device } from './cases'
import { MAX_DIFF_PIXELS, compare, prepare, settle } from './harness'

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const

/**
 * The original page itself does not always rasterise the same way (a symbol drawn with a fallback font
 * can be smoothed differently from one load to the next). It is loaded twice: the Vue page must match
 * one of the renders the original produces.
 */
const LEGACY_SAMPLES = 2

async function open(browser: Browser, base: string, path: string, fixture: string, viewport: { width: number; height: number }): Promise<Page> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await prepare(page, fixture)
  await page.goto(base + path)
  await settle(page)
  return page
}

const shot = (page: Page) => page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide' })

for (const pageCase of CASES) {
  for (const [device, viewport] of Object.entries(VIEWPORTS)) {
    test(`${pageCase.name} · ${device} : identique à la version d’origine`, async ({ browser }, info) => {
      const legacies: Page[] = []
      for (let i = 0; i < LEGACY_SAMPLES; i++) legacies.push(await open(browser, LEGACY_URL, pageCase.path, pageCase.name, viewport))
      const vue = await open(browser, VUE_URL, pageCase.path, pageCase.name, viewport)
      const pages = [...legacies, vue]
      const failures: string[] = []
      for (const step of pageCase.steps) {
        if (!stepRunsOn(step, device as Device)) continue
        if (step.run) {
          for (const page of pages) await step.run(page)
          // Park the pointer on empty space: after a re-layout the browser refreshes :hover at a moment
          // that depends on when the DOM changed, which is not a visual difference of the page.
          for (const page of pages) await page.mouse.move(Math.floor(viewport.width / 2), 5)
          for (const page of pages) await settle(page)
        }
        const textVue = await vue.locator('main').innerText()
        for (const legacy of legacies) {
          if ((await legacy.locator('main').innerText()) !== textVue) failures.push(`${step.label} : le texte affiché diffère`)
        }
        const b = await shot(vue)
        const results = []
        for (const legacy of legacies) {
          const a = await shot(legacy)
          results.push({ a, ...compare(a, b) })
        }
        const best = results.reduce((x, y) => (y.diffPixels >= 0 && (x.diffPixels < 0 || y.diffPixels < x.diffPixels) ? y : x))
        if (best.diffPixels < 0 || best.diffPixels > MAX_DIFF_PIXELS) {
          failures.push(`${step.label} : ${best.sizeMismatch ?? best.diffPixels + ' pixels différents'}`)
          // Saved in test-results/ and attached to the report: original, Vue version, differences in red.
          for (const [suffix, body] of [['origine', best.a], ['vue', b], ['differences', best.diff]] as const) {
            if (!body) continue
            const file = info.outputPath(`${step.label}-${suffix}.png`)
            writeFileSync(file, body)
            await info.attach(`${step.label}-${suffix}.png`, { path: file, contentType: 'image/png' })
          }
        }
      }
      expect([...new Set(failures)], failures.join('\n')).toEqual([])
    })
  }
}
