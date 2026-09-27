/**
 * M5 S1 — search index ที่ `var/index.db` (Drizzle + bun:sqlite FTS5, trigram)
 *
 * พิสูจน์: sync ครั้งแรกเขียนครบ · sync ซ้ำข้ามตาม hash (incremental) · ค้น substring
 * ไทย/อังกฤษ พร้อม snippet · tag/limit · LIKE fallback (query < 3 อักขระ) ·
 * applyChange (เปลี่ยน/ลบ/เมทา/เมิน dot) · reopen + schema version ทิ้งแล้วสร้างใหม่ได้
 */

import { Database } from "bun:sqlite"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createNodeVaultFs } from "../src/index.ts"
import { createSearchIndexStore, type SearchIndexStore } from "../src/search-index.ts"

let root = ""
let vaultRoot = ""
let varDir = ""
let store: SearchIndexStore | null = null

async function vaultWith(files: Record<string, string>) {
  mkdirSync(vaultRoot, { recursive: true })
  const fs = await createNodeVaultFs(vaultRoot)
  for (const [path, content] of Object.entries(files)) await fs.writeText(path, content)
  return fs
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "doku-idx-"))
  vaultRoot = join(root, "vault")
  varDir = join(root, "var")
})

afterEach(() => {
  store?.close()
  store = null
  rmSync(root, { recursive: true, force: true })
})

describe("search index (var/index.db)", () => {
  test("syncFull เขียนครบ → ค้น substring ไทย/อังกฤษ + snippet/fields ครบ (docs/01 indexer)", async () => {
    const fs = await vaultWith({
      "design.md": "# คู่มือออกแบบ\n\nเนื้อหาเรื่อง backlinks และ cache แบบ incremental\n",
      "design.meta.json": JSON.stringify({ title: "Doku Design", tags: ["design"] }),
      "notes/thai.md": "# บันทึก\n\nวันนี้กินอะไรดี พรุ่งนี้ค่อยว่ากัน\n",
    })
    store = createSearchIndexStore(varDir)
    const stats = await store.syncFull(fs)
    expect(stats).toEqual({ scanned: 2, updated: 2, skipped: 0, removed: 0 })
    expect(store.count()).toBe(2)

    // substring กลางประโยคภาษาไทย — unicode61 จะหาไม่เจอ แต่ trigram ต้องเจอ
    const thai = store.search("กินอะไร")
    expect(thai.map((hit) => hit.path)).toEqual(["notes/thai"])
    expect(thai[0]?.snippet).toContain("[กินอะไร]")

    const eng = store.search("backlinks")
    expect(eng.map((hit) => hit.path)).toEqual(["design"])

    // title จาก sidecar + tags + bytes/mtime มีจริง
    const hit = store.search("Doku")[0]
    expect(hit?.title).toBe("Doku Design")
    expect(hit?.tags).toEqual(["design"])
    expect(hit?.bytes).toBeGreaterThan(0)
    expect(typeof hit?.mtimeMs).toBe("number")
  })

  test("incremental ตาม hash — sync ซ้ำ = ข้ามหมด · เปลี่ยน 1 = อัปเดต 1", async () => {
    const fs = await vaultWith({ "a.md": "# A\n", "b.md": "# B\n", "c.md": "# C\n" })
    store = createSearchIndexStore(varDir)
    expect((await store.syncFull(fs)).updated).toBe(3)

    expect(await store.syncFull(fs)).toEqual({
      scanned: 3,
      updated: 0,
      skipped: 3,
      removed: 0,
    })

    await fs.writeText("b.md", "# B\n\nhas been changed uniquephrase now\n")
    const third = await store.syncFull(fs)
    expect(third).toEqual({ scanned: 3, updated: 1, skipped: 2, removed: 0 })
    expect(store.search("uniquephrase").map((hit) => hit.path)).toEqual(["b"])

    // ลบไฟล์ → reconcile แถวที่หาย
    await fs.remove("c.md")
    const fourth = await store.syncFull(fs)
    expect(fourth.removed).toBe(1)
    expect(store.count()).toBe(2)
    expect(store.search("uniquephrase")).toHaveLength(1)
  })

  test("applyChange — เปลี่ยน/ลบ/เมทา = index ตาม · asset/dot path = ignored", async () => {
    const fs = await vaultWith({ "notes/x.md": "# X\n\nseed content initial\n" })
    store = createSearchIndexStore(varDir)
    await store.syncFull(fs)

    await fs.writeText("notes/x.md", "# X\n\nkeywordhere มาแล้ว\n")
    expect(await store.applyChange(fs, "notes/x.md")).toBe("indexed")
    expect(store.search("keywordhere").map((hit) => hit.path)).toEqual(["notes/x"])

    await fs.writeText("notes/x.meta.json", JSON.stringify({ title: "New Title", tags: ["alpha"] }))
    expect(await store.applyChange(fs, "notes/x.meta.json")).toBe("indexed")
    expect(store.search("New Title")[0]?.title).toBe("New Title")

    await fs.remove("notes/x.md")
    expect(await store.applyChange(fs, "notes/x.md")).toBe("removed")
    expect(store.search("keywordhere")).toHaveLength(0)

    // ไฟล์ไม่ใช่ md/meta = ignored · dot segment (.trash) = กันไว้เสมอ (invariant 9)
    expect(await store.applyChange(fs, "assets/pic.png")).toBe("ignored")
    expect(await store.applyChange(fs, ".trash/2026/x.md")).toBe("ignored")
    expect(await store.applyChange(fs, "a#b/x.meta.json")).toBe("ignored")
  })

  test("tag filter + limit — json_each ตรงตัว · limit คลุม max 1..100", async () => {
    const fs = await vaultWith({
      "one.md": "# One\n\nsharedtoken ตัวแรก\n",
      "one.meta.json": JSON.stringify({ title: "One", tags: ["design"] }),
      "two.md": "# Two\n\nsharedtoken ตัวที่สอง\n",
      "two.meta.json": JSON.stringify({ title: "Two", tags: ["tool"] }),
      "three.md": "# Three\n\nsharedtoken ตัวที่สาม\n",
    })
    store = createSearchIndexStore(varDir)
    await store.syncFull(fs)

    expect(store.search("sharedtoken")).toHaveLength(3)
    expect(store.search("sharedtoken", { tag: "design" }).map((h) => h.path)).toEqual(["one"])
    expect(store.search("sharedtoken", { tag: "nope" })).toHaveLength(0)
    expect(store.search("sharedtoken", { limit: 1 })).toHaveLength(1)
    expect(store.search("sharedtoken", { limit: 9999 })).toHaveLength(3)
    expect(store.search("")).toHaveLength(0)
  })

  test("query สั้นกว่า 3 อักขระ = LIKE fallback เฉพาะ title/path (ไม่ linear-scan เนื้อหา)", async () => {
    const fs = await vaultWith({
      "projects/design.md": "# พัฒนา\n\nมีคำว่า zz ในเนื้อหาตรงนี้ด้วย\n",
      "other.md": "# Other\n\nno match for zz in this doc\n",
    })
    store = createSearchIndexStore(varDir)
    await store.syncFull(fs)

    // 2 อักขระ: จับจาก path/title ("design" ใน path) — ไม่ใช่จากเนื้อหา
    expect(store.search("de").map((h) => h.path)).toContain("projects/design")
    expect(store.search("พัฒนา")[0]?.path).toBe("projects/design") // title fallback ก็ผ่าน
    // เนื้อหา "zz" ที่ไม่อยู่ใน title/path = ไม่เจอ (พิสูจน์ว่าไม่ได้ scan เนื้อหา)
    expect(store.search("zz")).toHaveLength(0)
    expect(store.search("qqq")).toHaveLength(0)
  })

  test("reopen เก็บของเดิม · user_version ไม่ตรง = ทิ้งแล้ว sync ใหม่ได้ (disposable)", async () => {
    const fs = await vaultWith({ "keep.md": "# Keep\n\npersistent entry\n" })
    store = createSearchIndexStore(varDir)
    await store.syncFull(fs)
    expect(store.search("persistent")).toHaveLength(1)
    store.close()

    // reopen ปกติ = ของเดิมอยู่ครบ (schema version คงเดิม)
    store = createSearchIndexStore(varDir)
    expect(store.count()).toBe(1)

    // ปลอม version ให้ไม่ตรง → store ถัดไปทิ้งตาราง ( rebuild จาก vault ได้)
    store.close()
    const raw = new Database(join(varDir, "index.db"))
    raw.exec("PRAGMA user_version = 99")
    raw.close()
    store = createSearchIndexStore(varDir)
    expect(store.count()).toBe(0)
    await store.syncFull(fs)
    expect(store.search("persistent")).toHaveLength(1)
  })
})

describe("backlinks (M5 S4 — ตาราง links ใน index)", () => {
  test("wiki/relative/`/d` ทุกแบบ resolve → backlinks · self-link ไม่นับ · แก้/ลบไฟล์ = ตามทัน", async () => {
    const fs = await vaultWith({
      "b.md": "# B\n\nมี [[b]] ชี้ตัวเองด้วย\n",
      "c.md": "# C\n\nฉันไม่มีลิงก์ออก\n",
      "a.md": "# A\n\nดู [[b]] และ [c แบบ relative](./c.md) ด้วย\n",
      "d.md": "# D\n\n[open](/d/b) แบบ root path\n",
      "e.md": "# E\n\n[[missingdoc]] ไม่มีจริง\n",
    })
    store = createSearchIndexStore(varDir)
    await store.syncFull(fs)

    // b ถูกชี้จาก a (wiki) + d (/d form) · self-link ของ b เองไม่นับ · เรียงตาม path
    const toB = await store.backlinks(fs, "b")
    expect(toB.map((link) => link.path)).toEqual(["a", "d"])
    expect(toB.map((link) => link.title)).toEqual(["a", "d"])

    const toC = await store.backlinks(fs, "c")
    expect(toC.map((link) => link.path)).toEqual(["a"])

    // ไม่มีใครชี้ e / missingdoc resolve ไม่ได้ = [] (ไม่ throw)
    expect(await store.backlinks(fs, "e")).toEqual([])
    expect(await store.backlinks(fs, "missingdoc")).toEqual([])

    // แก้ไฟล์ = links ของเอกสารนั้นถูกแทนที่ทั้งชุด (a เลิกชี้ c)
    await fs.writeText("a.md", "# A\n\nเหลือแค่ [[b]]\n")
    await store.syncFull(fs)
    expect(await store.backlinks(fs, "c")).toEqual([])
    expect((await store.backlinks(fs, "b")).map((link) => link.path)).toEqual(["a", "d"])

    // ลบไฟล์ = ออกจากการเป็น source ด้วย (deleteDoc ลบทั้ง docs/fts/links)
    await fs.remove("d.md")
    await store.syncFull(fs)
    expect((await store.backlinks(fs, "b")).map((link) => link.path)).toEqual(["a"])
    // b c a e (d ถูกลบ) — e ไม่มีใครชี้แต่ยังอยู่ใน index
    expect(store.count()).toBe(4)
  })
})
