/**
 * Regression — ปุ่มเปิด/ปิดแท็กบนหน้าแรก (docs/08 ข้อ 85)
 *
 * ขอบเขตที่ test นี้ล็อก (3 ชั้น ตามที่ implement):
 * ① SSR — ปุ่มมีเฉพาะหน้าแรกที่ยัง**ไม่ได้กรอง**ด้วย `?tag=` และ vault มีแท็ก ·
 *    เป็น disclosure จริง (`aria-expanded` + `aria-controls` → id ของแถบตัวกรอง)
 * ② client — กดแล้ว `<html data-tags="off">` + จำลง localStorage · ค่าที่จำไว้
 *    คืนมาตอนเปิดหน้าใหม่ (โหลดซ้ำต้องได้ state เดิม ไม่ใช่ค่าเริ่มต้น)
 * ③ CSS — state นั้นซ่อนครบ 3 ชั้น: แถวแท็กในเอกสาร · แถวที่มีแต่แท็ก · แถบตัวกรอง
 *
 * guard ข้อ ② กันบั๊กที่เคยเจอที่อื่น (docs/08 ข้อ 62–64): interaction ที่ผูกกับ state
 * ต้อง install จาก state ที่เก็บไว้ ไม่ใช่ค่า default ทุกครั้งที่โหลดหน้า
 */

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { MetaSchema } from "@doku/core"
import { parseHTML } from "linkedom"
import type { DocSummary, TreeNode } from "../src/tree.ts"
import { CLIENT_JS } from "../src/web/client.ts"
import { DocPage, HomePage } from "../src/web/pages.tsx"

const APP_CSS = readFileSync(new URL("../src/web/styles/app.css", import.meta.url), "utf8")

/* ── ① SSR ──────────────────────────────────────────────────────────────── */

const NOW = Date.now()

function doc(id: string, over: Partial<DocSummary> = {}): DocSummary {
  return {
    id,
    title: id,
    tags: [],
    pinned: false,
    status: "active",
    mtimeMs: NOW,
    bytes: 100,
    ...over,
  }
}

const TAGGED: DocSummary[] = [
  doc("alpha", { tags: ["design"] }),
  doc("beta", { tags: ["doku", "design"] }),
]

function html(props: { tree?: TreeNode[]; docs?: DocSummary[]; tag?: string }): string {
  return String(
    HomePage({ tree: props.tree ?? [], docs: props.docs ?? TAGGED, ...props, vaultName: "vault" }),
  )
}

describe("หน้าแรก — ปุ่มเปิด/ปิดแท็ก (SSR)", () => {
  test("มีปุ่มเมื่อยังไม่กรองแท็ก · label เริ่มต้น = ซ่อนแท็ก (เปิดอยู่)", () => {
    const page = html({})
    expect(page).toContain('data-action="toggle-tags"')
    expect(page).toContain('aria-expanded="true"')
    expect(page).toContain('aria-controls="doku-tag-filter"')
    expect(page).toContain('id="doku-tag-filter"')
    expect(page).toContain("ซ่อนแท็ก")
  })

  test("กรองแท็กอยู่ = ซ่อนปุ่มทิ้ง (แถวแท็กคือทางออกของหน้านั้น อยู่แล้ว)", () => {
    const page = html({ tag: "design" })
    expect(page).not.toContain('data-action="toggle-tags"')
    // แถบตัวกรองยังอยู่ (มีลิงก์กลับ `/`) — ไม่ใช่ถูกซ่อน
    expect(page).toContain('id="doku-tag-filter"')
    expect(page).toContain('href="/"')
  })

  test("vault ไม่มีแท็ก = ไม่มีปุ่มและไม่มีแถบตัวกรอง (ไม่มี chrome ตาย)", () => {
    const page = html({ docs: [doc("plain")] })
    expect(page).not.toContain('data-action="toggle-tags"')
    expect(page).not.toContain('id="doku-tag-filter"')
  })

  test("แถวเอกสารมี hook ให้ CSS ซ่อน — ทั้ง 2 ชั้น (แท็กล้วน / แท็ก+สถานะ)", () => {
    const page = html({
      docs: [doc("a", { tags: ["x"] }), doc("b", { tags: ["y"], status: "draft" })],
    })
    // ตัดเฉพาะตัว `<a>` ของแถว (เอกสารหนึ่งโผล่หลายรอบ: ล่าสุด + ทั้งหมด)
    const rowOf = (id: string) => {
      const start = page.indexOf(`<a href="/d/${id}"`)
      return page.slice(start, page.indexOf("</a>", start))
    }
    // แท็กล้วน → ซ่อนทั้งแถว (ไม่ปล่อยเหลืองานว่าง)
    expect(rowOf("a")).toContain('data-row-meta="tags-only"')
    expect(rowOf("a")).toContain("data-row-tags")
    expect(rowOf("a")).toContain("#x")
    // มีสถานะด้วย → แถวยังต้องอยู่ (status ไม่ใช่แท็ก) แต่แท็กในนั้นซ่อนได้
    const draft = rowOf("b")
    expect(draft).not.toContain('data-row-meta="tags-only"')
    expect(draft).toContain("data-row-tags")
    expect(draft).toContain("#y")
    expect(draft).toContain("draft")
  })

  test("ไม่มี hook เมื่อแถวไม่มีแท็กและไม่มีสถานะ (ไม่สร้าง markup ที่ว่างเปล่า)", () => {
    const page = html({ docs: [doc("plain")] })
    expect(page).not.toContain("data-row-tags")
    expect(page).not.toContain('data-row-meta="tags-only"')
  })

  test("แท็กในหัวเอกสารมี hook เดียวกัน (state ตามไปทุกหน้าที่โชว์แท็ก)", () => {
    // เรียก DocPage ตรง ๆ แล้วเช็คบรรทัดคุณสมบัติของหัวเอกสาร
    const docPage = String(
      DocPage({
        doc: {
          key: "x",
          fragment: "<p>x</p>",
          meta: MetaSchema.parse({ title: "T", tags: ["design"] }),
          toc: [],
          warnings: [],
        },
        path: "x",
        tree: [],
        vaultName: "vault",
      }),
    )
    expect(docPage).toContain("data-doc-tag")
    // สถานะ/ผู้เขียน/วันที่ไม่ใช่แท็ก → ต้องไม่มี hook (ไม่ถูกซ่อนพร้อมแท็ก)
    expect(docPage).not.toContain("data-row-tags")
  })
})

/* ── ② client ───────────────────────────────────────────────────────────── */

/** โหลด client.js จริง (สคริปต์เดียวกับที่เสิร์ฟ) บน DOM จริงจาก linkedom */
function bootClient(pageHtml: string, stored?: string) {
  const dom = parseHTML(`<!DOCTYPE html><html><head></head><body>${pageHtml}</body></html>`)
  const document = dom.document as unknown as Document
  const window = dom.document.defaultView as unknown as Record<string, unknown>
  window.matchMedia = () => ({ matches: false })

  const store = new Map<string, string>()
  if (stored !== undefined) store.set("doku.tags", stored)
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }

  const sandbox: Record<string, unknown> = {
    document,
    window,
    localStorage,
    EventSource: class {
      addEventListener() {}
    },
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
    requestAnimationFrame: (cb: (t: number) => void) => setTimeout(() => cb(0), 0),
    cancelAnimationFrame: (id: number) => clearTimeout(id),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    URLSearchParams,
    AbortController,
    Event: (window as { Event: unknown }).Event,
    CustomEvent: (window as { CustomEvent: unknown }).CustomEvent,
    location: { search: "", href: "http://doku/", pathname: "/", hash: "" },
    history: { replaceState() {} },
    navigator: { clipboard: {} },
    matchMedia: () => ({ matches: false }),
  }
  new Function(...Object.keys(sandbox), CLIENT_JS)(...Object.values(sandbox))

  const button = document.querySelector("[data-action='toggle-tags']") as HTMLElement
  const click = () =>
    button?.dispatchEvent(
      new (window as unknown as { Event: typeof Event }).Event("click", {
        bubbles: true,
        cancelable: true,
      }),
    )
  return { document, window, store, click, button }
}

const HOME_CHROME = `
  <button type="button" data-action="toggle-tags" aria-expanded="true" aria-controls="doku-tag-filter">
    <span data-tags-label>ซ่อนแท็ก</span>
  </button>
  <div id="doku-tag-filter" data-tag-filter>แท็ก</div>
  <a href="/d/alpha"><span data-row-meta="tags-only"><span data-row-tags>#design</span></span></a>
`

const htmlRoot = (document: Document) => document.documentElement.getAttribute("data-tags")

describe("ปุ่มแท็ก — client", () => {
  test("กดครั้งแรก = ปิด (data-tags=off) + จำลง localStorage + ป้ายสลับ", () => {
    const { document, store, click, button } = bootClient(HOME_CHROME)
    expect(htmlRoot(document)).toBeNull()

    click()
    expect(htmlRoot(document)).toBe("off")
    expect(button?.getAttribute("aria-expanded")).toBe("false")
    expect(button?.textContent).toContain("แสดงแท็ก")
    expect(store.get("doku.tags")).toBe("0")
  })

  test("กดซ้ำ = เปิดคืน (สลับสองสถานะ ไม่ค้าง)", () => {
    const { document, store, click, button } = bootClient(HOME_CHROME)
    click()
    click()
    expect(htmlRoot(document)).toBeNull()
    expect(button?.getAttribute("aria-expanded")).toBe("true")
    expect(button?.textContent).toContain("ซ่อนแท็ก")
    expect(store.get("doku.tags")).toBe("1")
  })

  test("ค่าที่จำไว้เดิมถูกใช้ตอนเปิดหน้าใหม่ (regression: ไม่ใช่ค่าเริ่มต้นทุกครั้ง)", () => {
    // โหลดครั้งแรก กดปิด
    const first = bootClient(HOME_CHROME)
    first.click()
    expect(first.store.get("doku.tags")).toBe("0")

    // เปิดหน้าใหม่ (document ใหม่) ด้วย state เดิม → ต้องยังปิดอยู่
    const second = bootClient(HOME_CHROME, "0")
    expect(htmlRoot(second.document)).toBe("off")
    expect(second.button?.getAttribute("aria-expanded")).toBe("false")
    expect(second.button?.textContent).toContain("แสดงแท็ก")
  })

  test("ค่าใน localStorage เสีย = ถือว่าเปิด ไม่ใช่พัง", () => {
    for (const stored of [undefined, "1", "", "garbage"]) {
      const { document, button } = bootClient(HOME_CHROME, stored)
      expect(htmlRoot(document)).toBeNull()
      expect(button?.getAttribute("aria-expanded")).toBe("true")
    }
  })

  test("หน้าที่ไม่มีปุ่ม (หน้าเอกสาร) = ยังใช้ state เดิม แต่ไม่เขียนทับ", () => {
    // regression: เคยอ่าน state เฉพาะตอนมีปุ่ม → เปิดหน้าอื่นแล้วแท็กโผล่กลับมาเอง
    const { document, store } = bootClient('<a href="/d/a"><span data-row-tags>#x</span></a>', "0")
    expect(htmlRoot(document)).toBe("off")
    // และห้ามเขียน state ทับ (คนอาจจะกดปุ่มอยู่แล้วในแท็บอื่น)
    expect(store.get("doku.tags")).toBe("0")
  })

  test("หน้าที่ไม่มีปุ่ม = ไม่แตะ state เมื่อไม่มีค่าเดิม", () => {
    const { document, store } = bootClient('<a href="/d/a"><span data-row-tags>#x</span></a>')
    expect(htmlRoot(document)).toBeNull()
    expect(store.has("doku.tags")).toBe(false)
  })
})

/* ── ③ CSS ──────────────────────────────────────────────────────────────── */

describe("ปุ่มแท็ก — CSS", () => {
  test("state ปิด = ซ่อนครบ 3 ชั้น (แถวแท็ก · แถวที่มีแต่แท็ก · แถบตัวกรอง)", () => {
    // selector กลุ่มเดียวกันหลายตัว — ต้องมี attribute ครบทั้ง 3
    const group = APP_CSS.slice(APP_CSS.indexOf('html[data-tags="off"] [data-row-tags]'))
    const block = group.slice(0, group.indexOf("}") + 1)
    expect(block).toContain("[data-row-tags]")
    expect(block).toContain('[data-row-meta="tags-only"]')
    expect(block).toContain("[data-tag-filter]")
    // ต้อง !important — แถวใช้ Tailwind utility (flex) ที่ specificity สูงกว่า
    expect(block).toContain("display: none !important")
    expect(block).not.toMatch(/display:\s*none;\s*$/)
  })

  test("state เปิด = ไม่มี rule ซ่อนอะไรเลย (ค่า default เห็นแท็กครบ)", () => {
    expect(APP_CSS).not.toMatch(/html\[data-tags="on"\]/)
  })

  test("ปุ่มตัวเองไม่ต้องเข้ากับ chrome ตอนพิมพ์", () => {
    // ไม่ต้องมี rule ปกติของปุ่ม (ใช้ .doku-btn ของ chrome ที่มีอยู่แล้ว)
    expect(APP_CSS).not.toMatch(/^\.doku-tag-toggle \{/m)
    // แต่ต้องถูกซ่อนตอนพิมพ์ — ปุ่มควบคุมหน้าจอ ไม่ใช่เนื้อหา
    const printBlock = APP_CSS.slice(APP_CSS.indexOf("@media print"))
    expect(printBlock).toContain(".doku-tag-toggle")
  })
})
