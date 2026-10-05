import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

/** Every run starts at the same instant, so dates, ages and generated URLs are identical. */
export const FIXED_TIME = new Date('2026-10-05T08:00:00Z')

export const harPath = (name: string) => fileURLToPath(new URL(`./fixtures/${name}.har`, import.meta.url))

/**
 * Same conditions for both versions: frozen clock, external HTTP answered from the recorded fixture,
 * WebSockets closed (the market feed falls back to its REST polling).
 */
const inFlight = new WeakMap<Page, number>()

/** Waits until no request has been pending for 250 ms of real time. */
async function networkIdle(page: Page): Promise<void> {
  let quietSince = Date.now()
  for (let i = 0; i < 200; i++) {
    if ((inFlight.get(page) ?? 0) > 0) quietSince = Date.now()
    else if (Date.now() - quietSince >= 250) return
    await page.waitForTimeout(50)
  }
  throw new Error('Le réseau ne se calme pas : une requête reste en attente.')
}

export async function prepare(page: Page, fixture: string, record = false): Promise<void> {
  inFlight.set(page, 0)
  const done = () => inFlight.set(page, Math.max(0, (inFlight.get(page) ?? 0) - 1))
  page.on('request', () => inFlight.set(page, (inFlight.get(page) ?? 0) + 1))
  page.on('requestfinished', done)
  page.on('requestfailed', done)
  await page.clock.install({ time: FIXED_TIME })
  // Without a pause the fake clock still follows real time; paused, it only moves with runFor().
  await page.clock.pauseAt(new Date(FIXED_TIME.getTime() + 1000))
  await page.routeWebSocket(/.*/, (ws) => ws.close())
  await page.routeFromHAR(harPath(fixture), {
    url: /^https:\/\//,
    update: record,
    updateContent: 'embed',
    notFound: 'abort',
  })
}

/**
 * Lets fonts, timers and network settle before a screenshot. The network is idle before each clock jump,
 * so every response lands at the same instant of fake time on both versions.
 */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  await networkIdle(page)
  await page.clock.runFor(3000)
  await networkIdle(page)
  await page.clock.runFor(1000)
  await networkIdle(page)
}

/**
 * Pixels allowed to differ per capture (about 0.0015 % of a desktop page): font and edge smoothing varies
 * slightly between renders on Linux. A real change (moved element, colour, text) affects far more pixels,
 * and the displayed text is compared separately.
 */
export const MAX_DIFF_PIXELS = 25

export function compare(a: Buffer, b: Buffer): { diffPixels: number; diff?: Buffer; sizeMismatch?: string } {
  const pa = PNG.sync.read(a)
  const pb = PNG.sync.read(b)
  if (pa.width !== pb.width || pa.height !== pb.height) {
    return { diffPixels: -1, sizeMismatch: `${pa.width}×${pa.height} contre ${pb.width}×${pb.height}` }
  }
  const out = new PNG({ width: pa.width, height: pa.height })
  // 0.1 is pixelmatch's perceptual threshold: it absorbs edge anti-aliasing noise, not visible changes.
  // Any pixel beyond it fails the test.
  const diffPixels = pixelmatch(pa.data, pb.data, out.data, pa.width, pa.height, { threshold: 0.1 })
  return { diffPixels, diff: diffPixels ? PNG.sync.write(out) : undefined }
}
