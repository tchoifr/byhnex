// Pages migrated to Vue and the original files they reproduce.
// The fingerprint records the original version the Vue page was checked against (visual parity).
// When the original changes (osvalt16 keeps working on it), the build publishes the original page
// until the Vue page has been updated: his changes always go live at once.
//
// After updating a Vue page to match the new original and getting the parity test green:
//   node deploy/migrated-pages.mjs --accept
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'deploy', 'migrated-pages.json')

/** @returns {Record<string, {sources: string[], fingerprint: string}>} */
export function readMigrated() {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

export function fingerprint(sources) {
  const hash = createHash('sha256')
  for (const source of sources) {
    // Line endings do not count: Git may check files out with CRLF on Windows.
    hash.update(source + '\0' + fs.readFileSync(path.join(root, source), 'utf8').replace(/\r\n/g, '\n') + '\0')
  }
  return hash.digest('hex')
}

/** Migrated pages whose original changed since the Vue version was checked against it. */
export function outdatedPages() {
  return Object.entries(readMigrated())
    .filter(([, page]) => fingerprint(page.sources) !== page.fingerprint)
    .map(([name]) => name)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) && process.argv.includes('--accept')) {
  const pages = readMigrated()
  for (const page of Object.values(pages)) page.fingerprint = fingerprint(page.sources)
  fs.writeFileSync(file, JSON.stringify(pages, null, 2) + '\n')
  console.log('Empreintes des pages d’origine enregistrées :', Object.keys(pages).join(', '))
}
