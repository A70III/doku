import { describe, expect, test } from "bun:test"
import { memoryVaultFs, RENDERER_VERSION, renderMarkdown } from "@doku/core"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"
import { CLIENT_JS } from "../src/web/client.ts"

/**
 * Regression tests — one surface (docs/08 ข้อ 63/65 · docs/09 §3.1) ที่ test ชุดเดิมไม่จับ
 *
 * R1 heading map สมมติว่าทุกหัวข้อใน TOC เป็น ATX `##` → setext h2 ทำ index เพี้ยนทั้งชุด
 * R2 `data-title-in-body` คิดจาก raw markdown แทน `dedupe` ของ renderer → ชื่อเรื่องหาย/ซ้ำ
 * R3 `dirty` ถูกล้างก่อน PUT ตอบกลับ → nav guard/keepalive เห็น "ไม่มีงานค้าง" ระหว่าง save
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

const TICK = String.fromCharCode(96)

/** ประกอบ heading pipeline จริงจาก CLIENT_JS แล้วรันบน markdown */
function makeHeadingTools(): {
  headingsInMarkdown: (md: string) => Array<{ depth: number; text: string; pos: number }>
  buildHeadingMap: (md: string, links: Array<{ id: string; text: string }>) => Map<string, number>
} {
  const source = [
    extractFunction(CLIENT_JS, "function normalizeHeading"),
    extractFunction(CLIENT_JS, "function fenceMarker"),
    extractFunction(CLIENT_JS, "function frontmatterLength"),
    extractFunction(CLIENT_JS, "function headingsInMarkdown"),
    extractFunction(CLIENT_JS, "function buildHeadingMap"),
  ].join("\n")
  const factory = new Function(
    "TICK",
    `
    let headingPositions = null;
    let $$ = () => [];
    ${source}
    return {
      headingsInMarkdown: (md) => headingsInMarkdown(md),
      buildHeadingMap: (md, links) => {
        $$ = () => links.map((link) => ({
          getAttribute: (name) => (name === "data-toc-link" ? link.id : null),
          textContent: link.text,
        }));
        headingPositions = null;
        buildHeadingMap(md);
        return headingPositions;
      },
    };
    `,
  )
  return factory(TICK)
}

describe("R1 heading map — setext + frontmatter (docs/09 §3.1)", () => {
  const { headingsInMarkdown } = makeHeadingTools()

  test("setext h2 (`Title\\n-----`) ต้องถูกนับเป็น heading (renderer ใส่เข้า TOC)", () => {
    const md = "Intro\n\nSetext H2\n---------\n\n## ATX A\n"
    const found = headingsInMarkdown(md)
    expect(found.map((entry) => entry.text)).toEqual(["setext h2", "atx a"])
    expect(found[0]?.pos).toBe(md.indexOf("Setext H2"))
  })

  test("frontmatter ต้องไม่กลายเป็น heading ปลอม + offset ยังชี้ raw markdown", () => {
    const md = "---\ntitle: X\n---\n\n## ATX A\n\nbody\n"
    const found = headingsInMarkdown(md)
    expect(found.map((entry) => entry.text)).toEqual(["atx a"])
    expect(found[0]?.pos).toBe(md.indexOf("## ATX A"))
  })

  test("buildHeadingMap จับคู่ setext + ATX ถูกตำแหน่ง (index ไม่ drift)", async () => {
    const md = "Intro\n\nSetext H2\n---------\n\n## ATX A\n\ntext\n\n## ATX B\n"
    const { toc } = await renderMarkdown(md, {})
    const { buildHeadingMap } = makeHeadingTools()
    const map = buildHeadingMap(
      md,
      toc.map((entry) => ({ id: entry.id, text: entry.text })),
    )
    expect(map.get("setext-h2")).toBe(md.indexOf("Setext H2"))
    expect(map.get("atx-a")).toBe(md.indexOf("## ATX A"))
    expect(map.get("atx-b")).toBe(md.indexOf("## ATX B"))
  })

  test("หัวข้อที่มีลิงก์ต้อง normalize ข้อความให้ตรงกับ TOC ของ server", () => {
    const md = "## [Doku](https://doku.dev)\n"
    const found = headingsInMarkdown(md)
    expect(found[0]?.text).toBe("doku")
  })

  test("fence ครอบ fence (backtick 4 ตัว) — heading ในโค้ดต้องไม่หลุด", () => {
    const md = ["# ชื่อ", "", "````md", "```", "## ไม่ใช่หัวข้อ", "```", "````", "", "## จริง"].join("\n")
    const found = headingsInMarkdown(md)
    expect(found.map((entry) => entry.text)).toEqual(["จริง"])
    expect(found[0]?.pos).toBe(md.indexOf("## จริง"))
  })

  test("หัวข้อข้อความซ้ำ — จับคู่ตามลำดับ ไม่สลับ", async () => {
    const md = "## ซ้ำ\n\ntext\n\n## ซ้ำ\n"
    const { toc } = await renderMarkdown(md, {})
    const { buildHeadingMap } = makeHeadingTools()
    const map = buildHeadingMap(
      md,
      toc.map((entry) => ({ id: entry.id, text: entry.text })),
    )
    const [first, second] = toc
    expect(map.get(first?.id ?? "")).toBe(md.indexOf("## ซ้ำ"))
    expect(map.get(second?.id ?? "")).toBe(md.lastIndexOf("## ซ้ำ"))
  })

  test("heading ใน directive ยังถูกนับ + offset ตรงบรรทัดจริง", async () => {
    const md = "## นอก\n\n:::note\n### ใน directive\n:::\n"
    const { toc } = await renderMarkdown(md, {})
    const { buildHeadingMap } = makeHeadingTools()
    const map = buildHeadingMap(
      md,
      toc.map((entry) => ({ id: entry.id, text: entry.text })),
    )
    const [outside, inside] = toc
    expect(map.get(outside?.id ?? "")).toBe(md.indexOf("## นอก"))
    expect(map.get(inside?.id ?? "")).toBe(md.indexOf("### ใน directive"))
  })
})

function setup(files: Record<string, string | Uint8Array>) {
  const fs = memoryVaultFs(files)
  const state = new VaultState(fs, "vault")
  const cache = new FragmentCache(null, RENDERER_VERSION)
  const renderer = new DocRenderer(fs, state, cache)
  const hub = new SseHub()
  const app = createDokuApp({ fs, vaultName: "vault", state, renderer, hub })
  return { app }
}

describe("R2 data-title-in-body — ต้องตรงกับ dedupe ของ renderer (docs/08 ข้อ 36/65)", () => {
  test("frontmatter title = h1 (dedupe=true) → ต้องตั้ง attribute กันชื่อซ้ำหลัง mount", async () => {
    const { app } = setup({
      "a.md": "---\ntitle: หัวเรื่อง\n---\n# หัวเรื่อง\n\nเนื้อหา\n",
    })
    const html = await (await app.request("/d/a")).text()
    expect(html).toContain('data-title-in-body="1"')
  })

  test("meta title ต่างจาก h1 (dedupe=false) → ห้ามตั้ง attribute ไม่งั้นชื่อ meta หาย", async () => {
    const { app } = setup({
      "b.md": "# H1 Title\n\nเนื้อหา\n",
      "b.meta.json": JSON.stringify({ title: "Meta Title" }),
    })
    const html = await (await app.request("/d/b")).text()
    expect(html).not.toContain("data-title-in-body")
    expect(html).toContain("Meta Title")
  })
})

describe("R3 dirty lifecycle — ห้ามล้าง dirty ก่อน PUT ตอบกลับ (docs/08 ข้อ 54/65)", () => {
  /** รัน flushSave จริงจาก CLIENT_JS บน state จำลอง */
  function makeFlush() {
    const source = extractFunction(CLIENT_JS, "async function flushSave")
    const factory = new Function(
      "writing",
      "currentText",
      "markClean",
      "jsonRequest",
      "encodePath",
      "setDocStatus",
      "window",
      "syncColophonWords",
      "docEl",
      "fail",
      "LF",
      `${source}; return flushSave;`,
    )
    return factory
  }

  test("ระหว่าง PUT in-flight dirty ต้องยังเป็น true — nav guard/keepalive เห็นงานค้าง", async () => {
    const writing = {
      dirty: true,
      path: "a",
      etag: "e1",
      handle: { getDoc: () => "md" },
      textarea: null,
    }
    let resolvePut: (value: { etag: string }) => void = () => {}
    const requests: unknown[] = []
    const jsonRequest = () => {
      requests.push(1)
      return new Promise<{ etag: string }>((resolve) => {
        resolvePut = resolve
      })
    }
    const flushSave = makeFlush()(
      writing,
      () => writing.handle.getDoc(),
      () => {
        writing.dirty = false
      },
      jsonRequest,
      (path: string) => path,
      () => {},
      { dispatchEvent: () => {} },
      () => {},
      { setAttribute: () => {}, removeAttribute: () => {} },
      () => {},
      "\n",
    )

    const inFlight = flushSave(false)
    // ยังไม่ตอบกลับ: ต้องมีงานค้าง + ต้องไม่ยิง PUT ซ้อน
    expect(writing.dirty).toBe(true)
    void flushSave(false)
    expect(requests.length).toBe(1)

    resolvePut({ etag: "e2" })
    await inFlight
    expect(writing.dirty).toBe(false)
    expect(writing.etag).toBe("e2")
  })

  test("keepalive (pagehide) ต้องยิงเมื่อมีงานค้าง — dirty ไม่ถูกล้างก่อน PUT จบ", async () => {
    const writing = {
      dirty: true,
      path: "a",
      etag: "e1",
      handle: { getDoc: () => "md" },
      textarea: null,
    }
    const calls: Array<{ opts: { keepalive?: boolean } }> = []
    const flushKeepalive = new Function(
      "writing",
      "currentText",
      "encodePath",
      "fetch",
      "docEl",
      `${extractFunction(CLIENT_JS, "function flushKeepalive")}; return flushKeepalive;`,
    )(
      writing,
      () => writing.handle.getDoc(),
      (path: string) => path,
      (_url: string, opts: { keepalive?: boolean }) => {
        calls.push({ opts })
        return Promise.resolve()
      },
      { removeAttribute: () => {} },
    )
    flushKeepalive()
    expect(calls.length).toBe(1)
    expect(calls[0]?.opts.keepalive).toBe(true)
  })
})
