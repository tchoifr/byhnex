import { writeFileSync } from 'node:fs'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { LEGACY_URL, VUE_URL } from '../../playwright.config'
import { CASES, stepRunsOn, type Device } from './cases'
import { MAX_DIFF_PIXELS, compare, prepare, settle } from './harness'

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const

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
      const legacy = await open(browser, LEGACY_URL, pageCase.path, pageCase.name, viewport)
      const vue = await open(browser, VUE_URL, pageCase.path, pageCase.name, viewport)
      const failures: string[] = []
      for (const step of pageCase.steps) {
        if (!stepRunsOn(step, device as Device)) continue
        if (step.run) {
          await step.run(legacy)
          await step.run(vue)
          // Park the pointer on empty space: after a re-layout the browser refreshes :hover at a moment
          // that depends on when the DOM changed, which is not a visual difference of the page.
          for (const page of [legacy, vue]) await page.mouse.move(Math.floor(viewport.width / 2), 5)
          await settle(legacy)
          await settle(vue)
        }
        const [textLegacy, textVue] = await Promise.all([legacy.locator('main').innerText(), vue.locator('main').innerText()])
        if (textLegacy !== textVue) failures.push(`${step.label} : le texte affiché diffère`)
        const [a, b] = await Promise.all([shot(legacy), shot(vue)])
        const result = compare(a, b)
        if (result.diffPixels < 0 || result.diffPixels > MAX_DIFF_PIXELS) {
          failures.push(`${step.label} : ${result.sizeMismatch ?? result.diffPixels + ' pixels différents'}`)
          // Saved in test-results/ and attached to the report: original, Vue version, differences in red.
          for (const [suffix, body] of [['origine', a], ['vue', b], ['differences', result.diff]] as const) {
            if (!body) continue
            const file = info.outputPath(`${step.label}-${suffix}.png`)
            writeFileSync(file, body)
            await info.attach(`${step.label}-${suffix}.png`, { path: file, contentType: 'image/png' })
          }
        }
      }
      expect(failures, failures.join('\n')).toEqual([])
    })
  }
}
