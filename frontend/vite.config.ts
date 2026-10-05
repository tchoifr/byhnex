import { readdirSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const pagesDir = fileURLToPath(new URL('./pages', import.meta.url))

// One HTML entry per migrated page: pages/<name>.html is published as <name>.html, same URL as before.
const pages = Object.fromEntries(
  readdirSync(pagesDir)
    .filter((file) => file.endsWith('.html'))
    .map((file) => [file.replace(/\.html$/, ''), `${pagesDir}/${file}`]),
)

export default defineConfig({
  root: pagesDir,
  base: './',
  publicDir: false,
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        ...pages,
        // Account module, also added to the pages that are not migrated yet.
        account: fileURLToPath(new URL('./src/account/main.ts', import.meta.url)),
      },
    },
  },
  server: {
    fs: { allow: ['..'] },
  },
})
