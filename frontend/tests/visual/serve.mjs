// Minimal static server for the visual tests: node tests/visual/serve.mjs <directory> <port>
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const [dir, port] = process.argv.slice(2)
const root = resolve(dir)
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  let file = normalize(join(root, path === '/' ? 'index.html' : path))
  if (!file.startsWith(root)) return res.writeHead(403).end()
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) return res.writeHead(404).end('Introuvable')
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
  createReadStream(file).pipe(res)
}).listen(Number(port), '127.0.0.1', () => console.log(`${root} → http://127.0.0.1:${port}`))
