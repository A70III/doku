/**
 * QoL pass — สิ่งที่ผู้ใช้เจอทุกวัน
 *
 * พิสูจน์: โฟลเดอร์ `assets` ที่เป็น media store ไม่กินที่ในแผนผัง · ตัวกรอง/จำนวนเอกสาร
 * เรนเดอร์มาจาก SSR · ปุ่มกลับขึ้นบน + dialog แทน prompt มีจริง · client รู้จัก paste/drop
 * อัปโหลด และจำตำแหน่งอ่าน
 */

import { describe, expect, test } from "bun:test"
import { memoryRevisionStore, memoryVaultFs, RENDERER_VERSION } from "@doku/core"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"
import { CLIENT_JS } from "../src/web/client.ts"

const DOC = "# หัวเรื่อง\n\nเนื้อหา\n"

function setup(files: Record<string, string | Uint8Array>) {
  const fs = memoryVaultFs(files)
  const state = new VaultState(fs, "vault")
  const cache = new FragmentCache(null, RENDERER_VERSION)
  const renderer = new DocRenderer(fs, state, cache)
  const hub = new SseHub()
  const app = createDokuApp({
    fs,
    vaultName: "vault",
    state,
    renderer,
    hub,
    revisions: memoryRevisionStore(),
  })
  return { app, state }
}

describe("QoL — แผนผังและสื่อ", () => {
  test("โฟลเดอร์ assets ที่ไม่มีเอกสารถูกซ่อนจากแผนผัง (media store ไม่กินที่)", async () => {
    const { app } = setup({
      "notes/a.md": DOC,
      "notes/assets/photo.png": new Uint8Array([1, 2, 3]),
      "manual-assets/b.md": DOC,
    })
    const html = await (await app.request("/")).text()
    expect(html).toContain('data-folder-path="notes"')
    expect(html).not.toContain('data-folder-path="notes/assets"')
    // โฟลเดอร์ชื่ออื่นที่มีเอกสารอยู่ข้างใน = ยังแสดงตามปกติ
    expect(html).toContain('data-folder-path="manual-assets"')
  })

  test("โฟลเดอร์ชื่อ assets ที่มีเอกสารข้างในยังแสดง (ไม่ใช่ที่เก็บ media)", async () => {
    const { app } = setup({ "assets/readme.md": DOC })
    const html = await (await app.request("/")).text()
    expect(html).toContain('data-folder-path="assets"')
  })

  test("ช่องค้นหามีช่องเดียว (palette) — ไม่มีช่องกรองแผนผังแยก + จำนวนเอกสารต่อโฟลเดอร์", async () => {
    const { app } = setup({ "notes/a.md": DOC, "notes/b.md": DOC, "notes/deep/c.md": DOC })
    const html = await (await app.request("/")).text()
    expect(html).not.toContain('id="doku-tree-filter"')
    expect(html).toContain('data-action="palette"')
    expect(html).toContain("doku-rail-count")
    // notes มี 3 เอกสาร (นับรวม subfolder)
    expect(html).toMatch(/data-folder-path="notes"[\s\S]{0,900}?doku-rail-count[^>]*>\s*3\s*</)
  })

  test("หน้าอ่านมีปุ่มกลับขึ้นบน · dialog ถามข้อความ · แผงคีย์ลัด", async () => {
    const { app } = setup({ "a.md": DOC })
    const html = await (await app.request("/d/a")).text()
    expect(html).toContain('data-action="to-top"')
    expect(html).toContain('id="doku-ask-input"')
    expect(html).toContain('id="doku-keys"')
    expect(html).toContain("คีย์ลัด")
  })

  test("client: paste/drop อัปโหลดเข้า assets · จำตำแหน่งอ่าน · askText แทน prompt", () => {
    expect(CLIENT_JS).toContain("/assets")
    expect(CLIENT_JS).toContain("FormData")
    expect(CLIENT_JS).toContain("doku.read-position")
    expect(CLIENT_JS).toContain("bindMediaDrop")
    expect(CLIENT_JS).toContain("insertBlock")
    expect(CLIENT_JS).toContain("function askText")
    // prompt เดิมเหลือได้แค่ fallback ตัวเดียว (ตอน DOM ไม่มี)
    expect(CLIENT_JS.split("window.prompt(").length - 1).toBe(1)
  })
})
