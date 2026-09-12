#!/usr/bin/env bun
/**
 * build-editor.ts — bundle CodeMirror 6 entry เป็น `packages/server/public/editor.js`
 *
 * ทำไม bundle: CSP `script-src 'self'` (docs/06) ห้าม CDN → ต้อง self-host
 * bundle นี้เป็น static artifact (ไม่ commit ถ้า gitignore public/) — generate ตอน dev/build
 *
 * `public/` อยู่ใน .gitignore → ต้องรัน `bun run build:editor` ก่อนเปิด server
 * (dev.sh ทำให้อัตโนมัติ)
 */

import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const entry = resolve(root, "packages/server/src/web/editor.ts")
const outdir = resolve(root, "packages/server/public")

const result = await Bun.build({
  entrypoints: [entry],
  outdir,
  naming: "editor.[ext]",
  target: "browser",
  format: "iife",
  minify: true,
  sourcemap: "none",
  define: { "process.env.NODE_ENV": '"production"' },
})

if (!result.success) {
  for (const log of result.logs) process.stderr.write(`${log}\n`)
  process.exit(1)
}

const bytes = (await Bun.file(resolve(outdir, "editor.js")).arrayBuffer()).byteLength
process.stdout.write(`เขียน ${resolve(outdir, "editor.js")} (${(bytes / 1024).toFixed(1)} KB)\n`)
