import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { memoryVaultFs, RENDERER_VERSION } from "@doku/core"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"
import { CLIENT_JS } from "../src/web/client.ts"

/**
 * M3.2 Track B — read-parity (docs/09 §5 Track B · docs/08 ข้อ 69)
 *
 * editor.ts แตะ `window` ตอน import → เทสต์จึงอ่านซอร์ส (แบบเดียวกับ test เดิมของ editor)
 * และเช็กผลลัพธ์จริงที่ server ผลิต (katex.css link เฉพาะเอกสารที่มีสมการ)
 */

const EDITOR_SOURCE = readFileSync(new URL("../src/web/editor.ts", import.meta.url), "utf8")

function setup(files: Record<string, string | Uint8Array>) {
  const fs = memoryVaultFs(files)
  const state = new VaultState(fs, "vault")
  const cache = new FragmentCache(null, RENDERER_VERSION)
  const renderer = new DocRenderer(fs, state, cache)
  const hub = new SseHub()
  return { app: createDokuApp({ fs, vaultName: "vault", state, renderer, hub }) }
}

describe("editor read-parity (Track B)", () => {
  test("GFM + markdownKeymap (Enter สืบ list) + composition guard + atomic delimiters", () => {
    expect(EDITOR_SOURCE).toContain("markdown({ base: markdownLanguage })")
    expect(EDITOR_SOURCE).toContain("...markdownKeymap")
    // composition guard: ห้าม rebuild decoration ระหว่าง IME (docs/08 ข้อ 69)
    expect(EDITOR_SOURCE).toContain("if (update.view.composing) return")
    // atomic เฉพาะ delimiter ที่ซ่อน
    expect(EDITOR_SOURCE).toContain("EditorView.atomicRanges.of(")
    expect(EDITOR_SOURCE).toContain("atomicRanges.push(")
    // ไม่ทำ atomic ทั้งช่วง (ไม่มี atomicRanges จาก RangeSet ทั้งก้อน)
    expect(EDITOR_SOURCE).not.toContain("Decoration.set(ranges")
  })

  test("widgets ครบตาม Track B", () => {
    for (const marker of [
      "class CheckboxWidget",
      "class MathWidget",
      "class InlineDirectiveWidget",
      "class BlockHeadWidget",
      "katex.renderToString",
      "cm-doku-hr",
      "cm-doku-checkbox-input",
      'name === "TaskMarker"',
      'name === "HorizontalRule"',
    ]) {
      expect(EDITOR_SOURCE).toContain(marker)
    }
    // block math ต้องเป็น StateField (CM6 ห้าม plugin สร้าง block decoration)
    expect(EDITOR_SOURCE).toContain("const blockMathField = StateField.define")
    expect(EDITOR_SOURCE).toContain("provide: (field) => EditorView.decorations.from(field)")
    // marker ที่ซ่อนเป็น replace เฉพาะ delimiter (ไม่ atomic ทั้งช่วง)
    expect(EDITOR_SOURCE).toContain("const suffix = match[2] ? match[2].length : 0")
  })

  test("attribute ของ directive อ่านได้ทั้ง quoted/unquoted/flag (registry เขียนแบบไหนก็ได้)", () => {
    const match = /const ATTR_PAIR = (\/.*\/g)/.exec(EDITOR_SOURCE)
    expect(match).not.toBeNull()
    // ตัด `/` หน้า-หลังและ flag `g` ออกก่อนประกอบ RegExp ใหม่
    const literal = match?.[1] as string
    const pattern = new RegExp(literal.slice(1, literal.lastIndexOf("/")), "g")
    const parse = (raw: string | undefined): Record<string, string> => {
      const attrs: Record<string, string> = {}
      if (!raw) return attrs
      pattern.lastIndex = 0
      let m = pattern.exec(raw)
      while (m) {
        attrs[m[1] as string] = m[2] !== undefined ? m[2] : (m[3] ?? "")
        m = pattern.exec(raw)
      }
      return attrs
    }
    expect(parse("{color=green strike}")).toEqual({ color: "green", strike: "" })
    expect(parse('{title="เกร็ด มาก" color=red}')).toEqual({ title: "เกร็ด มาก", color: "red" })
    expect(parse('{width="70%"}')).toEqual({ width: "70%" })
    expect(parse(undefined)).toEqual({})
  })

  test("client ส่งข้อมูล schema (block/callout/inline) ให้ editor", () => {
    for (const marker of [
      "blockLabels: BLOCK_LABELS",
      "calloutTypes: (schema && schema.variants) || []",
      "inlineBlocks:",
      'block.kind === "text"',
    ]) {
      expect(CLIENT_JS).toContain(marker)
    }
  })
})

describe("katex.css — link เฉพาะเอกสารที่มีสมการ (Track B)", () => {
  test("เอกสารมี math → มี <link> katex.css", async () => {
    const { app } = setup({ "m.md": "# สมการ\n\n$$\nE = mc^2\n$$\n" })
    const html = await (await app.request("/d/m")).text()
    expect(html).toContain('href="/static/katex.css"')
  })

  test("เอกสารไม่มี math → ไม่โหลด CSS ใหญ่ (380KB)", async () => {
    const { app } = setup({ "p.md": "# ธรรมดา\n\nเนื้อหา\n" })
    const html = await (await app.request("/d/p")).text()
    expect(html).not.toContain("katex.css")
  })
})
