import { describe, expect, test } from "bun:test"
import { renderMarkdown } from "@doku/core"
import { parseHTML } from "linkedom"
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

/**
 * Regression test — TOC ติด "#" ต่อท้ายทุก entry หลังออกโหมดเขียน
 *
 * อาการ: ออกโหมดแก้ไข (Esc → exitWriting → paintRendered) โดยยังอยู่หน้าเดิม
 * แล้วทุก `[data-toc-link]` กลายเป็น "หัวข้อ#" ทั้งที่ก่อนเข้าโหมดเขียนสะอาด
 *
 * root cause: `syncTocFromBody` สมมติว่า `heading.textContent` = ข้อความหัวข้อ
 * ล้วน ๆ แต่ render pipeline ใส่ anchor append เข้าไปใน heading เอง
 * (rehype-autolink-headings behavior "append" → `<a class="doku-anchor" …>#</a>`)
 * — textContent เลยรวม "#" ติดมาด้วย ฝั่ง server TOC ไม่พังเพราะ
 * `rehypeCollectToc` ถูกเรียกก่อน autolink (render.ts) แต่ client rebuild
 * จาก DOM แล้วอ่าน textContent ตรง ๆ
 *
 * ทดสอบ: ไม่ stub `syncTocFromBody` — feed HTML จริงจาก renderMarkdown
 * เข้า DOM (linkedom) แล้ว assert ข้อความ TOC ไม่มี "#" ต่อท้าย
 */
describe("syncTocFromBody — TOC จาก DOM ต้องไม่รวม decorative anchor", () => {
  test("อ่านหัวข้อจาก HTML ของ pipeline จริง ต้องไม่ติด '#' ต่อท้าย", async () => {
    const { html } = await renderMarkdown("## หัวข้อ", { highlight: false })

    const src = extractFunction(CLIENT_JS, "function syncTocFromBody")
    const { document } = parseHTML(
      `<!DOCTYPE html><html><body>` +
        `<article><div class="doku-prose">${html}</div></article>` +
        `<nav><ul><li><a data-toc-link="placeholder" href="#">placeholder</a></li></ul></nav>` +
        `</body></html>`,
    )
    const $$ = (selector: string, root?: ParentNode) =>
      Array.from((root ?? document).querySelectorAll(selector))

    const syncTocFromBody = new Function("$$", "document", `return ${src};`)(
      $$,
      document,
    ) as () => void
    syncTocFromBody()

    const links = [...document.querySelectorAll("[data-toc-link]")]
    expect(links.length).toBe(1)
    const link = links.at(0)
    expect(link?.getAttribute("data-toc-link")).toBe("หัวข้อ")
    // ตอนนี้: textContent = "หัวข้อ#" (RED) — anchor ของ autolink ติดมาด้วย
    expect(link?.textContent).toBe("หัวข้อ")
  })
})

describe("ออกจากโหมดเขียน (Esc / คลิก chrome) — paintRendered", () => {
  test("paintRendered ต้อง resolve + วาด HTML ลง body แล้วคืนค่า HTML เดิม (ไม่ throw)", async () => {
    const src = extractFunction(CLIENT_JS, "async function paintRendered(md, docId)")

    const painted = { innerHTML: "" }
    const rendered = "<p>หัวข้อใหม่</p>"

    const makePaint = new Function(
      "bodyEl",
      "renderDocFragment",
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

    const returned = await paintRendered("# หัวเรื่อง\n\nเนื้อหา", "daily/x")

    // วาดแล้ว + คืนค่าให้ exitWriting ใช้ต่อได้ (ตอนนี้: ReferenceError: html is not defined)
    expect(painted.innerHTML).toBe(rendered)
    expect(returned).toBe(rendered)
  })

  test("นับจำนวนคำใน colophon ต้องแยกด้วย whitespace ไม่ใช่ตัวอักษร 's'", async () => {
    const src = extractFunction(CLIENT_JS, "async function paintRendered(md, docId)")

    const painted = { innerHTML: "" }
    const wordNode = { textContent: "" }
    const colophon = {
      querySelector: (sel: string) => (sel === "[data-part='colophon-words']" ? wordNode : null),
    }

    const makePaint = new Function(
      "bodyEl",
      "renderDocFragment",
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
    await paintRendered("status สถานะ สอง", "daily/x")
    expect(wordNode.textContent).toBe("3 คำ")
  })
})

/**
 * Regression test — ออกจากโหมดเขียนแล้วชื่อเรื่องกลายเป็น "untitled" + h1 โผล่ซ้ำใน body
 *
 * อาการ: แก้เอกสารที่ขึ้นต้นด้วย `# ชื่อ` → กด Esc ออก → header เป็น "untitled"
 * และ body มี `<h1>ชื่อ#</h1>` ซ้ำกับ header ต้อง refresh หน้าถึงจะกลับมาถูก
 *
 * root cause: `paintRendered` เดิมดึง fragment จาก `POST /api/render`
 * ซึ่งเป็น renderer แบบ **stateless** (docs/05) — ไม่ derive ชื่อจาก h1 และไม่ตัด h1 ออก
 * (meta.title จึงคงเป็น default) ต่างจากหน้า `/d/*` ที่ใช้ `DocRenderer` (ตัด h1 + derive title)
 * แถมตอนนั้น `writing.path` ถูก teardown เป็น null แล้ว → render เป็น "untitled"
 *
 * วิธีที่ถูก: exit paint ต้องใช้ renderer ตัวเดียวกับตอน refresh (`GET /api/docs/<id>?format=html`)
 * และต้องจำ doc id ไว้ก่อน teardown
 *
 * อ้างอิง: docs/08 ข้อ 52 (วาดผลกลับ in-place) · docs/05 (`/api/render` = stateless)
 */
describe("ออกจากโหมดเขียน — ต้องใช้ renderer ตัวเดียวกับหน้า /d/*", () => {
  test("renderDocFragment ยิง /api/docs/<id>?format=html", async () => {
    const src = extractFunction(CLIENT_JS, "async function renderDocFragment(docId)")
    const calls: string[] = []
    const api = async (path: string) => {
      calls.push(path)
      return { html: "<p>x</p>", meta: {} }
    }
    const encodePath = (path: string) =>
      path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")
    const renderDocFragment = new Function("api", "encodePath", `return ${src};`)(
      api,
      encodePath,
    ) as (id: string) => Promise<unknown>

    await renderDocFragment("daily/IWAIT2027")
    expect(calls).toEqual(["/api/docs/daily/IWAIT2027?format=html"])
  })

  test("exitWriting จำ doc id ก่อน teardown แล้วส่งให้ paintRendered", () => {
    const at = CLIENT_JS.indexOf("async function exitWriting()")
    expect(at).toBeGreaterThan(-1)
    const body = CLIENT_JS.slice(at, at + 420)
    expect(body).toContain("const docId = writing.path")
    expect(body).toContain("paintRendered(md, docId)")
  })
})
