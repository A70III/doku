import { describe, expect, test } from "bun:test"
import { INTERACTIONS_JS, renderMarkdown } from "@doku/core"
import { parseHTML } from "linkedom"
import { CLIENT_JS } from "../src/web/client.ts"

/**
 * Regression test — เนื้อหาที่ถูก **วาดใหม่ทั้งก้อน** ต้องยัง interact ได้
 *
 * อาการ (รายงาน): เปิดเอกสารที่มี `:::tabs` → กดเปลี่ยนแท็บได้ → คลิกในเนื้อหา
 * เข้าโหมดเขียน → กด Esc ออก (ยังหน้าเดิม ไม่เปลี่ยนหน้า) → **กดเปลี่ยนแท็บไม่ได้อีก**
 * ทั้งที่ก่อนเข้าโหมดเขียนกดได้
 *
 * root cause: `INTERACTIONS_JS` (`packages/core/src/client.ts`) เป็น statement ที่รัน
 * ครั้งเดียวตอนโหลดหน้า — มัน `addEventListener("click")` กับปุ่มแท็บ **ตัว DOM เดิม**
 * ส่วนการออกจากโหมดเขียน (`packages/server/src/web/client.ts` → `paintRendered`)
 * ใช้ `bodyEl.innerHTML = result.html` → node เดิมตายทั้งยวง (handler หายหมด,
 * `data-enhanced` หาย → panel ทุกอันกลับมาแสดงพร้อมกัน, ปุ่ม copy code หาย,
 * motion block ค้าง opacity 0 เพราะ observer ไม่รู้จัก node ใหม่)
 *
 * วิธีที่ถูก: interaction ที่ไม่ผูกกับ node ใช้ event delegation ที่ `document`
 * และของที่ต้องติดตั้งบน DOM (data-enhanced / copy button / motion observer)
 * ต้องเรียกซ้ำได้ผ่าน `window.DokuInteractions(root)` → `paintRendered` เรียกหลังวาด
 *
 * อ้างอิง: docs/08 ข้อ 52/54 (ออกโหมดเขียนแล้วอยู่หน้าเดิม) · docs/03 (tabs = progressive enhancement)
 */

const MD = [
  "# Tabs demo",
  "",
  "ย่อหน้านำ",
  "",
  "::::tabs",
  ':::tab{label="macOS"}',
  "คำสั่งสำหรับ mac",
  ":::",
  ':::tab{label="Linux"}',
  "คำสั่งสำหรับ linux",
  ":::",
  "::::",
  "",
  "```ts",
  "const a = 1",
  "```",
].join("\n")

interface FakeWindow {
  DokuInteractions?: (root?: unknown) => void
  matchMedia: (query: string) => { matches: boolean }
  Event: typeof Event
  [key: string]: unknown
}

/** รัน `INTERACTIONS_JS` กับ DOM จริงที่ render จาก pipeline (linkedom + stub เฉพาะที่ไม่มี) */
async function bootInteractions(markdown = MD) {
  const { html } = await renderMarkdown(markdown, { highlight: false })
  const dom = parseHTML(
    `<!DOCTYPE html><html><body><div id="doku-doc-body" class="doku-prose">${html}</div></body></html>`,
  )
  const document = dom.document as unknown as Document
  const window = dom.document.defaultView as unknown as FakeWindow

  // linkedom ไม่มี API เหล่านี้ — stub ให้พอรัน (ไม่ใช่ของที่ test นี้วัด)
  let observed = 0
  window.matchMedia = () => ({ matches: false })
  const intersector = class {
    observe() {
      observed += 1
    }
    disconnect() {}
    unobserve() {}
  }

  // รันแบบเดียวกับที่เบราว์เซอร์ทำ: script เป็น statement ก้อนเดียว
  new Function("document", "window", "IntersectionObserver", INTERACTIONS_JS)(
    document,
    window,
    intersector,
  )

  const body = document.getElementById("doku-doc-body") as HTMLElement
  const click = (selector: string) => {
    const node = document.querySelector(selector)
    if (!node) throw new Error(`ไม่เจอ element: ${selector}`)
    node.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }))
    return node
  }
  return { html, document, window, body, click, observedCount: () => observed }
}

const selected = (document: Document) =>
  Array.from(document.querySelectorAll("[data-part='tab-button']")).map((b) =>
    b.getAttribute("aria-selected"),
  )

describe("tabs หลัง DOM ถูกวาดใหม่ (ออกจากโหมดเขียน)", () => {
  test("ก่อนวาดใหม่: คลิกแท็บได้ตามปกติ (baseline)", async () => {
    const { document, click } = await bootInteractions()
    expect(document.querySelector("[data-block='tabs']")?.hasAttribute("data-enhanced")).toBe(true)
    expect(selected(document)).toEqual(["true", "false"])

    click("[data-part='tab-button'][data-index='1']")
    expect(selected(document)).toEqual(["false", "true"])
  })

  test("หลัง innerHTML ถูกแทนที่: ต้องยังคลิกแท็บได้ (regression)", async () => {
    const { document, click, body, html } = await bootInteractions()

    // ── จำลองสิ่งที่ฝั่ง server ทำตอนออกจากโหมดเขียน ──
    body.innerHTML = html
    // node ชุดใหม่ยัง "ติดตั้งไม่ครบ" (CSS ยังโชว์ทุก panel ซ้อนกัน)
    expect(document.querySelector("[data-block='tabs']")?.hasAttribute("data-enhanced")).toBe(false)

    // ── ทางที่ถูก: ติดตั้ง interaction บนเนื้อหาใหม่ ──
    const enhance = (document.defaultView as unknown as FakeWindow | null)?.DokuInteractions
    expect(typeof enhance).toBe("function")
    enhance?.(document)

    expect(document.querySelector("[data-block='tabs']")?.hasAttribute("data-enhanced")).toBe(true)
    expect(selected(document)).toEqual(["true", "false"])
    click("[data-part='tab-button'][data-index='1']")
    expect(selected(document)).toEqual(["false", "true"])
    click("[data-part='tab-button'][data-index='0']")
    expect(selected(document)).toEqual(["true", "false"])
  })

  test("delegation ที่ document ทำให้คลิกได้แม้ยังไม่ได้ติดตั้ง data-enhanced ซ้ำ", async () => {
    const { document, click, body, html } = await bootInteractions()
    body.innerHTML = html
    click("[data-part='tab-button'][data-index='1']")
    expect(selected(document)).toEqual(["false", "true"])
  })

  test("paintRendered ต้องเรียก DokuInteractions หลังวาด HTML ลง body", async () => {
    const at = CLIENT_JS.indexOf("async function paintRendered(md, docId)")
    const body = CLIENT_JS.slice(at, at + 900)
    expect(body).toContain("DokuInteractions")
  })

  test("interaction ต้องไม่ผูกกับ node ตรง ๆ (delegation) — รอดจากการ repaint", async () => {
    // ปุ่มแท็บ/zoom ต้องไม่ใช้ addEventListener บนตัว node (จะหายเมื่อ node ตาย)
    expect(INTERACTIONS_JS).not.toContain("image.addEventListener")
    // ใช้ delegation ที่ document แทน
    expect(INTERACTIONS_JS).toContain("closest(\"[data-block='tabs'] [data-part='tab-button']\")")
    // และ export ทางเข้าที่เรียกซ้ำได้ให้ฝั่ง server เรียกหลังวาดใหม่
    expect(INTERACTIONS_JS).toContain("window.DokuInteractions = enhanceContent")
  })

  test("ปุ่ม copy code กลับมาหลังวาดใหม่ (ต้อง insert ครั้งเดียว ไม่ซ้ำ)", async () => {
    const { document, body, html, window } = await bootInteractions()
    expect(document.querySelectorAll("[data-part='copy-code']").length).toBe(1)

    body.innerHTML = html
    expect(document.querySelectorAll("[data-part='copy-code']").length).toBe(0)
    const enhance = window.DokuInteractions as (root?: unknown) => void
    enhance(document)
    expect(document.querySelectorAll("[data-part='copy-code']").length).toBe(1)
    enhance(document) // เรียกซ้ำต้องไม่เพิ่มปุ่มซ้อน
    expect(document.querySelectorAll("[data-part='copy-code']").length).toBe(1)
  })

  test("motion block ที่ถูกวาดใหม่ต้องถูก observe ซ้ำ (ไม่ค้าง opacity 0)", async () => {
    const { document, body, html, window, observedCount } = await bootInteractions(
      ':::motion{effect="fade-up"}\nเนื้อหา\n:::',
    )
    expect(observedCount()).toBe(1)

    body.innerHTML = html
    // node ใหม่ถูกทิ้งไว้ไม่ observe → CSS ข้อ 51/53 ค้างที่ opacity 0
    ;(window.DokuInteractions as (root?: unknown) => void)(document)
    expect(observedCount()).toBe(2)
  })
})
