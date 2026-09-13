import { describe, expect, test } from "bun:test"
import { parseHTML } from "linkedom"
import {
  alignPaste,
  applyLink,
  detectMarks,
  htmlToMarkdown,
  linkAt,
  minimalChange,
  replaceEmoji,
  setHighlightColor,
  toggleInlineMark,
} from "../src/web/editor/inline.ts"

/**
 * M3.2 Track D — inline layer (docs/09 §5 Track D)
 * ทุกฟังก์ชันเป็น md → md (ไม่มี state ซ่อน) · smart paste ไม่มี HTML ดิบหลุด
 */

describe("toggleInlineMark", () => {
  test("ครอบข้อความที่เลือก + คง selection", () => {
    const result = toggleInlineMark("hello world", 0, 5, "bold")
    expect(result.text).toBe("**hello** world")
    expect(result.from).toBe(2)
    expect(result.to).toBe(7)
  })

  test("กดซ้ำ = ถอด marker (idempotent)", () => {
    const once = toggleInlineMark("hello", 0, 5, "italic")
    const twice = toggleInlineMark(once.text, once.from, once.to, "italic")
    expect(twice.text).toBe("hello")
    expect(twice.from).toBe(0)
    expect(twice.to).toBe(5)
  })

  test("カーว่าง = ใส่ marker แล้ววางカーใน", () => {
    const result = toggleInlineMark("abc", 1, 1, "code")
    expect(result.text).toBe("a``bc")
    expect(result.from).toBe(2)
  })

  test("highlight ใส่ `{.color}` ได้ + ถอดออกทั้ง suffix", () => {
    const result = toggleInlineMark("คำ", 0, 3, "highlight", "amber")
    expect(result.text).toBe("==คำ=={.amber}")
    const off = toggleInlineMark(result.text, result.from, result.to, "highlight")
    expect(off.text).toBe("คำ")
  })

  test("มี marker อยู่แล้ว + เลือกทั้งก้อน = ถอด", () => {
    const result = toggleInlineMark("**bold**", 0, 8, "bold")
    expect(result.text).toBe("bold")
  })

  test("カーอยู่กลาง region → ถอดทั้งช่วง (ไม่เดาจาก marker ที่ติดกับカー)", () => {
    const result = toggleInlineMark("นำ **หน้า แน่น** มาก", 8, 8, "bold")
    expect(result.text).toBe("นำ หน้า แน่น มาก")
    expect(result.from).toBe(3)
  })

  test("`*` ของ italic ไม่กิน `**` ของ bold (หรือกลับกัน)", () => {
    expect(detectMarks("**หนา**", 2, 5)).toEqual(["bold"])
    expect(detectMarks("*เอน* **หนา**", 1, 4)).toEqual(["italic"])
    expect(toggleInlineMark("abc def", 4, 7, "italic").text).toBe("abc *def*")
  })
})

describe("detectMarks — สถานะของ bubble toolbar", () => {
  test("รู้ mark ที่ selection อยู่ในช่วง", () => {
    expect(detectMarks("a **b** c", 4, 5)).toEqual(["bold"])
    expect(detectMarks("a `c` d ==e==", 3, 3)).toEqual(["code"])
    expect(detectMarks("==ไฮไลต์=={.amber}", 3, 5)).toEqual(["highlight"])
    expect(detectMarks("ไม่มี mark", 0, 3)).toEqual([])
  })
})

describe("minimalChange — change เล็กที่สุดสำหรับ CM dispatch", () => {
  test("ตัดเฉพาะส่วนที่ต่าง", () => {
    // ครอบ marker สองข้าง = เปลี่ยนเฉพาะข้อความที่อีกฝั่งมี (ก่อน/หลัง)
    expect(minimalChange("hello", "hello world")).toEqual({
      from: 5,
      to: 5,
      insert: " world",
    })
    expect(minimalChange("abc", "axc")).toEqual({ from: 1, to: 2, insert: "x" })
  })

  test("ข้อความเท่ากัน = ไม่มี change", () => {
    expect(minimalChange("same", "same")).toBeNull()
  })
})

describe("setHighlightColor — เลือกสีของ ==…== (ไม่ถอด marker)", () => {
  test("ครอบใหม่ด้วยสี", () => {
    const result = setHighlightColor("คำ", 0, 3, "amber")
    expect(result.text).toBe("==คำ=={.amber}")
    expect(result.from).toBe(2)
    expect(result.to).toBe(4)
  })

  test("มี highlight อยู่แล้ว = เปลี่ยนสี ไม่ซ้อน marker", () => {
    const result = setHighlightColor("==คำ=={.amber}", 4, 4, "blue")
    expect(result.text).toBe("==คำ=={.blue}")
  })

  test("color = null → เอาเฉพาะ `{.color}` ออก คง `==…==`", () => {
    const result = setHighlightColor("==คำ=={.amber}", 4, 4, null)
    expect(result.text).toBe("==คำ==")
  })

  test("カーว่าง = ใส่ marker เปล่าให้พิมพ์ต่อ (カーใน)", () => {
    const result = setHighlightColor("", 0, 0, "red")
    expect(result.text).toBe("===={.red}")
    expect(result.from).toBe(2)
  })
})

describe("applyLink / linkAt", () => {
  test("ใส่ลิงก์รอบข้อความที่เลือก", () => {
    // "อ่าน " = 5 หน่วย → docs อยู่ที่ index 5..9
    const result = applyLink("อ่าน docs ที่นี่", 5, 9, "https://x.dev")
    expect(result.text).toBe("อ่าน [docs](https://x.dev) ที่นี่")
  })

  test("カーในลิงก์เดิม → แก้ URL ไม่ซ้อนลิงก์", () => {
    const result = applyLink("ดู [docs](https://old.dev) นี่", 3, 3, "https://new.dev", 3)
    expect(result.text).toBe("ดู [docs](https://new.dev) นี่")
  })

  test("url ว่าง = ถอดลิงก์เหลือข้อความ", () => {
    const result = applyLink("ดู [docs](https://old.dev) นี่", 3, 3, "", 3)
    expect(result.text).toBe("ดู docs นี่")
  })

  test("linkAt หาช่วงของลิงก์ที่カーอยู่", () => {
    const found = linkAt("[docs](https://x.dev)", 3)
    expect(found).toEqual({ from: 0, to: 21, label: "docs", url: "https://x.dev" })
    expect(linkAt("[docs](https://x.dev)", 40)).toBeNull()
  })
})

describe("htmlToMarkdown (smart paste)", () => {
  // linkedom (devDependency) คืน window-like object ที่มี `.document` — เบราว์เซอร์ใช้ DOMParser
  // ที่คืน Document ตรง ๆ · helper นี้แปลงให้รูปร่างเท่ากัน (HtmlNode)
  const parse = (html: string) =>
    (parseHTML(`<html><body>${html}</body></html>`) as { document: unknown }).document as never

  test("โครงสร้างพื้นฐาน: heading/list/link/code", () => {
    const md = htmlToMarkdown(
      "<h2>หัวข้อ</h2><p>ย่อหน้า <strong>หนา</strong> และ <em>เอียง</em></p>" +
        "<ul><li>หนึ่ง</li><li>สอง</li></ul>" +
        '<p><a href="https://x.dev">ลิงก์</a></p>',
      parse,
    )
    expect(md).toContain("## หัวข้อ")
    expect(md).toContain("ย่อหน้า **หนา** และ *เอียง*")
    expect(md).toContain("- หนึ่ง\n- สอง")
    expect(md).toContain("[ลิงก์](https://x.dev)")
  })

  test("ไม่มี HTML ดิบหลุด (script/style/iframe ถูกทิ้ง)", () => {
    const md = htmlToMarkdown(
      '<p>ปลอดภัย</p><script>alert(1)</script><iframe src="x"></iframe><style>p{}</style>',
      parse,
    )
    expect(md).toBe("ปลอดภัย")
    expect(md).not.toContain("<")
  })

  test("javascript: URL ไม่กลายเป็นลิงก์", () => {
    const md = htmlToMarkdown('<a href="javascript:alert(1)">กด</a>', parse)
    expect(md).toBe("กด")
  })

  test("ตาราง → pipe table", () => {
    const md = htmlToMarkdown(
      "<table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>",
      parse,
    )
    expect(md).toContain("| a | b |")
    expect(md).toContain("| --- | --- |")
    expect(md).toContain("| 1 | 2 |")
  })
})

describe("replaceEmoji", () => {
  test("แทน `:name:` ที่รู้จัก", () => {
    expect(replaceEmoji("เสร็จแล้ว :white_check_mark:", 29)).toEqual({
      from: 11,
      to: 29,
      insert: "✅",
    })
  })

  test("ไม่รู้จัก/ไม่ปิด colon = ไม่แตะ", () => {
    expect(replaceEmoji(":nope:", 6)).toBeNull()
    expect(replaceEmoji(":smile", 6)).toBeNull()
  })
})

describe("alignPaste — โครงสร้างที่ paste ต้องเริ่ม block ได้จริง", () => {
  test("カーต้นบรรทัด = ปล่อยตามเดิม", () => {
    expect(alignPaste("", "## หัวข้อ")).toBe("## หัวข้อ")
    expect(alignPaste("   ", "- ข้อ")).toBe("- ข้อ")
  })

  test("カーกลางบรรทัด + paste block → ขึ้นบรรทัดใหม่", () => {
    expect(alignPaste("ข้อความเดิม", "## หัวข้อ")).toBe("\n\n## หัวข้อ")
    expect(alignPaste("ข้อความเดิม", "- ข้อ")).toBe("\n\n- ข้อ")
    expect(alignPaste("ข้อความเดิม", "```")).toBe("\n\n```")
  })

  test("カーกลางบรรทัด + paste ข้อความล้วน → ไม่แตะ", () => {
    expect(alignPaste("ข้อความเดิม", "ต่อท้าย")).toBe("ต่อท้าย")
  })
})
