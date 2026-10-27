import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

import { CLIENT_JS } from "../src/web/client.ts"

/**
 * Regression — palette (Ctrl/⌘K) ต้องเปิดได้จริงบนทุกแพลตฟอร์ม + แถวผลลัพธ์เรียบเสมอกัน
 *
 * - Chrome/Edge บน Linux/Windows จอง Ctrl+K ไปโฟกัสช่องค้นหา → หน้าเว็บไม่ได้รับ event
 *   จึงต้องมี "/" เป็นทางลัดสำรอง และ label บนปุ่มต้องบอกคีย์ที่ใช้ได้จริง
 * - Mac ใช้ ⌘K (metaKey) — label/คีย์ลัดใน overlay ต้องเป็น ⌘ ไม่ใช่ Ctrl
 * - แถวผลลัพธ์มีไอคอนนำ + ความสูงเท่ากันทุกแถว (grid 3 คอลัมน์ + min-height)
 */

const APP_CSS = readFileSync(new URL("../src/web/styles/app.css", import.meta.url), "utf8")
const LAYOUT = readFileSync(new URL("../src/web/pages/layout.tsx", import.meta.url), "utf8")

function ruleBlock(selector: string): string {
  const at = APP_CSS.indexOf(`${selector} {`)
  if (at === -1) throw new Error(`ไม่เจอ rule: ${selector}`)
  return APP_CSS.slice(at, APP_CSS.indexOf("}", at))
}

describe("palette — เปิดได้ทุกแพลตฟอร์ม", () => {
  test("รับทั้ง metaKey และ ctrlKey", () => {
    expect(CLIENT_JS).toContain("event.metaKey || event.ctrlKey")
  })

  test("มีทางลัด / สำหรับเบราว์เซอร์ที่ยึด Ctrl+K", () => {
    expect(CLIENT_JS).toContain('event.key === "/"')
    expect(CLIENT_JS).toContain("openPalette()")
  })

  test("label บนปุ่มเปลี่ยนตามแพลตฟอร์ม (⌘K / /)", () => {
    expect(CLIENT_JS).toContain("[data-palette-key]")
    expect(CLIENT_JS).toContain("navigator.platform")
  })

  test("คีย์ลัดใน overlay มี hook ให้เปลี่ยน Ctrl → ⌘", () => {
    expect(LAYOUT).toContain("data-palette-kbd")
    expect(LAYOUT).toContain("data-mod-key")
  })
})

describe("palette — แถวผลลัพธ์เรียบเสมอกัน", () => {
  test("แถวเป็น grid 3 คอลัมน์ (ไอคอน · ชื่อ · path)", () => {
    const block = ruleBlock(".doku-palette-list button")
    expect(block).toMatch(/grid-template-columns:\s*15px minmax\(0, 1fr\) auto/)
  })

  test("ทุกแถวสูงเท่ากันด้วย min-height", () => {
    expect(ruleBlock(".doku-palette-list button")).toMatch(/min-height:\s*2\.375rem/)
  })

  test("ชื่อและ path ตัด ellipsis ไม่ดันความสูง", () => {
    expect(ruleBlock(".doku-palette-list .doku-palette-label")).toContain("text-overflow: ellipsis")
    expect(ruleBlock(".doku-palette-list .doku-palette-hint")).toContain("text-overflow: ellipsis")
  })

  test("มี sprite สำหรับไอคอน (ไม่ฝัง SVG ซ้ำทุกแถว)", () => {
    expect(LAYOUT).toContain("PALETTE_SPRITE")
    expect(LAYOUT).toMatch(/pi-\$\{name\}/)
  })
})
