#!/usr/bin/env bun
/**
 * `@doku/server` entry — dev target ของ `bun --hot` (M1, docs/07)
 *
 * env: DOKU_VAULT (default `vault`) · DOKU_PORT (7667) · DOKU_HOST (0.0.0.0)
 *      DOKU_VAR (default `var`) · DOKU_CACHE=off (dev ปิด disk cache — docs/01)
 */

import { basename, resolve as resolvePath } from "node:path"
import { RENDERER_VERSION } from "@doku/core"
import { createNodeRevisionStore, createNodeVaultFs } from "@doku/fs-node"
import { createDokuApp } from "./app.tsx"
import { FragmentCache } from "./cache.ts"
import { DocRenderer } from "./doc.ts"
import { SseHub } from "./sse.ts"
import { VaultState } from "./tree.ts"
import { createVaultWatcher } from "./watch.ts"

const vaultRoot = resolvePath(process.env.DOKU_VAULT ?? "vault")
const varDir = resolvePath(process.env.DOKU_VAR ?? "var")
const port = Number(process.env.DOKU_PORT ?? 7667)
const hostname = process.env.DOKU_HOST ?? "0.0.0.0"
const disableCache = process.env.DOKU_CACHE === "off"

const vaultName = basename(vaultRoot)
const fs = await createNodeVaultFs(vaultRoot).catch(() => {
  process.stderr.write(
    `ไม่พบ vault: ${vaultRoot}\nสร้างโฟลเดอร์ vault/ ก่อน หรือระบุ DOKU_VAULT=<dir> (ลอง: DOKU_VAULT=examples/vault bun run dev)\n`,
  )
  process.exit(2)
})
const state = new VaultState(fs, vaultName)
const cache = new FragmentCache(
  disableCache ? null : resolvePath(varDir, "cache"),
  RENDERER_VERSION,
)
const renderer = new DocRenderer(fs, state, cache)
const hub = new SseHub()
const trash = fs.trashStore()
const revisions = await createNodeRevisionStore(varDir)

// retention: auto-purge trash 30 วัน (docs/06) — ตอนบูต + ทุกชั่วโมง
void trash.purge()
const purgeTimer = setInterval(() => void trash.purge(), 60 * 60 * 1000)
purgeTimer.unref?.()

// watcher → invalidate snapshot + แจ้ง browser reload (debounce ภายใน watcher/hub)
const watcher = createVaultWatcher(fs.root, {
  onChange: () => {
    state.invalidate()
    hub.scheduleBroadcast()
  },
})

// public/ = artifact ที่ generate (Tailwind app.css, editor.js) — ยังไม่มี = 404 เงียบๆ
// editor.js ถูก build ครั้งเดียวตอนเปิด dev → cache ได้ · app.css ต้องอ่านใหม่ (tailwind --watch)
const publicDir = new URL("../public/", import.meta.url)
const publicCache = new Map<string, string>()
const readPublic = async (name: string): Promise<string | null> => {
  if (!/^[a-z0-9._-]+$/i.test(name)) return null
  const cached = publicCache.get(name)
  if (cached !== undefined) return cached
  try {
    const content = await Bun.file(new URL(name, publicDir)).text()
    if (name === "editor.js") publicCache.set(name, content)
    return content
  } catch {
    return null
  }
}

const app = createDokuApp({ fs, vaultName, state, renderer, hub, readPublic, trash, revisions })

let server: ReturnType<typeof Bun.serve>
try {
  server = Bun.serve({ port, hostname, fetch: app.fetch })
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
    process.stderr.write(
      `port ${port} ถูกใช้อยู่ — เลือก port อื่น: DOKU_PORT=<n> bun run dev\n` +
        `(หาว่าใครถืออยู่: ss -tlnp | grep ${port})\n`,
    )
    process.exit(2)
  }
  throw error
}

process.stderr.write(
  `doku serve → http://${hostname}:${port}  (vault: ${fs.root}${disableCache ? " · cache off" : ""})\n`,
)

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(purgeTimer)
    void watcher.close()
    server.stop(true)
    process.exit(0)
  })
}
