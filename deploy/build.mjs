// Production build of byhnex.com into dist/:
//   1. pages not migrated yet, through the original build (build-pages.js);
//   2. Vue pages (frontend/), which replace them under the same URL;
//   3. account module on every page, links to byhnex.com, Apache configuration, API front controller.
// Usage: node deploy/build.mjs            → dist/
//        node deploy/build.mjs --legacy   → dist-legacy/, same build without the Vue pages
//                                           (reference for the visual comparison tests).
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { outdatedPages } from './migrated-pages.mjs'

const root = path.resolve(import.meta.dirname, '..')
const legacyOnly = process.argv.includes('--legacy')
const out = path.join(root, legacyOnly ? 'dist-legacy' : 'dist')
const front = path.join(root, 'frontend', 'dist')
const UPSTREAM_URL = 'https://osvalt16.github.io/byhnex/'
const PROD_URL = 'https://byhnex.com/'
const version = (process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })).trim().slice(0, 8)

// 1. Original pages. build-pages.js always writes to dist/: a production build already there is set aside.
const dist = path.join(root, 'dist')
const aside = path.join(root, '.dist-aside')
if (legacyOnly && fs.existsSync(dist)) fs.renameSync(dist, aside)
try {
  fs.rmSync(dist, { recursive: true, force: true })
  execFileSync(process.execPath, ['build-pages.js'], { cwd: root, stdio: 'inherit' })
  if (legacyOnly) {
    fs.rmSync(out, { recursive: true, force: true })
    fs.renameSync(dist, out)
  }
} finally {
  if (fs.existsSync(aside)) fs.renameSync(aside, dist)
}
fs.rmSync(path.join(out, '.nojekyll'), { force: true })

// 2. Vue pages and bundles (built beforehand with `npm --prefix frontend run build`).
const manifestFile = path.join(front, '.vite', 'manifest.json')
if (!fs.existsSync(manifestFile)) throw Error('frontend/dist absent : lancez d’abord « npm --prefix frontend run build ».')
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
const accountEntry = Object.values(manifest).find((chunk) => chunk.isEntry && chunk.name === 'account')
if (!accountEntry) throw Error('Bundle du compte introuvable dans le manifeste Vite.')
const vuePages = []
const outdated = outdatedPages()
fs.cpSync(path.join(front, 'assets'), path.join(out, 'assets'), { recursive: true })
if (!legacyOnly) {
  for (const file of fs.readdirSync(front).filter((f) => f.endsWith('.html'))) {
    // The original changed since the Vue page was checked: publish the original until the Vue page catches up.
    if (outdated.includes(file)) {
      console.log(`::warning title=Page Vue à mettre à jour::${file} : la version d’origine a changé, elle est publiée à la place de la version Vue (voir docs/migration.md).`)
      continue
    }
    fs.copyFileSync(path.join(front, file), path.join(out, file))
    vuePages.push(file)
  }
}

// 3. Every page: production URLs and the account module.
let pages = 0
for (const file of fs.readdirSync(out)) {
  const target = path.join(out, file)
  if (file.endsWith('.html')) {
    let html = fs.readFileSync(target, 'utf8').replaceAll(UPSTREAM_URL, PROD_URL)
    if (!html.includes('</body>')) throw Error(`${file} : balise </body> introuvable`)
    html = html.replace(/<\/body>(?![\s\S]*<\/body>)/, `<script type="module" src="./${accountEntry.file}"></script>\n</body>`)
    fs.writeFileSync(target, html)
    pages++
  } else if (file === 'sitemap.xml' || file === 'robots.txt') {
    fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replaceAll(UPSTREAM_URL, PROD_URL))
  }
}
fs.copyFileSync(path.join(root, 'deploy', 'htaccess'), path.join(out, '.htaccess'))
fs.mkdirSync(path.join(out, 'api'), { recursive: true })
fs.copyFileSync(path.join(root, 'deploy', 'api', 'index.php'), path.join(out, 'api', 'index.php'))
fs.copyFileSync(path.join(root, 'deploy', 'api', 'htaccess'), path.join(out, 'api', '.htaccess'))
fs.writeFileSync(path.join(out, 'version.txt'), version + '\n')

console.log(`Build ${legacyOnly ? 'de référence (sans Vue)' : 'de production'} ${version} : ${pages} pages, Vue : ${vuePages.join(', ') || 'aucune'}${!legacyOnly && outdated.length ? ` ; version d’origine publiée pour ${outdated.join(', ')}` : ''}.`)
