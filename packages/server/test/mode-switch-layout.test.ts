import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { parseHTML } from "linkedom"
import { CLIENT_JS } from "../src/web/client.ts"

/**
 * Regression test — สลับ read ↔ write แล้ว "ทั้งหน้าจอ" ต้องไม่ขยับ
 *
 * อาการ (รายงาน): เข้า/ออกโหมดเขียนแล้ว layout เด้งไปเด้งมา — sidebar/rail ขยับ
 * และอ่านอยู่กลางเรื่องแล้วถูกโยนกลับไปต้นเรื่อง
 *
 * root cause (วัดจากเบราว์เซอร์จริงก่อนแก้):
 * 1. ระหว่างสลับ DOM (`bodyEl.textContent = ""` ตอนเข้า · ลบ editor host ตอนออก)
 *    คอลัมน์อ่านสูงเป็น 0 ชั่วขณะ → `scrollHeight` เท่า viewport → เบราว์เซอร์
 *    **clamp scrollY เป็น 0** (วัดได้: scrollY 1200 → 0) และ scrollbar ถูกถอด–ใส่กลับ
 *    ทำให้ shell ที่ `margin-inline: auto` เลื่อนซ้าย/ขวา = rail เด้ง
 * 2. prose กับ editor ใช้ rhythm ต่างกัน → เอกสารยาวไม่เท่ากัน (วัดจริง 5362px vs 4031px)
 *    → กลับมาแล้วบรรทัดที่คลิก/カーอยู่ เพี้ยน **1185px / 1200px** (ไปโผล่ใต้จอ)
 *
 * วิธีที่ถูก: ล็อกความสูงเดิมระหว่างสลับ + คืน scrollY แบบ instant (ห้าม smooth) และยึด
 * "บรรทัด" (ข้อความ + ตำแหน่งบนจอ) ไม่ใช่ตัวเลข scrollY · + `scrollbar-gutter: stable`
 * ที่ `html` กัน scrollbar โผล่/หาย
 *
 * อ้างอิง: docs/08 ข้อ 52/54 (สลับโหมด in-place) · ข้อ 64 (layout/บรรทัดต้องอยู่นิ่ง)
 */

/** ดึงซอร์สของ function ที่ขึ้นต้นด้วย signature ที่กำหนด (นับวงเล็บปีกกาจับคู่) */
function extractFunction(source: string, signature: string): string {
  const start = source.indexOf(signature)
  if (start === -1) throw new Error(`ไม่เจอ function: ${signature}`)
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
  throw new Error(`function ไม่ปิด block: ${signature}`)
}

interface Rect {
  top: number
}

/** จำลอง layout ของ linkedom (ไม่มี layout engine): page-space top ลบ scrollY */
function fakeLayout() {
  const dom = parseHTML(
    `<!DOCTYPE html><html><body><div id="doku-doc-body" class="doku-prose">` +
      `<ul><li><p>ย่อหน้าที่ 7 เนื้อหาทดสอบ</p></li></ul>` +
      `<p>ย่อหน้าที่ 8 เนื้อหาอื่น</p>` +
      `</div></body></html>`,
  )
  const document = dom.document as unknown as Document
  const bodyEl = document.getElementById("doku-doc-body") as HTMLElement
  const window = {
    scrollY: 1200,
    to: [] as Array<{ top: number; left?: number; behavior: string }>,
    scrollTo(options: { top: number; left?: number; behavior: string }) {
      this.to.push(options)
      this.scrollY = options.top
    },
  }

  const page = new Map<Element, number>()
  const li = document.querySelector("li") as HTMLElement
  const paragraph = document.querySelector("p") as HTMLElement
  const other = document.querySelectorAll("p")[1] as HTMLElement
  page.set(li, 1816) // li ห่อ p — ถ้าเลือกตัวนี้จะได้ delta ต่างจาก p 12px
  page.set(paragraph, 1828)
  page.set(other, 2600)
  for (const [node, top] of page) {
    node.getBoundingClientRect = () => ({ top: top - window.scrollY }) as unknown as Rect as DOMRect
  }

  const $$ = (selector: string, root?: ParentNode) =>
    Array.from(((root ?? document) as ParentNode).querySelectorAll(selector))
  return { document, bodyEl, window, $$, paragraph, li, other }
}

/** ประกอบ helper จริงจาก CLIENT_JS แล้วรันกับ DOM จำลอง */
function buildHelpers(haystack: ReturnType<typeof fakeLayout>) {
  const hook = CLIENT_JS.includes("const TICK = String.fromCharCode(96)")
    ? "const TICK = String.fromCharCode(96);"
    : ""
  const source = [
    hook,
    extractFunction(CLIENT_JS, "function plainText(text)"),
    extractFunction(CLIENT_JS, "function alignedNeedle(text)"),
    extractFunction(CLIENT_JS, "function applyScrollTop(top)"),
    extractFunction(CLIENT_JS, "function lockReadingHeight()"),
    extractFunction(CLIENT_JS, "function releaseReadingHeight()"),
    extractFunction(CLIENT_JS, "function alignByNeedle(needle, top)"),
    "return { plainText, alignedNeedle, applyScrollTop, lockReadingHeight, releaseReadingHeight, alignByNeedle };",
  ].join("\n")
  const hooks = new Function("$$", "bodyEl", "window", source)(
    haystack.$$,
    haystack.bodyEl,
    haystack.window,
  ) as {
    plainText: (text: string) => string
    alignedNeedle: (text: string) => string
    applyScrollTop: (top: number) => void
    lockReadingHeight: () => number
    releaseReadingHeight: () => void
    alignByNeedle: (needle: string, top: number) => number | null
  }
  return hooks
}

describe("needle — ข้อความเดียวกันจากสองฝั่ง (markdown source ↔ prose)", () => {
  const { alignedNeedle } = buildHelpers(fakeLayout())

  test("หัวข้อ h2: ฝั่ง md มี '## ' · ฝั่ง prose มี decorative '#' ต่อท้าย", () => {
    expect(alignedNeedle("## หัวข้อ 3")).toBe("หัวข้อ 3")
    expect(alignedNeedle("หัวข้อ 3#")).toBe("หัวข้อ 3")
  })

  test("รายการ/ลิสต์มีลำดับ — ตัด marker ต้นบรรทัด", () => {
    expect(alignedNeedle("- รายการแรก")).toBe("รายการแรก")
    expect(alignedNeedle("1. ข้อแรก")).toBe("ข้อแรก")
  })

  test("inline emphasis หายทั้งสองฝั่ง", () => {
    expect(alignedNeedle("**หนา**และ *เอียง*")).toBe("หนาและ เอียง")
  })

  test("ตัดที่ 24 ตัวอักษร (พอสำหรับจับคู่ ไม่ยาวจนพลาด)", () => {
    expect(alignedNeedle("ก".repeat(50)).length).toBe(24)
  })
})

describe("alignByNeedle — จัดบรรทัดเดิมกลับที่เดิม", () => {
  test("เลือก element เล็กสุดที่ตรง (li ห่อ p → p) และจัดให้ตรง top ที่จำไว้", () => {
    const haystack = fakeLayout()
    const { alignByNeedle } = buildHelpers(haystack)
    // p อยู่ page 1828 · scrollY 1200 → บนจอ 628 · เป้าหมาย 428 → ต้องเลื่อนไป 1400
    const residual = alignByNeedle("ย่อหน้าที่ 7 เนื้อหาทดสอบ", 428)
    expect(residual).toBe(200) // ระยะที่เพี้ยนก่อนจัด
    // ถ้าเลือก li (1816) จะได้ 1412 — เลือก p (ลึกกว่า) จึงต้องเป็น 1400
    expect(haystack.window.scrollY).toBe(1400)
    expect(haystack.window.to.at(-1)).toEqual({ top: 1400, left: 0, behavior: "instant" })
  })

  test("คืน null เมื่อหาไม่เจอ · needle สั้นเกินไปก็ไม่เดา", () => {
    const haystack = fakeLayout()
    const { alignByNeedle } = buildHelpers(haystack)
    expect(alignByNeedle("ข้อความที่ไม่มีในเอกสารนี้เลย", 100)).toBe(null)
    expect(alignByNeedle("ย่อ", 100)).toBe(null)
    expect(haystack.window.to.length).toBe(0)
  })

  test("ไม่เลื่อนเมื่ออยู่ที่เดิมแล้ว (delta ≤ 1)", () => {
    const haystack = fakeLayout()
    const { alignByNeedle } = buildHelpers(haystack)
    // p อยู่บนจอ 628 → เป้าหมาย 628 = ไม่ต้องขยับ
    expect(alignByNeedle("ย่อหน้าที่ 7 เนื้อหาทดสอบ", 628)).toBe(0)
    expect(haystack.window.to.length).toBe(0)
  })
})

describe("layout guard — ห้ามให้คอลัมน์อ่านยุบระหว่างสลับโหมด", () => {
  test("applyScrollTop ใช้ behavior instant (html ตั้ง scroll-behavior: smooth ไว้)", () => {
    const haystack = fakeLayout()
    const { applyScrollTop } = buildHelpers(haystack)
    applyScrollTop(1400)
    expect(haystack.window.to).toEqual([{ top: 1400, left: 0, behavior: "instant" }])
  })

  test("lock/release ความสูงของคอลัมน์อ่าน", () => {
    const haystack = fakeLayout()
    const { lockReadingHeight, releaseReadingHeight } = buildHelpers(haystack)
    ;(haystack.bodyEl as HTMLElement).getBoundingClientRect = () =>
      ({ height: 5362, top: 0 }) as unknown as DOMRect
    expect(lockReadingHeight()).toBe(5362)
    expect(haystack.bodyEl.style.minHeight).toBe("5362px")
    releaseReadingHeight()
    expect(haystack.bodyEl.style.minHeight).toBe("")
  })

  test("html จองราง scrollbar ไว้ถาวร — scrollbar โผล่/หายแล้ว shell ไม่เลื่อน", () => {
    const css = readFileSync(new URL("../src/web/styles/app.css", import.meta.url), "utf8")
    expect(css).toContain("scrollbar-gutter: stable")
  })
})

describe("จุดต่อที่เคยพลาด (regression)", () => {
  test("mountWritingSurface ต้องได้ 'element ที่คลิก' ด้วย — ไม่ใช่แค่ offset ของ markdown", () => {
    // เดิมส่งแค่ offset → needle ว่าง → ไม่มีการจัดบรรทัด (เพี้ยน 1185px)
    expect(CLIENT_JS).toContain(
      "mountWritingSurface(payload.md, offsetForElement(payload.md, anchor), buildSlashItems(schema), anchor)",
    )
    expect(CLIENT_JS).toContain(
      "function mountWritingSurface(md, anchorOffset, slashItems, clicked)",
    )
    expect(CLIENT_JS).toContain("clicked.textContent")
  })

  test("exitWriting ต้องจำบรรทัดที่カーอยู่ก่อน teardown แล้วจัดกลับ (fallback = scrollY)", () => {
    const at = CLIENT_JS.indexOf("async function exitWriting()")
    expect(at).toBeGreaterThan(-1)
    const body = CLIENT_JS.slice(at, at + 900)
    expect(body).toContain("const caret = anchorLine()")
    expect(body).toContain("const scrollTop = window.scrollY")
    expect(body).toContain("lockReadingHeight()")
    expect(body).toContain("alignByNeedle(caret.needle, caret.top)")
    expect(body).toContain("if (residual === null) applyScrollTop(scrollTop)")
  })

  test("settleReadingHeight ต้องวนจนนิ่งจริง + หยุดเมื่อผู้ใช้เลื่อนเอง/ออกโหมดเขียน", () => {
    const src = extractFunction(CLIENT_JS, "function settleReadingHeight(scrollTop, needle, top)")
    expect(src).toContain("SETTLE_STABLE_FRAMES")
    expect(src).toContain('window.addEventListener("wheel"')
    expect(src).toContain("writing.mounted !== host")
    expect(src).toContain("releaseReadingHeight()")
  })
})

describe("offsetForElement — カーต้องตกที่ block ที่คลิก (ไม่ใช่ต้นไฟล์)", () => {
  /** markdown ต้นทาง + DOM ที่ render แล้ว (แบบที่ pipeline ทำ) */
  function fixture() {
    const dom = parseHTML(
      `<!DOCTYPE html><html><body><div id="doku-doc-body" class="doku-prose">` +
        `<h2 id="หัวข้อ-6">หัวข้อ 6<a class="doku-anchor" href="#หัวข้อ-6">#</a></h2>` +
        `<p><strong>ตัวหนานำเรื่อง</strong> ของย่อหน้าที่ 5</p>` +
        `<p>ย่อหน้าปกติ</p>` +
        `</div></body></html>`,
    )
    const document = dom.document as unknown as Document
    const md = "# Jump demo\n\n## หัวข้อ 6\n\n**ตัวหนานำเรื่อง** ของย่อหน้าที่ 5\n\nย่อหน้าปกติ\n"
    const $$ = (selector: string, root?: ParentNode) =>
      Array.from(((root ?? document) as ParentNode).querySelectorAll(selector))
    const source = extractFunction(CLIENT_JS, "function offsetForElement(md, target)")
    const offsetForElement = new Function("$$", `return ${source};`)($$) as (
      md: string,
      target: Element,
    ) => number | null
    return { document, md, offsetForElement }
  }

  test("หัวข้อ: ถอด decorative anchor (#) ก่อนค้น — เดิมหา 'หัวข้อ 6#' ไม่เจอ → カーไปต้นไฟล์", () => {
    const { document, md, offsetForElement } = fixture()
    const heading = document.querySelector("h2") as Element
    expect(heading.textContent).toBe("หัวข้อ 6#") // ยืนยันว่า DOM มี anchor ติดมา
    expect(offsetForElement(md, heading)).toBe(md.indexOf("หัวข้อ 6"))
  })

  test("block ขึ้นต้นด้วย inline markup → ลดความยาว prefix แล้วค้นเจอ", () => {
    const { document, md, offsetForElement } = fixture()
    const paragraph = document.querySelector("p") as Element
    expect(offsetForElement(md, paragraph)).toBe(md.indexOf("ตัวหนานำเรื่อง"))
  })

  test("block ปกติ → offset = ตำแหน่งข้อความใน md", () => {
    const { document, md, offsetForElement } = fixture()
    const paragraph = document.querySelectorAll("p")[1] as Element
    expect(offsetForElement(md, paragraph)).toBe(md.indexOf("ย่อหน้าปกติ"))
  })

  test("หาไม่เจอจริง → null (ให้ caller fallback)", () => {
    const { document, offsetForElement } = fixture()
    const paragraph = document.querySelectorAll("p")[1] as Element
    expect(offsetForElement("markdown ที่ไม่เกี่ยวกับ DOM นี้", paragraph)).toBe(null)
  })
})
