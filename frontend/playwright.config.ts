import { defineConfig, devices } from '@playwright/test'

// Visual parity: every migrated page is compared, pixel by pixel, with its original version.
// Both builds are served side by side: dist-legacy/ (original pages) and dist/ (production with Vue).
// Build them first: npm run build && node ../deploy/build.mjs && node ../deploy/build.mjs --legacy
export const LEGACY_URL = 'http://127.0.0.1:4310'
export const VUE_URL = 'http://127.0.0.1:4311'

export default defineConfig({
  testDir: './tests/visual',
  outputDir: './test-results',
  timeout: 120_000,
  // One retry in CI absorbs a rare rendering hiccup; a real difference fails both attempts.
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    colorScheme: 'dark',
    // Same rasterisation whatever the layer layout: grayscale text smoothing, sRGB colours.
    launchOptions: { args: ['--disable-lcd-text', '--force-color-profile=srgb', '--font-render-hinting=none'] },
  },
  projects: [
    { name: 'parity', testMatch: /parity\.spec\.ts/ },
    // Records the external responses of the original pages into tests/visual/fixtures/*.har.
    { name: 'record', testMatch: /record\.spec\.ts/ },
  ],
  webServer: [
    { command: 'node tests/visual/serve.mjs ../dist-legacy 4310', url: LEGACY_URL + '/version.txt', reuseExistingServer: !process.env.CI },
    { command: 'node tests/visual/serve.mjs ../dist 4311', url: VUE_URL + '/version.txt', reuseExistingServer: !process.env.CI },
  ],
})
