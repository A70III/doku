/**
 * M5 S2 — `GET /api/search` (FTS จาก var/index.db) + lifecycle ของ search index ฝั่ง server
 *
 * พิสูจน์: route คืน hits ครบ · tag/limit ทำงาน · ไม่มี index = 503 ·
 * createSearchIndex = boot sync ทันที + trigger (debounce trailing) เก็บไฟล์ที่เพิ่ม + close หยุด timer
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  memoryRevisionStore,
  memoryVaultFs,
  RENDERER_VERSION,
  type WritableVaultFs,
} from "@doku/core"
import { createSearchIndexStore } from "@doku/fs-node"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { createSearchIndex, type SearchIndex } from "../src/index-db.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"

let varDir = ""

beforeEach(() => {
  varDir = mkdtempSync(join(tmpdir(), "doku-search-"))
})

afterEach(() => {
  rmSync(varDir, { recursive: true, force: true })
})

/** `indexed: true` = sync store จาก fs ชุดเดียวกันแล้วส่งเข้า app (เหมือน server จริง) */
async function setup(files: Record<string, string> = {}, options: { indexed?: boolean } = {}) {
  const fs = memoryVaultFs(files) as WritableVaultFs & ReturnType<typeof memoryVaultFs>
  const state = new VaultState(fs, "vault")
  const cache = new FragmentCache(null, RENDERER_VERSION)
  const renderer = new DocRenderer(fs, state, cache)
  const hub = new SseHub()
  let store: ReturnType<typeof createSearchIndexStore> | undefined
  let searchIndex: SearchIndex | undefined
  if (options.indexed) {
    store = createSearchIndexStore(varDir)
    await store.syncFull(fs)
    searchIndex = {
      search: (q, searchOptions) => store?.search(q, searchOptions) ?? [],
      backlinks: (targetId) => store?.backlinks(fs, targetId) ?? Promise.resolve([]),
      trigger: () => {},
      close: () => store?.close(),
    }
  }
  const app = createDokuApp({
    fs,
    vaultName: "vault",
    state,
    renderer,
    hub,
    trash: fs.trashStore(),
    revisions: memoryRevisionStore(),
    searchIndex,
  })
  return { app, fs, store }
}

const DOC = "# คู่มือ\n\nเนื้อหาเรื่อง backlinks และ cache\n"

describe("GET /api/search (docs/05 §3 · M5)", () => {
  test("คืน hits จาก FTS — snippet/fields ครบ + query/limit/tag params", async () => {
    const files = {
      "design.md": DOC,
      "design.meta.json": JSON.stringify({ title: "Doku Design", tags: ["design"] }),
      "notes/a.md": "# อื่น\n\nคำว่า backlinks โผล่ที่นี่ด้วย\n",
    }
    const { app, store } = await setup(files, { indexed: true })
    try {
      const all = await (await app.request("/api/search?q=backlinks")).json()
      expect(all.ok).toBe(true)
      expect(all.query).toBe("backlinks")
      expect(all.count).toBe(2)
      const hit = all.hits.find((item: { path: string }) => item.path === "design")
      expect(hit.title).toBe("Doku Design")
      expect(hit.tags).toEqual(["design"])
      expect(hit.snippet).toContain("[backlinks]")

      // tag filter = เฉพาะ doc ที่มี tag
      const tagged = await (await app.request("/api/search?q=backlinks&tag=design")).json()
      expect(tagged.count).toBe(1)
      expect(tagged.hits[0].path).toBe("design")

      // limit
      const limited = await (await app.request("/api/search?q=backlinks&limit=1")).json()
      expect(limited.count).toBe(1)

      // q ว่าง = ok แต่ไม่มีผล (ไม่ใช่ error)
      const empty = await (await app.request("/api/search?q=")).json()
      expect(empty.ok).toBe(true)
      expect(empty.count).toBe(0)

      // substring ภาษาไทย (trigram)
      const thai = (await (
        await app.request(`/api/search?q=${encodeURIComponent("เนื้อหาเรื่อง")}`)
      ).json()) as { count: number }
      expect(thai.count).toBeGreaterThanOrEqual(1)
    } finally {
      store?.close()
    }
  })

  test("ไม่มี searchIndex ใน deps → 503 (route ตอบ JSON error ตามสัญญา)", async () => {
    const { app } = await setup({ "design.md": DOC })
    const res = await app.request("/api/search?q=x")
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe("internal_error")
  })
})

describe("createSearchIndex lifecycle (docs/01 §Indexer)", () => {
  test("boot sync ทันที · trigger = trailing debounce เก็บไฟล์ใหม่ · close หยุด timer", async () => {
    const fs = memoryVaultFs({ "a.md": "# A\n\nboot entry\n" }) as WritableVaultFs &
      ReturnType<typeof memoryVaultFs>
    const index = await createSearchIndex(varDir, fs)
    try {
      // boot sync = เห็นของเดิมทันที
      expect(index.search("boot")).toHaveLength(1)

      // เปลี่ยนไฟล์แล้ว trigger — ต้อง debounce แล้ว sync (ไม่ใช่ทันที ไม่ใช่ drop)
      await fs.writeText("a.md", "# A\n\nfresh keyword\n")
      await fs.writeText("b.md", "# B\n\nsecond file added\n")
      index.trigger()
      index.trigger() // coalesce = 1 sync สุดท้ายครอบคลุมทั้งสองไฟล์
      await new Promise((resolve) => setTimeout(resolve, 700))
      expect(index.search("fresh")).toHaveLength(1)
      expect(index.search("second")).toHaveLength(1)
    } finally {
      index.close()
    }
  })
})

describe("backlinks render (M5 S4)", () => {
  test("/d/<doc> โชว์ section 'เชื่อมโยงมาจาก' เมื่อมีคนชี้ · ไม่มีคนชี้ = ไม่โชว์", async () => {
    const files = {
      "target.md": "# เป้า\n\nไม่มีลิงก์ออก\n",
      "source.md": "# ต้นทาง\n\nชี้มาที่ [[target]]\n",
      "lonely.md": "# เดียวดาย\n\nไม่มีใครชี้\n",
    }
    const { app, store: testStore } = await setup(files, { indexed: true })
    try {
      const page = await (await app.request("/d/target")).text()
      expect(page).toContain('class="doku-backlinks"')
      expect(page).toContain("เชื่อมโยงมาจาก")
      // link กลับไปหา source + path โชว์เป็น code (title = meta ของ source)
      expect(page).toContain('href="/d/source"')
      expect(page).toContain("<code>source</code>")

      const lonely = await (await app.request("/d/lonely")).text()
      expect(lonely).not.toContain("doku-backlinks")
    } finally {
      testStore?.close()
    }
  })
})
