/**
 * FolderPage route (M3.5 · plan 3.5.2 · ticket 06)
 *
 * - `GET /d/<folder>` → 200 (เดิม 404) พร้อมหัว + โฟลเดอร์ย่อย + รายการเอกสาร
 * - ticket 06 ข้อ 8c: `x/` + `x.md` อยู่คู่กัน → `/d/x` เปิดเอกสารเสมอ (doc wins)
 * - path ที่ไม่มีจริง → ยังเป็น 404
 */

import { describe, expect, test } from "bun:test"
import { memoryVaultFs, RENDERER_VERSION } from "@doku/core"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"

function setup(files: Record<string, string | Uint8Array>) {
  const fs = memoryVaultFs(files)
  const state = new VaultState(fs, "vault")
  const cache = new FragmentCache(null, RENDERER_VERSION)
  const renderer = new DocRenderer(fs, state, cache)
  const hub = new SseHub()
  const app = createDokuApp({ fs, vaultName: "vault", state, renderer, hub })
  return { app, fs }
}

const GOOD_DOC = "# หัวเรื่อง\n\nเนื้อหายาว ๆ ที่นี่\n"

/** ตัด sidebar/chrome ออก — เอาเฉพาะ `<main>` เพื่อตรวจลำดับในเนื้อหน้า */
function mainOf(html: string): string {
  return html.slice(html.indexOf("<main"))
}

describe("GET /d/* — FolderPage (M3.5 3.5.2)", () => {
  test("โฟลเดอร์ → 200 + masthead/breadcrumb + โฟลเดอร์ย่อย + รายการเอกสาร (เดิม 404)", async () => {
    const { app } = setup({
      "projects/design.md": GOOD_DOC,
      "projects/guide.md": GOOD_DOC,
      "projects/deep/note.md": GOOD_DOC,
      "projects/_folder.meta.json": JSON.stringify({ title: "โครงการ" }),
    })
    const res = await app.request("/d/projects")
    expect(res.status).toBe(200)
    const html = await res.text()
    const main = mainOf(html)

    // masthead: breadcrumb (root เป็นลิงก์หน้าแรก · ปัจจุบันเป็นข้อความเปล่า) + title จาก folder meta
    expect(main).toContain('aria-label="เส้นทาง"')
    expect(main).toContain('href="/"')
    expect(main).toContain("โครงการ")
    expect(main).toContain("2 เอกสาร · 1 โฟลเดอร์ย่อย")

    // ไม่มีปุ่ม action ใน header (ticket 06 ข้อ 8b) — เมนู ⋯ อยู่ที่ sidebar row menu เดิม
    const header = main.slice(main.indexOf("<header"), main.indexOf("</header>"))
    expect(header).not.toContain("<button")

    // โฟลเดอร์ย่อยมีลิงก์ /d/ + จำนวนเอกสาร (มาก่อนรายการเอกสาร — ticket 06 ข้อ 8a)
    expect(main).toContain('href="/d/projects/deep"')
    expect(main.indexOf('href="/d/projects/deep"')).toBeLessThan(main.indexOf("เก่ากว่า"))

    // เอกสารถูก list + มีแถบ sort (ticket 05)
    expect(main).toContain('aria-label="เรียงลำดับ"')
    expect(main).toContain("?sort=name")
    expect(main).toContain("design")
  })

  test("Empty folder → 200 + empty state เงียบ ๆ บรรทัดเดียว", async () => {
    const { app, fs } = setup({ "keep.md": GOOD_DOC })
    await fs.mkdir("empty-folder")
    const res = await app.request("/d/empty-folder")
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("โฟลเดอร์นี้ว่าง")
    expect(html).toContain("0 เอกสาร · 0 โฟลเดอร์ย่อย")
  })

  test("x/ + x.md → /d/x เปิดเอกสารเสมอ (ticket 06 ข้อ 8c — doc wins)", async () => {
    const { app } = setup({
      "x.md": "# เอกสาร x\n",
      "x/inner.md": GOOD_DOC,
    })
    const res = await app.request("/d/x")
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('data-doc-id="x"')
    expect(html).toContain("เอกสาร x")
    expect(html).not.toContain("โฟลเดอร์ย่อย")
  })

  test("path ที่ไม่มีทั้งเอกสารและโฟลเดอร์ → ยังเป็น 404", async () => {
    const { app } = setup({ "projects/design.md": GOOD_DOC })
    const res = await app.request("/d/nope")
    expect(res.status).toBe(404)
    expect(await res.text()).toContain("404")
  })

  test("pin → โฟลเดอร์ย่อย → date groups + ?sort= เปลี่ยนลำดับ (SSR)", async () => {
    const { app } = setup({
      // mtime ของ memory fs = ทุกไฟล์ = 0 → groupDocsByDate จับลง "เก่ากว่า" ทั้งหมด
      "list/alpha.md": GOOD_DOC,
      "list/alpha.meta.json": JSON.stringify({ title: "ZZZ last" }),
      "list/zeta.md": GOOD_DOC,
      "list/zeta.meta.json": JSON.stringify({ title: "AAA first" }),
      "list/pin.md": GOOD_DOC,
      "list/pin.meta.json": JSON.stringify({ title: "หมุด", pinned: true }),
      "list/sub/note.md": GOOD_DOC,
    })

    // default (?sort= ไม่ส่ง): date groups + pin ขึ้นก่อนโฟลเดอร์ย่อย + active = วันที่
    // (นับจากลิงก์แถวโฟลเดอร์ย่อย — คำว่า "โฟลเดอร์ย่อย" โผล่ก่อนในบรรทัดสถิติของ header)
    const html = await (await app.request("/d/list")).text()
    const main = mainOf(html)
    expect(main.indexOf("ปักหมุด")).toBeLessThan(main.indexOf('href="/d/list/sub"'))
    expect(main.indexOf('href="/d/list/sub"')).toBeLessThan(main.indexOf("เก่ากว่า"))
    expect(main).toContain('aria-current="true"')
    expect(main).toContain("?sort=name")

    // ?sort=name: รายการแบน (ไม่แตกกลุ่มวันที่) + เรียงตาม title — AAA มาก่อน ZZZ
    // (ตาม id จะกลับด้าน: alpha < zeta → ZZZ ขึ้นก่อน — เลื่อน sort ต้องสลับจริง)
    const named = mainOf(await (await app.request("/d/list?sort=name")).text())
    expect(named).not.toContain("เก่ากว่า")
    expect(named.indexOf("AAA first")).toBeLessThan(named.indexOf("ZZZ last"))
    expect(named).toContain('aria-current="true"')
  })
})
