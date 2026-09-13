import { describe, expect, test } from "bun:test"
import { memoryVaultFs, RENDERER_VERSION } from "@doku/core"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"
import { headingsInMarkdown, shouldReloadOnChange } from "../src/web/client/pure.ts"

/**
 * M3.2 Track A — one surface (docs/08 ข้อ 63/65 · docs/09 §3.1)
 *
 * สัญญาที่ต้องคง:
 * 1. `shouldReloadOnChange` — live reload ต้องไม่ตาย และ autosave ของตัวเอง
 *    ต้องไม่ trigger reload (echo ของ watcher กลับมาถึงหลัง PUT จบ)
 * 2. `data-title-in-body` เซ็ตที่ server ครั้งเดียว (เอกสารขึ้นต้น `# h1`)
 * 3. heading map ของ TOC คำนวณจาก markdown (CM6 ไม่มี id ใน DOM) — ข้าม code fence
 * 4. ไม่มี swap path เหลืออยู่ (ตรวจแล้วที่ app.test.ts)
 */

function setup(files: Record<string, string | Uint8Array>) {
  const fs = memoryVaultFs(files)
  const state = new VaultState(fs, "vault")
  const cache = new FragmentCache(null, RENDERER_VERSION)
  const renderer = new DocRenderer(fs, state, cache)
  const hub = new SseHub()
  const app = createDokuApp({ fs, vaultName: "vault", state, renderer, hub })
  return { app }
}

describe("one surface — live reload guard (docs/08 ข้อ 65)", () => {
  test("มีงานค้าง (data-dirty) → ห้าม reload ทุกกรณี", () => {
    expect(shouldReloadOnChange(true, 0, 10_000)).toBe(false)
    expect(shouldReloadOnChange(true, 5_000, 1_000)).toBe(false)
  })

  test("สะอาด + ไม่มี window → reload (live reload ต้องยังทำงาน)", () => {
    expect(shouldReloadOnChange(false, 0, 1_000)).toBe(true)
  })

  test("autosave ตัวเองไม่ trigger reload — echo ของ watcher มาถึงใน ~330ms", () => {
    const savedAt = 1_000
    const suppressUntil = savedAt + 1_500 // ตั้งโดย listener "doku:saved"
    // watcher (awaitWriteFinish 80ms) + SSE debounce 250ms
    expect(shouldReloadOnChange(false, suppressUntil, savedAt + 330)).toBe(false)
    expect(shouldReloadOnChange(false, suppressUntil, savedAt + 1_499)).toBe(false)
    // หลัง window = การแก้จากที่อื่น → reload ตามปกติ
    expect(shouldReloadOnChange(false, suppressUntil, savedAt + 1_500)).toBe(true)
  })
})

describe("heading map — TOC เลื่อนカーใน editor ได้ (docs/09 §3.1)", () => {
  test("เก็บเฉพาะ h2/h3 ตามลำดับ + offset ตรงบรรทัดจริง + ข้าม code fence", () => {
    const md = [
      "# ชื่อเรื่อง",
      "",
      "## ส่วนที่ 1",
      "",
      "```ts",
      "## หัวข้อในโค้ด (ต้องไม่นับ)",
      "```",
      "",
      "### ส่วนที่ 1.1",
      "",
      "เนื้อหา",
    ].join("\n")

    const found = headingsInMarkdown(md)
    expect(found.map((entry) => entry.depth)).toEqual([2, 3])
    expect(found[0]?.pos).toBe(md.indexOf("## ส่วนที่ 1"))
    expect(found[1]?.pos).toBe(md.indexOf("### ส่วนที่ 1.1"))
    expect(found[0]?.text).toBe("ส่วนที่ 1")
  })

  test("normalize ข้อความหัวข้อให้เทียบกับ TOC ของ server ได้ (ตัด marker + inline code)", () => {
    const md = "## `code` และ **bold**\n"
    const found = headingsInMarkdown(md)
    expect(found[0]?.text).toBe("code และ bold")
  })
})

describe("data-title-in-body — เซ็ตที่ server ครั้งเดียว (docs/08 ข้อ 65)", () => {
  test('เอกสารที่ขึ้นต้นด้วย `# h1` → <html data-title-in-body="1">', async () => {
    const { app } = setup({ "a.md": "# หัวเรื่อง\n\nเนื้อหา\n" })
    const html = await (await app.request("/d/a")).text()
    expect(html).toContain('data-title-in-body="1"')
    // payload ยังฝัง markdown ให้ client mount editor ได้โดยไม่ fetch
    expect(html).toContain('id="doku-doc-md"')
  })

  test("เอกสารที่ไม่มี h1 นำหน้า → ไม่มี attribute (ชื่อเรื่องไม่หายตอนไม่ mount)", async () => {
    const { app } = setup({
      "b.md": "เนื้อหาไม่มีหัวเรื่อง\n",
      "b.meta.json": JSON.stringify({ title: "B" }),
    })
    const html = await (await app.request("/d/b")).text()
    expect(html).not.toContain("data-title-in-body")
    expect(html).toContain("B")
  })
})
