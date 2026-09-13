import { describe, expect, test } from "bun:test"
import { isSafeAssetName, isSafeAssetPath } from "../src/assets.ts"

/**
 * charset ของชื่อไฟล์ asset — docs/06 + docs/08 ข้อ 72
 * validator ตัวเดียวที่ใช้ร่วม `doku check` · route `/assets/*path` · render · (M4) upload
 */

describe("isSafeAssetName", () => {
  test("ชื่อปกติผ่าน — รวมไทย/ช่องว่าง/จุดหลายตัว", () => {
    for (const name of [
      "diagram.svg",
      "my file.png",
      "รูป ภาพ.png",
      "a.b.c.webp",
      "icon_2x-1.png",
      "x.svg",
    ]) {
      expect(isSafeAssetName(name)).toBe(true)
    }
  })

  test("ตัวอักษรนอก charset = ไม่ผ่าน (route จะ 404)", () => {
    for (const name of [
      "my file (1).png",
      "รูป(1).png",
      "a&b.png",
      "a+b.png",
      "a%b.png",
      "a@b.png",
      "a'b.png",
      "a,b.png",
      "a!b.png",
      "日本語.png",
    ]) {
      expect(isSafeAssetName(name)).toBe(false)
    }
  })

  test("dotfile / ไม่มีนามสกุล / ลงท้ายด้วยจุด หรือช่องว่าง = ไม่ผ่าน", () => {
    for (const name of [".env", ".hidden.png", "png", "image.", "image ", "", "a".repeat(256)]) {
      expect(isSafeAssetName(name)).toBe(false)
    }
  })

  test("isSafeAssetPath เช็ค basename เท่านั้น (โฟลเดอร์ใช้กฎของ vault path)", () => {
    expect(isSafeAssetPath("projects/doku/assets/diagram.svg")).toBe(true)
    expect(isSafeAssetPath("projects/doku (v2)/diagram.svg")).toBe(true)
    expect(isSafeAssetPath("projects/doku/assets/bad(1).png")).toBe(false)
  })
})
