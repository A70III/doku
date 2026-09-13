import { describe, expect, test } from "bun:test"
import { memoryVaultFs, RENDERER_VERSION } from "@doku/core"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"
import { parseAttrs } from "../src/web/editor/blocks.ts"
import { CLIENT_SOURCE } from "./client-source.ts"
import { EDITOR_SOURCE as EDITOR_LAYER_SOURCE } from "./editor-source.ts"

/**
 * M3.2 Track B — read-parity (docs/09 §5 Track B · docs/08 ข้อ 69)
 *
 * editor.ts แตะ `window` ตอน import → เทสต์จึงอ่านซอร์ส (แบบเดียวกับ test เดิมของ editor)
 * และเช็กผลลัพธ์จริงที่ server ผลิต (katex.css link เฉพาะเอกสารที่มีสมการ)
 */

const EDITOR_SOURCE = EDITOR_LAYER_SOURCE

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
    // แต่ set ที่ค้างอยู่ต้อง map ตาม change (ไม่งั้น range เก่าคร่อม line break → CM throw)
    expect(EDITOR_SOURCE).toContain("if (update.view.composing) {")
    expect(EDITOR_SOURCE).toContain("this.decorations = this.decorations.map(update.changes)")
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
    expect(parseAttrs("{color=green strike}")).toEqual({ color: "green", strike: "" })
    expect(parseAttrs('{title="เกร็ด มาก" color=red}')).toEqual({ title: "เกร็ด มาก", color: "red" })
    expect(parseAttrs('{width="70%"}')).toEqual({ width: "70%" })
    expect(parseAttrs(undefined)).toEqual({})
  })

  test("client ส่งข้อมูล schema (block/callout/inline) ให้ editor", () => {
    for (const marker of [
      "blockLabels: BLOCK_LABELS",
      "calloutTypes: (schema && schema.variants) || []",
      "inlineBlocks:",
      'block.kind === "text"',
    ]) {
      expect(CLIENT_SOURCE).toContain(marker)
    }
  })
})

describe("หัว block + การ reveal source ของ `:::` (docs/08 ข้อ 79)", () => {
  test("カーอยู่บนบรรทัด fence → ไม่ replace ด้วย head widget (เห็น source ของตัวเอง)", () => {
    const at = EDITOR_SOURCE.indexOf("new BlockHeadWidget(")
    expect(at).toBeGreaterThan(-1)
    // guard ต้องอยู่ก่อนสร้าง widget — สมมาตรกับ fence ปิด + marker อื่นทุกตัว
    expect(EDITOR_SOURCE.slice(Math.max(0, at - 600), at)).toContain(
      "!touching(openLine.from, openLine.to)",
    )
  })

  test("หัว block ใช้ข้อความของผู้ใช้ (title → label → caption) ไม่ใช่ชื่อ block กลาง ๆ", () => {
    expect(EDITOR_SOURCE).toContain("directiveTitle(block.attrs)")
    // ต้องไม่กลับไปอ่าน `title` ตรง ๆ (progress ใช้ `label`, figure ใช้ `caption`)
    expect(EDITOR_SOURCE).not.toContain("block.attrs.title ??")
  })

  test("คลิกหัว block/widget = วางカーที่บรรทัด fence (ทางเข้าด้วยเมาส์ ไม่ต้องกด ↑/↓)", () => {
    expect(EDITOR_SOURCE).toContain('el.setAttribute("data-from", String(this.#from))')
    // listener บน element ของ widget เอง — `domEventHandlers` ของ mousedown ไม่ถูกเรียก
    // เพราะ CM6 กัน mousedown ของ widget ที่ observer และหยุด handler เมื่อ defaultPrevented
    expect(EDITOR_SOURCE).toContain('el.addEventListener("mousedown", (event) => jumpToSource(')
    expect(EDITOR_SOURCE).toContain("function jumpToSource(")
    expect(EDITOR_SOURCE).toContain("EditorSelection.cursor(from)")
    expect(EDITOR_SOURCE).toContain("event.stopPropagation()")
  })
})

/**
 * Regression — editor แสดง custom block ของ Doku ไม่ครบ (docs/08 ข้อ 81)
 *
 * อาการ: เปิดเอกสารที่มี `:::progress`/`:::figure`/`:::video`/`:::stats` แล้วหน้าอ่านของ server
 * (ที่ render block จริง) ถูก CM6 mount ทับด้วย decoration ที่เหลือแค่ "หัว block" → block ที่
 * เนื้อหาอยู่ใน attribute ล้วนหายทั้งก้อน (อ่านว่า "custom block ของ doku พัง")
 */
describe("read-parity ของ block ที่เนื้อหาอยู่ใน attribute (docs/08 ข้อ 81)", () => {
  test("preview widget ประกอบ markup ชุดเดียวกับ renderer จริง (progress/figure/video/stats)", () => {
    expect(EDITOR_SOURCE).toContain("class BlockPreviewWidget")
    expect(EDITOR_SOURCE).toContain(
      'const PREVIEW_BLOCKS = new Set(["progress", "figure", "video", "stats"])',
    )
    for (const marker of [
      'setAttribute("data-block", "progress")',
      'setAttribute("data-part", "progress-label")',
      'setAttribute("data-part", "figure-caption")',
      'setAttribute("data-block", "stats")',
      'setAttribute("data-block", "stat")',
      'setAttribute("data-block", "video")',
      "percentAttr(",
      "statTiles(",
    ]) {
      expect(EDITOR_SOURCE).toContain(marker)
    }
  })

  test("preview ใช้เมื่อカーอยู่นอก block และ block ปิด fence แล้วเท่านั้น", () => {
    // カーใน block = เห็น source ทั้งก้อน (ไม่งั้นカーเข้าไปแก้ attribute ไม่ได้)
    expect(EDITOR_SOURCE).toContain("!insideBlock &&")
    // block ที่ยังไม่ปิด = กำลังเขียน — ห้ามซ่อนเนื้อที่เหลือทั้งเอกสาร
    expect(EDITOR_SOURCE).toContain("block.closeFrom !== null &&")
    // block ที่ประกอบ preview ไม่ได้ (progress ไม่มี value/เกินช่วง · stats ไม่มี tile) → ถอยไปใช้หัว block
    expect(EDITOR_SOURCE).toContain(
      'block.name !== "progress" || percentAttr(block.attrs.value) !== null',
    )
  })

  test("inline directive รับทั้ง `:stat[…]` และ `::stat[…]` (leaf form ที่ design.md ใช้)", () => {
    expect(EDITOR_SOURCE).toMatch(/const INLINE_DIRECTIVE = \/:\{1,2\}\(\[\\w-\]/)
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
