#!/usr/bin/env bun
/**
 * `@doku/server` entry — dev target ของ `bun --hot` (M1, docs/07)
 *
 * env: DOKU_VAULT (default `vault`) · DOKU_PORT (7667) · DOKU_HOST (0.0.0.0)
 *      DOKU_VAR (default `var`) · DOKU_CACHE=off (dev ปิด disk cache — docs/01)
 */

import { basename, resolve as resolvePath } from "node:path"
import { RENDERER_VERSION } from "@doku/core"
import { createNodeVaultFs } from "@doku/fs-node"
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
const fs = await createNodeVaultFs(vaultRoot)
const state = new VaultState(fs, vaultName)
const cache = new FragmentCache(
  disableCache ? null : resolvePath(varDir, "cache"),
  RENDERER_VERSION,
)
const renderer = new DocRenderer(fs, state, cache)
const hub = new SseHub()

// watcher → invalidate snapshot + แจ้ง browser reload (debounce ภายใน watcher/hub)
const watcher = createVaultWatcher(fs.root, {
  onChange: () => {
    state.invalidate()
    hub.scheduleBroadcast()
  },
})

// app.css = Tailwind ที่ generate ไว้ (bun run dev / build:css) — ยังไม่มี = 404 เงียบๆ
const appCssUrl = new URL("../public/app.css", import.meta.url)
const readAppCss = async (): Promise<string | null> => {
  try {
    return await Bun.file(appCssUrl).text()
  } catch {
    return null
  }
}

const app = createDokuApp({ fs, vaultName, state, renderer, hub, readAppCss })

const server = Bun.serve({ port, hostname, fetch: app.fetch })

process.stderr.write(
  `doku serve → http://${hostname}:${port}  (vault: ${fs.root}${disableCache ? " · cache off" : ""})\n`,
)

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void watcher.close()
    server.stop(true)
    process.exit(0)
  })
}
