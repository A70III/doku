import { describe, expect, test } from "bun:test"
import { CLIENT_JS } from "../src/web/client.ts"

/**
 * Regression test — ออกจากโหมดเขียน (Esc / คลิก chrome / คลิกลิงก์ TOC) พัง
 *
 * อาการ: ทุกครั้งที่ออกจากโหมดเขียน หน้าเด้งเป็น reload ทั้งหน้า แทนที่จะวาด
 * ผล render กลับเข้าคอลัมน์อ่านเดิมแบบ in-place
 *
 * root cause: `paintRendered` ใน `packages/server/src/web/client.ts` จบด้วย
 * `return html;` แต่ไม่มีตัวแปร `html` อยู่ใน scope เลย (ค่าจริงอยู่ที่
 * `result.html`) → โยน `ReferenceError: html is not defined` ทุกครั้งหลัง
 * paint เสร็จ → `exitWriting` โดน catch → `fail(error) + reload()`
 *
 * อ้างอิง: docs/03 §4 "Zen mode — ESC ออก" + docs/08 ข้อ 52/54 (ออกโหมดเขียน
 * ด้วย Esc / คลิก chrome โดยไม่ reload — autosave ทำงานตลอด)
 *
 * วิธีทดสอบ: ดึง body ของ `paintRendered` จริงจาก CLIENT_JS มา execute
 * กับ DOM จำลอง — ต้อง resolve และคืน HTML ที่ render (ตอนนี้ throw → RED)
 */

/** ดึงซอร์สของ function ที่ขึ้นต้นด้วย signature ที่กำหนด (นับวงเล็บปีกกาจับคู่) */
function extractFunction(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error("ไม่เจอ function: " + signature)
  const open = source.indexOf("{", start)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === "{") depth += 1
    else if (ch === "}") {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error("function ไม่ปิด block: " + signature)
}

describe("ออกจากโหมดเขียน (Esc / คลิก chrome) — paintRendered", () => {
  test("paintRendered ต้อง resolve + วาด HTML ลง body แล้วคืนค่า HTML เดิม (ไม่ throw)", async () => {
    const src = extractFunction(CLIENT_JS, "async function paintRendered(md)")

    const painted = { innerHTML: "" }
    const rendered = "<p>หัวข้อใหม่</p>"

    const makePaint = new Function(
      "bodyEl",
      "renderFragment",
      "syncHeader",
      "syncTocFromBody",
      "$",
      `return ${src};`,
    )
    const paintRendered = makePaint(
      painted,
      async () => ({ html: rendered, meta: { title: "หัวเรื่อง" } }),
      () => {},
      () => {},
      () => null, // $(".doku-colophon") = ไม่มีใน stub
    )

    const returned = await paintRendered("# หัวเรื่อง\n\nเนื้อหา")

    // วาดแล้ว + คืนค่าให้ exitWriting ใช้ต่อได้ (ตอนนี้: ReferenceError: html is not defined)
    expect(painted.innerHTML).toBe(rendered)
    expect(returned).toBe(rendered)
  })

  test("นับจำนวนคำใน colophon ต้องแยกด้วย whitespace ไม่ใช่ตัวอักษร 's'", async () => {
    const src = extractFunction(CLIENT_JS, "async function paintRendered(md)")

    const painted = { innerHTML: "" }
    const wordNode = { textContent: "" }
    const colophon = {
      querySelector: (sel: string) => (sel === "[data-part='colophon-words']" ? wordNode : null),
    }

    const makePaint = new Function(
      "bodyEl",
      "renderFragment",
      "syncHeader",
      "syncTocFromBody",
      "$",
      `return ${src};`,
    )
    const paintRendered = makePaint(
      painted,
      async () => ({ html: "<p>x</p>", meta: { title: "หัวเรื่อง" } }),
      () => {},
      () => {},
      (sel: string) => (sel === ".doku-colophon" ? colophon : null),
    )

    // "status" มีตัว s 2 ตัว — ถ้า regex หลุด \ เป็น /s+/u คำนี้จะถูกตัดเป็นหลายชิ้น
    await paintRendered("status สถานะ สอง")
    expect(wordNode.textContent).toBe("3 คำ")
  })
})
