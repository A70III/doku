import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

/**
 * Regression — doku-tree ยาวมากใน rail แล้วไหลทับ doku-rail-foot
 *
 * อาการ (รายงานจากผู้ใช้): vault ที่มีเอกสารเยอะ ๆ → แผนผังใน sidebar ยาวกว่าจอ
 *   แถวของ tree ยื่นลงมาทับ `.doku-rail-foot` (styleguide / trash / ธีม) จนใช้งานไม่ได้
 *
 * root cause (วัดจากเบราว์เซอร์จริงก่อนแก้ — playwright, viewport 800px):
 *   `.doku-rail-tree` มี `flex: 1; min-height: 0` แต่**ไม่มี overflow** → กล่องถูก flex
 *   บีบเหลือ 503px ขณะที่เนื้อในสูง 2,496px แล้วล้นออกมานอกกล่อง (overflow: visible)
 *   ทับ `.doku-rail-foot` ที่วางถัดไป (แถวล้ายื่นเลย foot **1,973px**) · ส่วน
 *   `.doku-rail` (`overflow-y: auto`) เลื่อนทั้งก้อน → foot ถูกดึงออกจากจอตอนเลื่อนล่าง
 *   (footVisible: false · lastRow.bottom 800 = ขอบจอ)
 *
 * วิธีแก้: ให้ tree เป็น scroll container ของตัวเอง (`overflow-y: auto`) — แยก
 *   header / scroll-area / footer ชัดเจน: head + ค้นหา คงอยู่บน, tree เลื่อนในกล่อง,
 *   foot ตรึงท้าย rail 100vh · `.doku-rail` คง `overflow-y: auto` ไว้เป็น fallback
 *   ของจอเตี้ยพิเศษ (head + foot เกิน 100vh)
 *
 * อ้างอิง: docs/08 ข้อ 84
 */

const APP_CSS = readFileSync(new URL("../src/web/styles/app.css", import.meta.url), "utf8")

/** ดึง block ของ rule แรกที่ selector ตรงเป๊ะ (เลิกที่ `}` แรก) */
function ruleBlock(selector: string): string {
  const at = APP_CSS.indexOf(`${selector} {`)
  if (at === -1) throw new Error(`ไม่เจอ rule: ${selector}`)
  return APP_CSS.slice(at, APP_CSS.indexOf("}", at))
}

describe("rail — tree ยาวต้องเลื่อนในตัว ไม่ทับ doku-rail-foot", () => {
  test(".doku-rail-tree เป็น scroll container (overflow-y: auto|scroll)", () => {
    const block = ruleBlock(".doku-rail-tree")
    expect(block).toMatch(/overflow-y:\s*(auto|scroll)/)
  })

  test("tree คงสัญญา flex เดิม — ยืดพื้นที่ที่เหลือ (foot จึงถูกตรึงท้าย rail) + มี min-height floor", () => {
    const block = ruleBlock(".doku-rail-tree")
    expect(block).toContain("flex: 1")
    // floor ต้องมากกว่า 0 — จอเตี้ยมากต้องไม่ให้ tree ยุบเหลือไม่กี่ px
    // (ถ้าหดถึง 0 → พื้นที่ที่เหลือถูก foot ยึด → rail ไม่ overflow → fallback ใช้ไม่ได้)
    expect(block).not.toContain("min-height: 0")
    const minH = block.match(/min-height:\s*([^;]+);/)?.[1]?.trim()
    expect(minH).toBeDefined()
    expect(minH).toMatch(/var\(--d-space-\d+\)/)
  })

  test(".doku-rail คง overflow-y: auto ไว้เป็น fallback ของจอเตี้ย (head+foot เกิน 100vh)", () => {
    expect(ruleBlock(".doku-rail")).toContain("overflow-y: auto")
  })

  test("แถบ active ห้ามยื่นซ้ายออกนอกกล่อง — scroll container ใหม่จะ clip มันเหลือ 1px", () => {
    // เดิม .doku-row-link.is-active ใช้ margin-inline-start: -1px ให้แถบ accent ยื่นเลย
    // ขอบเนื้อหา 1px — ตอน overflow: visible โชว์ครบ 2px แต่พอ tree เป็น scroll container
    // กล่องถูก clip ที่ padding box → แถบหดเหลือ 1px (วัดจริง: activeLeft 23 < scrollport 24)
    const block = ruleBlock(".doku-row-link.is-active")
    expect(block).toContain("border-inline-start: 2px")
    expect(block).not.toContain("margin-inline-start: -1px")
    // ชดเชยตำแหน่งข้อความให้เท่าเดิมเป๊ะ: เดิม 24(ขอบ) − 1(margin) + 2(border) + 12(pad) = 37
    const padStart = block.match(/padding-inline-start:\s*([^;]+);/)?.[1]?.trim()
    expect(padStart).toBe("calc(var(--d-space-3) - 1px)")
  })
})
