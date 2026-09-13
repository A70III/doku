import { describe, expect, test } from "bun:test"
import { parseAttrs, writeAttrs } from "../src/web/editor.ts"

/**
 * Regression test — attribute บน fence ของ directive หายจากไฟล์ตอนแก้ผ่านแผงควบคุม
 *
 * อาการ: `:::figure{src=assets/a.png caption="A" zoom}` (ค่าไม่ใส่ quote) → เปิดแผงแล้วแก้
 * `align` → เขียนกลับเป็น `:::figure{align="center" caption="A"}` → **src กับ zoom หาย**
 * (รูปหายทั้งรูป) · `:::video{src=assets/clip.mp4}` ก็แสดงช่อง src ว่าง
 *
 * root cause: `parseAttrs` ใช้ regex ที่รับเฉพาะ `key="value"` → ค่าที่ไม่ใส่ quote และ
 * flag เปล่า (`zoom`) ไม่ถูกอ่าน → `writeAttrs` สร้าง fence ใหม่จากชุดที่อ่านได้เท่านั้น
 *
 * อ้างอิง: docs/08 ข้อ 66 (เขียน fence กลับ = คง attribute เดิมทั้งหมด)
 */

/** view ปลอมสำหรับ writeAttrs — ใช้แค่ state.doc.lineAt + dispatch */
function fakeView(text: string) {
  const state = {
    doc: {
      lineAt: () => ({ from: 0, to: text.length, text }),
    },
  }
  let written = ""
  return {
    view: {
      state,
      dispatch: ({ changes }: { changes: { insert: string } }) => {
        written = changes.insert
      },
    },
    result: () => written,
  }
}

const INFO = (attrs: Record<string, string>) => ({
  name: "figure",
  attrs,
  fence: ":::",
  lineFrom: 0,
  top: 0,
  left: 0,
})

describe("parseAttrs — ต้องอ่าน attribute ได้ทุกรูปแบบที่ directive ยอมรับ", () => {
  test("double quotes (แบบเดิม)", () => {
    expect(parseAttrs('{src="assets/a.png" caption="A"}')).toEqual({
      src: "assets/a.png",
      caption: "A",
    })
  })

  test("unquoted value — เคสที่เคยหลุด", () => {
    expect(parseAttrs("{src=assets/clip.mp4}")).toEqual({ src: "assets/clip.mp4" })
  })

  test("single quotes", () => {
    expect(parseAttrs("{src='assets/a.png' caption='A'}")).toEqual({
      src: "assets/a.png",
      caption: "A",
    })
  })

  test("flag เปล่า (ไม่มี =)", () => {
    expect(parseAttrs("{src=assets/a.png zoom}")).toEqual({ src: "assets/a.png", zoom: "" })
  })

  test("ค่าผสม + data- attribute", () => {
    expect(parseAttrs('{color=blue note="ข้อความ ยาว" data-x=1}')).toEqual({
      color: "blue",
      note: "ข้อความ ยาว",
      "data-x": "1",
    })
  })

  test("ว่าง / ไม่ส่ง → {}", () => {
    expect(parseAttrs(undefined)).toEqual({})
    expect(parseAttrs("")).toEqual({})
  })
})

describe("writeAttrs — เขียน fence กลับโดยไม่ทำ attribute หาย", () => {
  test("แก้ align แล้ว src/caption/zoom ต้องอยู่ครบ", () => {
    const { view, result } = fakeView(':::figure{src=assets/a.png caption="A" zoom}')
    const parsed = parseAttrs('{src=assets/a.png caption="A" zoom}')
    writeAttrs(view as never, INFO(parsed) as never, { align: "center" })
    const line = result()
    expect(line).toContain('src="assets/a.png"')
    expect(line).toContain('caption="A"')
    expect(line).toContain('align="center"')
    expect(line).toContain(" zoom") // flag คงรูปเปล่า ไม่กลายเป็น zoom=""
    expect(line).not.toContain('zoom=""')
  })

  test("patch = null คือสั่งลบ attribute (ช่องเดียวกับที่ตั้งใจ)", () => {
    const { view, result } = fakeView(":::figure{src=x.png zoom}")
    writeAttrs(view as never, INFO({ src: "x.png", zoom: "" }) as never, { zoom: null })
    const line = result()
    expect(line).toContain('src="x.png"')
    expect(line).not.toContain("zoom")
  })

  test("เปลี่ยนชื่อ block (variant) ยังทำงาน", () => {
    const { view, result } = fakeView(":::note{title=x}")
    writeAttrs(view as never, INFO({ title: "x" }) as never, { name: "warning" })
    expect(result().startsWith(":::warning")).toBe(true)
  })
})
