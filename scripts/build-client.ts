#!/usr/bin/env bun
/**
 * build-client.ts — bundle `web/client/main.ts` เป็น `packages/server/public/client.js`
 *
 * เหตุผลเดียวกับ `build-editor.ts` (docs/08 ข้อ 37, 78): CSP `script-src 'self'` ห้าม eval
 * → browser client ต้องเป็นไฟล์จริงที่ bundle ไว้ ไม่ใช่ template literal ที่ eval ตอนรัน
 *
 * `public/` อยู่ใน .gitignore — ต้องรัน `bun run build:client` ก่อนเปิด server (dev.sh/shot ทำอัตโนมัติ)
 */

import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const entry = resolve(root, "packages/server/src/web/client/main.ts")
const outdir = resolve(root, "packages/server/public")

const result = await Bun.build({
  entrypoints: [entry],
  outdir,
  naming: "client.[ext]",
  target: "browser",
  format: "iife",
  minify: true,
  sourcemap: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  // entry เป็น ES module (strict อยู่แล้ว) แต่ output เป็น classic script → Bun ตัด directive ทิ้ง
  // เดิม CLIENT_JS รันเป็น strict ("use strict" ใน IIFE) — คง semantics เดิมไว้
  banner: '"use strict";',
})

if (!result.success) {
  for (const log of result.logs) process.stderr.write(`${log}\n`)
  process.exit(1)
}

const bytes = (await Bun.file(resolve(outdir, "client.js")).arrayBuffer()).byteLength
process.stdout.write(`เขียน ${resolve(outdir, "client.js")} (${(bytes / 1024).toFixed(1)} KB)\n`)
