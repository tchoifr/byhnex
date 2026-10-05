// Production build for byhnex.com: runs the regular build, then adds the account module, the PHP API
// and the Apache configuration without modifying any file maintained upstream.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..'), dist = path.join(root, 'dist');
const UPSTREAM_URL = 'https://osvalt16.github.io/byhnex/', PROD_URL = 'https://byhnex.com/';
const version = (process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'})).trim().slice(0, 8);

fs.rmSync(dist, {recursive: true, force: true});
execFileSync(process.execPath, ['build-pages.js'], {cwd: root, stdio: 'inherit'});
fs.rmSync(path.join(dist, '.nojekyll'), {force: true});

const copy = (from, to, transform) => {
  fs.mkdirSync(path.dirname(to), {recursive: true});
  if (transform) fs.writeFileSync(to, transform(fs.readFileSync(from, 'utf8')));
  else fs.copyFileSync(from, to);
};
copy(path.join(root, 'prod/account.js'), path.join(dist, 'account.js'), s => s.replaceAll('__VERSION__', version));
copy(path.join(root, 'prod/sync-core.js'), path.join(dist, 'sync-core.js'));
copy(path.join(root, 'prod/htaccess'), path.join(dist, '.htaccess'));

// API: entry point, sources, migrations and the migration script. Tests and examples stay out.
const apiFiles = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes: true})) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (!/\.(test\.\w+|example\.php)$|\.md$/.test(entry.name)) { copy(path.join(root, rel), path.join(dist, rel)); apiFiles.push(rel); }
  }
})('api');

let pages = 0;
for (const file of fs.readdirSync(dist)) {
  const target = path.join(dist, file);
  if (file.endsWith('.html')) {
    let html = fs.readFileSync(target, 'utf8').replaceAll(UPSTREAM_URL, PROD_URL);
    if (!html.includes('</body>')) throw Error(file + ' : balise </body> introuvable');
    html = html.replace(/<\/body>(?![\s\S]*<\/body>)/, `<script type="module" src="account.js?v=${version}"></script>\n</body>`);
    fs.writeFileSync(target, html);
    pages++;
  } else if (file === 'sitemap.xml' || file === 'robots.txt') {
    fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replaceAll(UPSTREAM_URL, PROD_URL));
  }
}
fs.writeFileSync(path.join(dist, 'version.txt'), version + '\n');
console.log(`Build production ${version} : ${pages} pages avec le compte, ${apiFiles.length} fichiers d’API.`);
