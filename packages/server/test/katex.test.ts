/**
 * Regression test — หน้าอ่านคณิตศาสตร์พัง: **ไม่มี katex.css เลย**
 *
 * อาการ (ยืนยันในเบราว์เซอร์จริง): สมการแบบ `$$…$$` ไม่ขึ้นบรรทัดใหม่/ไม่จัดกลาง และ
 * **ข้อความ MathML ดิบโผล่ซ้ำข้างสูตร** (`E = mc² E = mc2 และ:`) — เพราะ
 * `.katex-mathml { position: absolute; clip: … }` ที่ซ่อน fallback ไม่ถูกโหลด
 *
 * root cause: `loadKatexCss()` + route `/static/katex.css` ถูกสร้างไว้ (docs/08 ข้อ 23
 * ฝัง woff2 เป็น data URI) แต่ **ไม่มีที่ไหน link** — `pages.tsx` `<head>` มีแค่
 * app.css + content.css · CLI preview ใส่ให้ (`cli/src/index.ts` มีเงื่อนไข
 * `fragment.includes("katex")`) → ฝั่ง server ตกหล่น
 *
 * สัญญาที่ล็อก (docs/08 ข้อ 70): โหลด katex.css **เฉพาะหน้าที่มีสมการ** — ทั้งฝั่ง SSR
 * และฝั่ง client หลัง repaint (ผู้ใช้อาจ *พิมพ์สมการใหม่* ตอนอยู่ในโหมดเขียน)
 */

import { describe, expect, test } from "bun:test"
import { memoryRevisionStore, memoryVaultFs, RENDERER_VERSION } from "@doku/core"
import { parseHTML } from "linkedom"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"
import { CLIENT_JS } from "../src/web/client.ts"

void memoryRevisionStore

function setup(files: Record<string, string>) {
  const fs = memoryVaultFs(files)
  const state = new VaultState(fs, "vault")
  const cache = new FragmentCache(null, RENDERER_VERSION)
  const renderer = new DocRenderer(fs, state, cache)
  const app = createDokuApp({ fs, vaultName: "vault", state, renderer, hub: new SseHub() })
  return { app }
}

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

const MATH_DOC = "# สมการ\n\n$$\\frac{1}{2} + \\frac{1}{3} = \\frac{5}{6}$$\n"
const PLAIN_DOC = "# ไม่มีสมการ\n\nเนื้อหาธรรมดา\n"

describe("katex.css — โหลดเฉพาะหน้าที่มีสมการ (docs/08 ข้อ 70)", () => {
  test("หน้าเอกสารที่มีสมการ → มี <link> katex.css", async () => {
    const { app } = setup({ "math.md": MATH_DOC })
    const html = await (await app.request("/d/math")).text()
    expect(html).toContain("katex")
    expect(html).toContain('href="/static/katex.css"')
  })

  test("หน้าเอกสารที่ไม่มีสมการ → ไม่โหลด katex.css (~380KB)", async () => {
    const { app } = setup({ "plain.md": PLAIN_DOC })
    const html = await (await app.request("/d/plain")).text()
    expect(html).toContain("เนื้อหาธรรมดา")
    expect(html).not.toContain("/static/katex.css")
  })

  test("route /static/katex.css ฝัง woff2 เป็น data URI จริง (ไม่พึ่ง CDN/ไฟล์ข้าง ๆ)", async () => {
    const { app } = setup({})
    const res = await app.request("/static/katex.css")
    expect(res.status).toBe(200)
    const css = await res.text()
    expect(css).toContain("KaTeX_Main")
    expect(css).toContain("data:font/woff2;base64,")
    // ต้องไม่มี url(fonts/…) เหลือ (จะ 404 เพราะ static ไม่ได้เสิร์ฟฟอนต์)
    expect(css).not.toContain("url(fonts/")
  })
})

describe("client — ensureKatexCss หลัง repaint", () => {
  const src = extractFunction(CLIENT_JS, "function ensureKatexCss(html)")

  function run(html: string, head = "") {
    const { document } = parseHTML(`<html><head>${head}</head><body></body></html>`)
    const ensure = new Function("document", `return ${src};`)(document) as (html: string) => void
    ensure(html)
    return [...document.querySelectorAll("head link[data-katex]")].map((node) =>
      node.getAttribute("href"),
    )
  }

  test("เนื้อหามีสมการ + ยังไม่มี link → ใส่ให้", () => {
    expect(run('<p><span class="katex">x</span></p>')).toEqual(["/static/katex.css"])
  })

  test("มี link อยู่แล้ว → ไม่ซ้ำ", () => {
    const head = '<link rel="stylesheet" href="/static/katex.css" data-katex="true" />'
    expect(run('<p><span class="katex">x</span></p>', head)).toEqual(["/static/katex.css"])
  })

  test("เนื้อหาไม่มีสมการ → ไม่แตะ head", () => {
    expect(run("<p>เนื้อหาธรรมดา</p>")).toEqual([])
  })

  test("paintRendered ต้องเรียก ensureKatexCss (สมการที่พิมพ์เพิ่มตอนโหมดเขียน)", () => {
    const body = extractFunction(CLIENT_JS, "async function paintRendered(md, docId)")
    expect(body).toContain("ensureKatexCss(result.html)")
  })
})
