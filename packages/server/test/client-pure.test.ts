import { describe, expect, test } from "bun:test"
import {
  basename,
  dirname,
  encodePath,
  fenceMarker,
  frontmatterLength,
  gutterOffset,
  inRect,
  joinPath,
  normalizeHeading,
  placeFloating,
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

describe("gutterOffset — ปุ่ม `+`/`⋮⋮` ต้องไม่ทับตัวอักษร (docs/09 §3.3)", () => {
  const WIDTH = 48 // ความกว้าง gutter (ปุ่ม 18×2 + gap 4 + padding-inline 4×2)
  const GAP = 4 // ระยะห่างระหว่าง gutter กับต้นบรรทัดของคอลัมน์อ่าน

  test("มีที่ด้านซ้าย → เยื้องออกนอกคอลัมน์อ่านเต็มจำนวน (ค่าลบ)", () => {
    expect(gutterOffset(460, WIDTH, GAP)).toBe(-(WIDTH + GAP))
  })

  test("จอแคบ/200% zoom — clamp ที่ขอบซ้ายของ viewport (ห้าม horizontal overflow)", () => {
    expect(gutterOffset(24, WIDTH, GAP)).toBe(GAP - 24)
    expect(gutterOffset(4, WIDTH, GAP)).toBe(0)
  })

  test("ห้ามเป็นค่าบวก — ค่าบวก = ยิ่งทับข้อความ (บั๊กเดิม `Math.max(0, -44)` = 0)", () => {
    for (const articleLeft of [0, 4, 24, 100, 460, 1200]) {
      const offset = gutterOffset(articleLeft, WIDTH, GAP)
      expect(offset).toBeLessThanOrEqual(0)
      expect(offset).toBeGreaterThanOrEqual(-(WIDTH + GAP))
    }
  })
})

describe("placeFloating — กล่องลอยต้องอยู่ใน viewport (เลื่อนในกล่องเอง)", () => {
  const viewport = { width: 1440, height: 800 }
  const noScroll = { x: 0, y: 0 }
  const anchor = { left: 464, top: 374, right: 496, bottom: 396 }

  test("ที่ด้านล่างพอ → วางใต้ anchor", () => {
    expect(placeFloating(anchor, { width: 192, height: 300 }, viewport, noScroll)).toEqual({
      left: 464,
      top: 400,
    })
  })

  test("กล่องสูงกว่า viewport → ยังอยู่บนจอ (ขอบล่างไม่เกิน viewport)", () => {
    const box = placeFloating(anchor, { width: 192, height: 640 }, viewport, noScroll)
    expect(box.top).toBeGreaterThanOrEqual(8)
    expect(box.top + 640).toBeLessThanOrEqual(viewport.height)
  })

  test("anchor ใกล้ขอบล่าง และด้านบนมีมากกว่า → พลิกขึ้นเหนือ anchor", () => {
    const low = { left: 100, top: 700, right: 140, bottom: 730 }
    expect(placeFloating(low, { width: 192, height: 300 }, viewport, noScroll).top).toBe(396)
  })

  test("scroll ถูกบวกกลับเป็นพิกัดเอกสาร (`.doku-menu` เป็น position: absolute)", () => {
    const box = placeFloating(anchor, { width: 192, height: 300 }, viewport, { x: 0, y: 1200 })
    expect(box.top).toBe(1600)
  })

  test("ไม่ล้นขอบซ้าย/ขวา", () => {
    const right = { left: 1400, top: 100, right: 1440, bottom: 130 }
    expect(placeFloating(right, { width: 192, height: 200 }, viewport, noScroll).left).toBe(1240)
    const left = { left: 2, top: 100, right: 42, bottom: 130 }
    expect(placeFloating(left, { width: 192, height: 200 }, viewport, noScroll).left).toBe(8)
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
