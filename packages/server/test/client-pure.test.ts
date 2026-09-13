import { describe, expect, test } from "bun:test"
import {
  basename,
  dirname,
  encodePath,
  fenceMarker,
  frontmatterLength,
  inRect,
  joinPath,
  normalizeHeading,
} from "../src/web/client/pure.ts"

/**
 * seam S1 (docs/08 ข้อ 78) — เทสต์ตรงของ interface ที่เพิ่งแยกออกมา
 *
 * ก่อนหน้านี้ helper เหล่านี้อยู่ใน template literal → เทสต์ได้เฉพาะที่ถูกงัดออกมาด้วย
 * brace matcher (`one-surface*.test.ts` ทำแบบนั้นกับ heading pipeline) หรือไม่ถูกเทสต์เลย
 * (`encodePath` · `inRect` · path helpers)
 */

describe("encodePath — encode ทีละ segment", () => {
  test("`/` ต้องไม่ถูก encode (path id คือเส้นทาง)", () => {
    expect(encodePath("projects/doku/design")).toBe("projects/doku/design")
  })

  test("ช่องว่าง/อักขระไทย/`#` ใน segment ถูก encode", () => {
    expect(encodePath("โปรเจกต์ ใหม่/a b.md")).toBe(
      `${encodeURIComponent("โปรเจกต์ ใหม่")}/${encodeURIComponent("a b.md")}`,
    )
    expect(encodePath("a#b")).not.toContain("#")
  })

  test("segment ว่าง (path ขึ้นต้น/ลงท้ายด้วย `/`) ไม่ throw", () => {
    expect(encodePath("a//b")).toBe("a//b")
  })
})

describe("path helpers", () => {
  test("basename/dirname ตัดที่ `/` ตัวสุดท้าย", () => {
    expect(basename("a/b/c")).toBe("c")
    expect(dirname("a/b/c")).toBe("a/b")
    expect(basename("a")).toBe("a")
    expect(dirname("a")).toBe("")
    expect(basename("/x")).toBe("x")
    expect(dirname("/x")).toBe("")
  })

  test("joinPath ไม่สร้าง `/` เกินเมื่อ dir ว่าง", () => {
    expect(joinPath("a/b", "c")).toBe("a/b/c")
    expect(joinPath("", "c")).toBe("c")
  })
})

describe("fenceMarker — ปิด fence ต้องเทียบ char+len", () => {
  test("fence 4 backtick ไม่ถูกปิดด้วย 3 backtick", () => {
    const open = fenceMarker("````md")
    expect(open).toEqual({ char: "`", len: 4, rest: "md" })
    const three = fenceMarker("```")
    expect(three?.len).toBe(3)
    expect(three?.char).toBe("`")
  })

  test("info string ของ backtick fence ห้ามมี backtick (CommonMark) → ไม่ใช่ fence", () => {
    expect(fenceMarker("```a`b")).toBeNull()
  })

  test("tilde fence ใช้ได้ และบรรทัดธรรมดาคืน null", () => {
    expect(fenceMarker("~~~")?.char).toBe("~")
    expect(fenceMarker("ข้อความ")).toBeNull()
    expect(fenceMarker("  ```x")).not.toBeNull() // indent ≤ 3
  })
})

describe("frontmatterLength — offset ของ heading นับจาก raw markdown", () => {
  test("ไม่มี frontmatter = 0", () => {
    expect(frontmatterLength("## a\n")).toBe(0)
  })

  test("มี frontmatter = ความยาว block รวม newline ตามสูตร md.length − body.length", () => {
    const md = "---\ntitle: X\n---\n\n## a\n"
    const body = "## a\n"
    expect(frontmatterLength(md)).toBe(md.length - body.length)
  })
})

describe("normalizeHeading — ต้องสมมาตรกับ text ของ TOC (server)", () => {
  test("ตัด marker ของ markdown แต่คงข้อความ", () => {
    expect(normalizeHeading("**หัวข้อ** `code`")).toBe("หัวข้อ code")
  })

  test("ลิงก์เหลือแค่ label", () => {
    expect(normalizeHeading("[Doku](https://doku.dev)")).toBe("doku")
  })

  test("คงพฤติกรรม `String(text)` เดิม — ไม่ throw กับค่าที่ไม่ใช่ string", () => {
    // เดิม (ใน template literal) คือ `String(text)` → ค่าที่ผู้เรียกส่งมาจึงต้องเป็น string อยู่แล้ว
    // (call site ใช้ `link.textContent || ""`) — เทสต์นี้ล็อกพฤติกรรมที่ยังเหมือนเดิม
    expect(normalizeHeading(undefined)).toBe("undefined")
    expect(() => normalizeHeading(null)).not.toThrow()
  })
})

describe("inRect — วัดด้วย rect ไม่ใช่ contains", () => {
  const rect = { left: 10, top: 20, right: 110, bottom: 80 }
  const element = (hidden = false) =>
    ({ hidden, getBoundingClientRect: () => rect }) as unknown as HTMLElement

  test("จุดในกรอบ = true · นอกกรอบ = false", () => {
    expect(inRect(element(), { clientX: 60, clientY: 50 })).toBe(true)
    expect(inRect(element(), { clientX: 9, clientY: 50 })).toBe(false)
    expect(inRect(element(), { clientX: 60, clientY: 81 })).toBe(false)
  })

  test("pad ขยายกรอบ — ใช้กับ hit-area ของ gutter/strip", () => {
    expect(inRect(element(), { clientX: 8, clientY: 50 }, 4)).toBe(true)
    expect(inRect(element(), { clientX: 4, clientY: 50 }, 4)).toBe(false)
  })

  test("element ที่ซ่อนอยู่ หรือ null → false เสมอ", () => {
    expect(inRect(element(true), { clientX: 60, clientY: 50 })).toBe(false)
    expect(inRect(null, { clientX: 60, clientY: 50 })).toBe(false)
  })
})
