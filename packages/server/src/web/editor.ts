/**
 * CodeMirror 6 browser entry (docs/08 ข้อ 17, 52) — bundle เป็น `/static/editor.js`
 * ด้วย `bun run build:editor` (CSP `script-src 'self'` → ต้อง self-host ไม่มี CDN)
 *
 * M3.1: **Live Preview เขียนในที่** — ผิวเดียวกับหน้าอ่าน (docs/08 ข้อ 52)
 *   · syntax marker ซ่อนเมื่อカーอยู่นอก node นั้น
 *   · หัวข้อ/โค้ด/blockquote ได้ decoration ระดับบรรทัด → หน้าตาใกล้ตอนอ่าน
 *   · รูปแสดงเป็น widget ในบรรทัด · `==mark==` ได้พื้นจางเต็มช่วง (mapped ตาม `{.color}`) ตาม docs/08 ข้อ 6
 *   · `:::` directive ได้ style ของ fence (ตัว block control strip อยู่ที่ client)
 *
 * ธีมใช้ CSS variable ของ token (`--d-*`) → ตรงกับหน้าอ่านโดยไม่ต้องตั้งค่าซ้ำ
 */

import { autocompletion, type Completion, type CompletionContext } from "@codemirror/autocomplete"
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { markdown, markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown"
import { HighlightStyle, syntaxHighlighting, syntaxTree } from "@codemirror/language"
import {
  EditorSelection,
  EditorState,
  type Extension,
  StateEffect,
  StateField,
  type Text,
} from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  placeholder as placeholderExt,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import type { SyntaxNode } from "@lezer/common"
import { tags as t } from "@lezer/highlight"
import katex from "katex"

export interface DokuEditorHandle {
  getDoc(): string
  setDoc(text: string): void
  focus(): void
  blur(): void
  destroy(): void
  /** เลื่อนカーไป offset นี้ (ใช้ตอน TOC / คืน scroll หลัง mount) */
  scrollTo(pos: number): void
  /** ตำแหน่งบนจอของ offset (null = นอก viewport ที่วัดได้) */
  coordsAt(pos: number): { top: number; bottom: number } | null
  /** offset ของบรรทัดที่อยู่ ณ พิกัด y บนจอ (ใช้จำตำแหน่งอ่าน) */
  offsetAtCoords(y: number): number | null
  /** แก้ attribute ของ directive ที่カーอยู่ (ค่าที่เขียนกลับเป็นข้อความ markdown) */
  patchDirective(patch: Record<string, string | null>): void
  /** ตั้ง/ลบสีของ `==mark==` ที่カーอยู่ในช่วง — null = ลบ `{.color}` (เขียนกลับเป็น markdown เสมอ) */
  patchMark(color: string | null): void
  /** ลบ directive block ที่カーอยู่ทั้ง block (รวม fence ปิด) */
  removeDirective(): void
}

export interface DokuEditorOptions {
  doc: string
  placeholder?: string
  /** ตำแหน่งカーเริ่มต้น (offset ในเอกสาร) — มาจากจุดที่ผู้ใช้คลิก */
  anchor?: number | null
  /** โฟกัส editor ตอนสร้าง (default true) — one surface mount ตอน idle ต้องไม่แย่ง focus (false) */
  focus?: boolean
  /** แปลง path ใน markdown เป็น URL ของ asset จริง (client รู้ doc path) */
  resolveAsset?: (src: string) => string
  /** รายการของ slash menu — client ประกอบจาก /api/schema + markdown พื้นฐาน */
  slashItems?: SlashItem[]
  /** ป้ายชื่อ block ไทย (client BLOCK_LABELS) — หัวของ `:::` */
  blockLabels?: Record<string, string>
  /** callout variant จาก schema (note/info/tip/success/warning/danger/quote) */
  calloutTypes?: readonly string[]
  /** ชื่อ block ที่เป็น inline directive (schema blocks kind=text) — `:badge[…]` */
  inlineBlocks?: readonly string[]
  /** カーเข้า/ออก directive block — client ใช้โชว์ block control strip */
  onDirective?: (info: DirectiveInfo | null) => void
  /** カ์อยู่ใน `==mark==` หรือไม่ — client ใช้โชว์แถบ swatch สี (docs/08 ข้อ 55) */
  onMark?: (info: MarkInfo | null) => void
  onChange?: (value: string) => void
  onSave?: (value: string) => void
  /** カーออกจาก editor (คลิกนอกกล่อง) — ให้ client ปิดโหมดเขียน */
  onBlur?: () => void
}

/* ── widget ─────────────────────────────────────────────────────────────── */

class ImageWidget extends WidgetType {
  #src: string
  #alt: string
  #resolve: (src: string) => string

  constructor(src: string, alt: string, resolve: (src: string) => string) {
    super()
    this.#src = src
    this.#alt = alt
    this.#resolve = resolve
  }

  override eq(other: ImageWidget): boolean {
    return other.#src === this.#src && other.#alt === this.#alt
  }

  override toDOM(): HTMLElement {
    const figure = document.createElement("span")
    figure.className = "cm-doku-image"
    const img = document.createElement("img")
    img.src = this.#resolve(this.#src)
    img.alt = this.#alt
    img.loading = "lazy"
    figure.appendChild(img)
    if (this.#alt) {
      const caption = document.createElement("span")
      caption.className = "cm-doku-image-caption"
      caption.textContent = this.#alt
      figure.appendChild(caption)
    }
    return figure
  }

  override ignoreEvent(): boolean {
    return false
  }
}

/* ── widgets (read-parity — docs/09 Track B) ───────────────────────────── */

/** checkbox ของ task list — คลิกได้ (client domEventHandlers เขียนกลับ `- [x]`/`- [ ]`) */
class CheckboxWidget extends WidgetType {
  #checked: boolean

  constructor(checked: boolean) {
    super()
    this.#checked = checked
  }

  override eq(other: CheckboxWidget): boolean {
    return other.#checked === this.#checked
  }

  override toDOM(): HTMLElement {
    const input = document.createElement("input")
    input.type = "checkbox"
    input.checked = this.#checked
    input.className = "cm-doku-checkbox-input"
    input.setAttribute("aria-label", this.#checked ? "ทำแล้ว" : "ยังไม่ทำ")
    return input
  }

  override ignoreEvent(): boolean {
    // ต้องเป็น false ไม่งั้น CM6 ตัด event ก่อนถึง domEventHandlers (checkbox คลิกไม่ได้)
    return false
  }
}

/** `$…$` / `$$…$$` → KaTeX — CSS มาจาก `/static/katex.css` (หน้าเว็บ link เมื่อ fragment มีสมการ) */
class MathWidget extends WidgetType {
  #latex: string
  #display: boolean

  constructor(latex: string, display: boolean) {
    super()
    this.#latex = latex
    this.#display = display
  }

  override eq(other: MathWidget): boolean {
    return other.#latex === this.#latex && other.#display === this.#display
  }

  override toDOM(): HTMLElement {
    const el = document.createElement(this.#display ? "div" : "span")
    el.className = this.#display ? "cm-doku-math cm-doku-math-display" : "cm-doku-math"
    try {
      el.innerHTML = katex.renderToString(this.#latex, {
        displayMode: this.#display,
        throwOnError: false,
      })
    } catch {
      el.textContent = this.#display ? `$$${this.#latex}$$` : `$${this.#latex}$`
      el.classList.add("cm-doku-math-error")
    }
    return el
  }

  override ignoreEvent(): boolean {
    // false = CM6 รับ event → คลิก math แล้วカーชิดขอบ widget → `touching` คืน raw ให้แก้ LaTeX
    return false
  }
}

/** inline directive `:badge[BETA]{color=green}` — read-parity (registry kind = text) */
class InlineDirectiveWidget extends WidgetType {
  #name: string
  #text: string
  #attrs: Record<string, string>

  constructor(name: string, text: string, attrs: Record<string, string>) {
    super()
    this.#name = name
    this.#text = text
    this.#attrs = attrs
  }

  override eq(other: InlineDirectiveWidget): boolean {
    return (
      other.#name === this.#name &&
      other.#text === this.#text &&
      JSON.stringify(other.#attrs) === JSON.stringify(this.#attrs)
    )
  }

  override toDOM(): HTMLElement {
    // ใช้ element/attribute ชุดเดียวกับ renderer จริง → CSS ของ content.css ครอบให้เลย
    const el = document.createElement(this.#name === "mark" ? "mark" : "span")
    el.setAttribute("data-block", this.#name)
    if (this.#attrs.color) el.setAttribute("data-color", this.#attrs.color)
    if (this.#name === "badge" && "strike" in this.#attrs) el.setAttribute("data-strike", "true")
    el.textContent = this.#text
    return el
  }

  override ignoreEvent(): boolean {
    return false
  }
}

/** หัวของ `:::` block — แทนบรรทัด fence เปิด (callout/details/tabs ตาม renderer จริง) */
class BlockHeadWidget extends WidgetType {
  #name: string
  #label: string
  #variant: string
  #title: string

  constructor(name: string, label: string, variant: string, title: string) {
    super()
    this.#name = name
    this.#label = label
    this.#variant = variant
    this.#title = title
  }

  override eq(other: BlockHeadWidget): boolean {
    return (
      other.#name === this.#name &&
      other.#label === this.#label &&
      other.#variant === this.#variant &&
      other.#title === this.#title
    )
  }

  override toDOM(): HTMLElement {
    const el = document.createElement("div")
    el.className = "cm-doku-block-head"
    el.setAttribute("data-block", this.#name)
    if (this.#variant) el.setAttribute("data-variant", this.#variant)
    const label = document.createElement("span")
    label.className = "cm-doku-block-head-label"
    label.textContent = this.#label
    el.appendChild(label)
    if (this.#title) {
      const title = document.createElement("span")
      title.className = "cm-doku-block-head-title"
      title.textContent = this.#title
      el.appendChild(title)
    }
    return el
  }
}

/* ── decoration ─────────────────────────────────────────────────────────── */

const HEADING_LINE = /^ATXHeading(\d)$/
const HIDE_MARKS = new Set(["EmphasisMark", "CodeMark", "StrikethroughMark"])
/** marker ที่ซ่อนได้เมื่อカーออกจาก node — `HeaderMark`/`LinkMark` จัดการแยก */
const LINK_MARKS = new Set(["LinkMark"])

const markDeco = (cls: string) => Decoration.mark({ class: cls })
const hide = () => Decoration.replace({})

/** `:::` fence (มีชื่อ block) — ตัวเดียวกับที่ block scan ใช้ */
const DIRECTIVE_OPEN = /^(:{3,})\s*([\w-]+)\s*(\{[^}]*\})?\s*$/
/** `:::` ปิด (ไม่มีชื่อ) */
const DIRECTIVE_CLOSE = /^(:{3,})\s*$/
/** จับ suffix `{.color}` ด้วย — カーอยู่นอกช่วงต้องซ่อนทั้ง `==` และ suffix (docs/08 ข้อ 52) */
const DOKU_MARK = /==([^=\n]+?)==(\{\.[\w-]+\})?/g
/** inline directive `:badge[…]` / `:mark[…]` (registry kind = text) */
const INLINE_DIRECTIVE = /:([\w-]+)\[([^\]]*)\](\{[^}]*\})?/g
/** inline math `$…$` — ไม่รับช่องว่างหัว/ท้าย (ตาม remark-math) */
const INLINE_MATH = /(?<![\\$])\$([^\s$][^$\n]*?[^\s$]|[^\s$])\$(?!\$)/g
/** ถอยหลังกี่บรรทัดเพื่อหาต้น `:::` ที่囲 visible range — พอสำหรับเอกสารจริง (ห้ามเดินทั้งไฟล์) */
const DIRECTIVE_LOOKBACK = 200

interface DirectiveBlockInfo {
  name: string
  attrs: Record<string, string>
  openFrom: number
  openTo: number
  closeFrom: number | null
  closeTo: number | null
}

/** สแกน `:::` ในช่วงบรรทัด — stack ตามความยาว fence (docs/08 ข้อ 24 ชั้นนอกยาวกว่าชั้นใน) */
function scanDirectives(doc: Text, fromLine: number, toLine: number): DirectiveBlockInfo[] {
  const blocks: DirectiveBlockInfo[] = []
  const stack: Array<{
    name: string
    attrs: Record<string, string>
    fence: number
    openFrom: number
    openTo: number
  }> = []
  for (let n = fromLine; n <= toLine; n += 1) {
    const line = doc.line(n)
    const close = DIRECTIVE_CLOSE.exec(line.text)
    if (close) {
      const fence = (close[1] as string).length
      while (stack.length > 0 && (stack[stack.length - 1] as { fence: number }).fence <= fence) {
        const open = stack.pop()
        if (!open) break
        blocks.push({
          name: open.name,
          attrs: open.attrs,
          openFrom: open.openFrom,
          openTo: open.openTo,
          closeFrom: line.from,
          closeTo: line.to,
        })
      }
      continue
    }
    const match = DIRECTIVE_OPEN.exec(line.text)
    if (match) {
      stack.push({
        name: match[2] as string,
        attrs: parseAttrs(match[3]),
        fence: (match[1] as string).length,
        openFrom: line.from,
        openTo: line.to,
      })
    }
  }
  // block ที่ยังไม่ปิด (カーอยู่ระหว่างเขียน) — ยังต้องได้หัว + พื้น block
  for (const open of stack) {
    blocks.push({
      name: open.name,
      attrs: open.attrs,
      openFrom: open.openFrom,
      openTo: open.openTo,
      closeFrom: null,
      closeTo: null,
    })
  }
  return blocks
}

export interface DecorationOptions {
  resolveAsset: (src: string) => string
  /** ป้ายชื่อ block ไทย (จาก client BLOCK_LABELS) */
  blockLabels: Record<string, string>
  /** ชื่อ callout variant (schema.variants) — เลือกสีพื้นตามชนิด */
  calloutTypes: readonly string[]
  inlineBlocks: readonly string[]
}

/** ตำแหน่งนี้อยู่ในโค้ดหรือไม่ (ห้าม decorate `:badge[…]` ใน code span/fence) */
function insideCode(view: EditorView, from: number, to: number): boolean {
  const tree = syntaxTree(view.state)
  for (const pos of [from, to]) {
    let node: SyntaxNode | null = tree.resolveInner(pos, 1)
    while (node) {
      if (
        node.name === "InlineCode" ||
        node.name === "FencedCode" ||
        node.name === "CodeBlock" ||
        node.name === "CodeText"
      ) {
        return true
      }
      node = node.parent
    }
  }
  return false
}

/** ซ่อน marker + ใส่คลาสระดับบรรทัด/บล็อก — เฉพาะช่วงที่มองเห็น (ไม่เดินทั้งเอกสาร)
 *  `touching` = カーสัมผัส node — **เฉพาะเมื่อ editor มี focus** (docs/08 ข้อ 65)
 *  ตอน mount ครั้งเดียว (one surface) カーอยู่ที่ 0 แต่ยังไม่ focus → ต้องเห็นหน้าแบบอ่าน
 *  `atomic` = replace เฉพาะ delimiter (ไม่ทำ atomicRanges ทั้งช่วง — docs/08 ข้อ 69) */
function buildDecorations(
  view: EditorView,
  options: DecorationOptions,
): { decorations: DecorationSet; atomic: DecorationSet } {
  const ranges: Array<{ from: number; to: number; value: Decoration }> = []
  /** delimiter ที่ซ่อนและต้องเป็น atomic (カーข้ามไป ไม่ตกใน `**…**` — docs/08 ข้อ 69) */
  const atomicRanges: Array<[number, number]> = []
  const doc = view.state.doc
  const selection = view.state.selection
  const focused = view.hasFocus
  const touching = (from: number, to: number): boolean =>
    focused && selection.ranges.some((range) => range.from <= to + 1 && range.to >= from - 1)
  const lineClass = (
    line: { from: number; to: number },
    cls: string,
    attributes?: Record<string, string>,
  ) => {
    ranges.push({
      from: line.from,
      to: line.from,
      value: Decoration.line(attributes ? { class: cls, attributes } : { class: cls }),
    })
  }

  for (const visible of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from: visible.from,
      to: visible.to,
      enter: (node) => {
        const name = node.name
        const heading = HEADING_LINE.exec(name)
        if (heading) {
          lineClass(doc.lineAt(node.from), `cm-doku-h${heading[1]}`)
          return
        }
        if (name === "Blockquote") {
          let pos = doc.lineAt(node.from).from
          const end = doc.lineAt(Math.min(node.to, doc.length)).from
          while (pos <= end) {
            lineClass({ from: pos, to: pos }, "cm-doku-quote")
            pos = pos + doc.lineAt(pos).length + 1
            if (pos > doc.length) break
          }
          return
        }
        if (name === "FencedCode" || name === "CodeBlock" || name === "Table") {
          const cls = name === "Table" ? "cm-doku-table" : "cm-doku-code"
          let pos = doc.lineAt(node.from).from
          const end = doc.lineAt(Math.min(node.to, doc.length)).from
          while (pos <= end) {
            lineClass({ from: pos, to: pos }, cls)
            pos = pos + doc.lineAt(pos).length + 1
            if (pos > doc.length) break
          }
          return
        }
        if (name === "HorizontalRule") {
          const line = doc.lineAt(node.from)
          lineClass(line, "cm-doku-hr")
          if (!touching(node.from, node.to)) {
            ranges.push({ from: line.from, to: line.to, value: hide() })
          }
          return
        }
        if (name === "TaskMarker") {
          const checked = /\[[xX]\]/.test(doc.sliceString(node.from, node.to))
          if (checked) lineClass(doc.lineAt(node.from), "cm-doku-task-done")
          if (!touching(node.from, node.to)) {
            ranges.push({
              from: node.from,
              to: node.to,
              value: Decoration.replace({ widget: new CheckboxWidget(checked) }),
            })
          }
          return
        }
        if (name === "Image") {
          if (touching(node.from, node.to)) return
          const source = doc.sliceString(node.from, node.to)
          const match = /^!\[([^\]]*)\]\(([^)\s]+)/.exec(source)
          if (!match) return
          ranges.push({
            from: node.from,
            to: node.to,
            value: Decoration.replace({
              widget: new ImageWidget(match[2] as string, match[1] as string, options.resolveAsset),
            }),
          })
          return
        }
        if (name === "HeaderMark") {
          if (touching(node.from, node.to)) return
          const after = doc.sliceString(node.to, node.to + 1)
          const to = after === " " ? node.to + 1 : node.to
          ranges.push({ from: node.from, to, value: hide() })
          atomicRanges.push([node.from, to])
          return
        }
        if (HIDE_MARKS.has(name) || LINK_MARKS.has(name)) {
          if (touching(node.from, node.to)) return
          ranges.push({ from: node.from, to: node.to, value: hide() })
          atomicRanges.push([node.from, node.to])
          return
        }
        if (name === "Link") {
          ranges.push({ from: node.from, to: node.to, value: markDeco("cm-doku-link") })
          return
        }
        if (name === "URL" && node.node.parent?.name === "Link") {
          if (touching(node.from, node.to)) return
          // ซ่อน `(url)` ทั้งวงเล็บ — เก็บข้อความลิงก์ไว้
          const before = doc.sliceString(Math.max(0, node.from - 2), node.from)
          const from = before.startsWith("](") ? node.from - 2 : node.from
          const after = doc.sliceString(node.to, node.to + 1)
          if (after !== ")") return
          ranges.push({ from, to: node.to + 1, value: hide() })
          atomicRanges.push([from, node.to + 1])
        }
      },
    })
  }

  // doku extensions ที่ Lezer ไม่รู้จัก (`:::` block, `==mark==`) + math — สแกนเป็นบรรทัด
  for (const visible of view.visibleRanges) {
    const firstLine = doc.lineAt(visible.from).number
    const lastLine = doc.lineAt(Math.min(visible.to, doc.length)).number

    // ── `:::` blocks: หัว block แทน fence เปิด · พื้น block ตามชนิด · ซ่อน fence ปิด ──
    const blocks = scanDirectives(doc, Math.max(1, firstLine - DIRECTIVE_LOOKBACK), lastLine)
    for (const block of blocks) {
      const openLine = doc.lineAt(block.openFrom)
      if (openLine.from >= visible.from - 1 && openLine.to <= visible.to + 1) {
        const variant =
          options.calloutTypes.indexOf(block.name) !== -1 ? block.name : (block.attrs.type ?? "")
        ranges.push({
          from: openLine.from,
          to: openLine.to,
          value: Decoration.replace({
            widget: new BlockHeadWidget(
              block.name,
              options.blockLabels[block.name] ?? block.name,
              variant,
              block.attrs.title ?? "",
            ),
          }),
        })
      }
      const endPos = block.closeFrom ?? doc.length
      const lastBlockLine = doc.lineAt(endPos).number
      const attrs: Record<string, string> = { "data-block": block.name }
      const variant =
        options.calloutTypes.indexOf(block.name) !== -1 ? block.name : (block.attrs.type ?? "")
      if (variant) attrs["data-variant"] = variant
      for (let n = openLine.number + 1; n < lastBlockLine; n += 1) {
        const line = doc.line(n)
        if (line.from <= visible.to && line.to >= visible.from) {
          lineClass(line, "cm-doku-block-line", attrs)
        }
      }
      if (
        block.closeFrom !== null &&
        !touching(block.closeFrom, block.closeTo ?? block.closeFrom)
      ) {
        const closeLine = doc.lineAt(block.closeFrom)
        if (closeLine.from <= visible.to && closeLine.to >= visible.from) {
          ranges.push({ from: closeLine.from, to: closeLine.to, value: hide() })
        }
      }
    }

    // ── `==mark==`, `:::` (ไม่ครบคู่), hr, task marker, math — ต่อบรรทัด ──
    const covered: Array<[number, number]> = []
    let line = doc.line(firstLine)
    while (line.from <= visible.to) {
      const text = line.text

      // block math `$$…$$` (บรรทัดเดียวหรือหลายบรรทัด)
      const trimmed = text.trim()
      // `$$…$$` บรรทัดเดียว — หลายบรรทัดเป็นงานของ blockMathField (CM6 ห้าม plugin ทำ block deco)
      if (trimmed.length > 4 && trimmed.startsWith("$$") && trimmed.endsWith("$$")) {
        const openAt = line.from + text.indexOf("$$")
        const endPos = line.from + text.lastIndexOf("$$") + 2
        const latex = text.slice(text.indexOf("$$") + 2, text.lastIndexOf("$$"))
        if (!touching(openAt, endPos)) {
          covered.push([openAt, endPos])
          ranges.push({
            from: openAt,
            to: endPos,
            value: Decoration.replace({ widget: new MathWidget(latex.trim(), true) }),
          })
        }
      }

      DOKU_MARK.lastIndex = 0
      let match = DOKU_MARK.exec(text)
      while (match) {
        const start = line.from + match.index
        const end = start + match[0].length
        // Decoration.mark แนบ data-color → CSS อ่าน --dk-mapped-bg ตาม {.color} (ผิวเดียวกับหน้าอ่าน)
        const color = match[2] ? match[2].slice(2, -1) : ""
        ranges.push({
          from: start,
          to: end,
          value: Decoration.mark({
            class: "cm-doku-mark",
            ...(color ? { attributes: { "data-color": color } } : {}),
          }),
        })
        if (!touching(start, end)) {
          // ซ่อน `==` เปิด + `==` ปิด และ `{.color}` ท้ายช่วงเป็น **ชุดเดียว**
          // (ห้ามช่วง replace ซ้อนกัน — CM6 จะทิ้งช่วงที่ทับ แล้ว marker โผล่)
          const suffix = match[2] ? match[2].length : 0
          ranges.push({ from: start, to: start + 2, value: hide() })
          ranges.push({ from: end - suffix - 2, to: end, value: hide() })
          atomicRanges.push([start, start + 2])
          atomicRanges.push([end - suffix - 2, end])
        }
        match = DOKU_MARK.exec(text)
      }

      // inline directive `:badge[…]` — ข้ามบรรทัดที่เป็น `:::` fence/ปิด และในโค้ด
      if (!DIRECTIVE_OPEN.test(text) && !DIRECTIVE_CLOSE.test(text)) {
        INLINE_DIRECTIVE.lastIndex = 0
        let inline = INLINE_DIRECTIVE.exec(text)
        while (inline) {
          const start = line.from + inline.index
          const end = start + inline[0].length
          const name = inline[1] as string
          if (
            options.inlineBlocks.indexOf(name) !== -1 &&
            !touching(start, end) &&
            !insideCode(view, start, end)
          ) {
            ranges.push({
              from: start,
              to: end,
              value: Decoration.replace({
                widget: new InlineDirectiveWidget(name, inline[2] as string, parseAttrs(inline[3])),
              }),
            })
          }
          inline = INLINE_DIRECTIVE.exec(text)
        }
      }

      // inline math `$…$` — ข้ามช่วงที่ block math ครอบแล้ว
      INLINE_MATH.lastIndex = 0
      let math = INLINE_MATH.exec(text)
      while (math) {
        const start = line.from + math.index
        const end = start + math[0].length
        const inCovered = covered.some(([a, b]) => start < b && end > a)
        if (!inCovered && !touching(start, end)) {
          ranges.push({
            from: start,
            to: end,
            value: Decoration.replace({ widget: new MathWidget(math[1] as string, false) }),
          })
        }
        math = INLINE_MATH.exec(text)
      }

      if (line.to >= doc.length) break
      line = doc.line(line.number + 1)
    }
  }

  return {
    decorations: Decoration.set(
      ranges.map((range) => range.value.range(range.from, range.to)),
      true,
    ),
    atomic: Decoration.set(
      atomicRanges.map(([from, to]) => hide().range(from, to)),
      true,
    ),
  }
}

/** block math `$$` หลายบรรทัด — **ต้องเป็น StateField** เพราะ CM6 ห้าม plugin สร้าง block decoration
 *  (สแกนเฉพาะบรรทัดที่ขึ้นต้นด้วย `$$` · ครอบทั้งบรรทัดตามข้อกำหนดของ block replace)
 *  カーแตะ block → ปล่อย raw (แก้ LaTeX ได้) */
function blockMathDecorations(doc: Text, selection: EditorSelection): DecorationSet {
  const ranges: Array<{ from: number; to: number; value: Decoration }> = []
  let open: { from: number; latexFrom: number } | null = null
  for (let n = 1; n <= doc.lines; n += 1) {
    const line = doc.line(n)
    const trimmed = line.text.trim()
    if (!open) {
      if (trimmed === "$$") {
        const at = line.text.indexOf("$$")
        open = { from: line.from + at, latexFrom: line.from + at + 2 }
      }
      continue
    }
    if (!trimmed.endsWith("$$")) continue
    const index = line.text.lastIndexOf("$$")
    const to = line.from + index + 2
    const touched = selection.ranges.some(
      (range) => range.from <= to + 1 && range.to >= (open as { from: number }).from - 1,
    )
    if (!touched) {
      const latex = doc.sliceString(
        (open as { from: number; latexFrom: number }).latexFrom,
        line.from + index,
      )
      const startLine = doc.lineAt((open as { from: number }).from)
      ranges.push({
        from: startLine.from,
        to: line.to,
        value: Decoration.replace({ widget: new MathWidget(latex.trim(), true), block: true }),
      })
    }
    open = null
  }
  return Decoration.set(
    ranges.map((range) => range.value.range(range.from, range.to)),
    true,
  )
}

const setBlockMath = StateEffect.define<DecorationSet>()

/** StateField: block math (คำนวณใหม่เมื่อ doc/selection เปลี่ยน — ไม่ผูกกับ viewport) */
const blockMathField = StateField.define<DecorationSet>({
  create: (state) => blockMathDecorations(state.doc, state.selection),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setBlockMath)) return effect.value
    }
    if (tr.docChanged || tr.selection) {
      return blockMathDecorations(tr.state.doc, tr.state.selection)
    }
    return value
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** resolver ของ asset ส่งผ่าน closure ตอนสร้าง plugin — widget ต้องใช้ตอนคำนวณ decoration ครั้งแรก */
const livePreview = (options: DecorationOptions) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      atomic: DecorationSet
      constructor(view: EditorView) {
        const built = buildDecorations(view, options)
        this.decorations = built.decorations
        this.atomic = built.atomic
      }
      update(update: ViewUpdate): void {
        // composition guard (docs/08 ข้อ 69): ห้าม replace ระหว่าง IME ทำงาน (ไทย/จีน/ญี่ปุ่น)
        if (update.view.composing) return
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          update.focusChanged
        ) {
          const built = buildDecorations(update.view, options)
          this.decorations = built.decorations
          this.atomic = built.atomic
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )

/* ── slash menu (docs/08 ข้อ 55) ────────────────────────────────────────── */

export interface SlashItem {
  /** คำที่พิมพ์หลัง `/` */
  keyword: string
  label: string
  detail?: string
  /** เทมเพลต markdown — `|` = ตำแหน่งカーหลังแทรก */
  template: string
}

function applyTemplate(view: EditorView, item: SlashItem, from: number, to: number): void {
  const cursor = item.template.indexOf("|")
  const text = item.template.replace("|", "")
  const anchor = from + (cursor === -1 ? text.length : cursor)
  view.dispatch({
    changes: { from, to, insert: text },
    selection: EditorSelection.cursor(anchor),
    scrollIntoView: true,
  })
  view.focus()
}

function slashCompletion(items: SlashItem[]): Extension {
  /** กรองเอง (ไทย/อังกฤษ) แล้วส่ง `filter: false` — CM6 กรองด้วย fuzzy matcher บน label ASCII
   *  พิมพ์ไทยจะโดนกรองเป็นศูนย์ · และไม่ใช้ validFor เพื่อให้ CM เรียก source ใหม่ทุกคีย์
   *  (มี validFor = CM ใช้ผลเดิมซ้ำไม่กรอง) */
  const matchItem = (item: SlashItem, query: string): boolean => {
    if (!query) return true
    const needle = query.toLowerCase()
    return (
      item.keyword.toLowerCase().startsWith(needle) || item.label.toLowerCase().includes(needle)
    )
  }

  /** ชั้นการจัดอันดับ: 0 = keyword ขึ้นต้น, 1 = label ขึ้นต้น, 2 = มีคำอยู่ใน label
   *  (query ว่าง = ทุกรายการชั้น 0 → เรียงตามลำดับเดิม) */
  const tier = (item: SlashItem, needle: string): number => {
    if (item.keyword.toLowerCase().startsWith(needle)) return 0
    if (item.label.toLowerCase().startsWith(needle)) return 1
    return 2
  }

  const source = (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos)
    const before = line.text.slice(0, context.pos - line.from)
    // `/` ที่ต้นบรรทัด (หรือหลังช่องว่าง) แล้วพิมพ์ต่อด้วยตัวอักษร (รวมไทย + สระ/วรรณยุกต์ = \p{M}) หรือขีด
    const match = /(^|\s)\/([\p{L}\p{M}\p{N}_-]*)$/u.exec(before)
    if (!match) return null
    const query = match[2] as string
    const start = context.pos - query.length - 1
    // ต้องไม่ใช่ URL (https://) หรือส่วนของ path
    if (start > line.from) {
      const prev = line.text[start - line.from - 1]
      if (prev && /[\w:/.-]/.test(prev)) return null
    }
    const needle = query.toLowerCase()
    const options: Completion[] = items
      .filter((item) => matchItem(item, query))
      // เรียงตาม tier (stable sort — ชั้นเดียวกันคงลำดับเดิมของรายการ)
      .sort((a, b) => tier(a, needle) - tier(b, needle))
      .map((item) => ({
        label: item.keyword,
        displayLabel: item.label,
        detail: item.detail,
        type: "keyword",
        apply: (view, _completion, from, to) => applyTemplate(view, item, from, to),
      }))
    if (options.length === 0) return null
    // ไม่ใส่ validFor (CM จะได้เรียก source ใหม่ทุก keystroke → matchItem กรองจริงทุกครั้ง)
    return {
      from: start,
      options,
      filter: false,
    }
  }

  return autocompletion({
    override: [source],
    icons: false,
    closeOnBlur: true,
    optionClass: (completion) => (completion.type === "keyword" ? "doku-slash-option" : ""),
  })
}

/* ── block control strip: รู้ว่ากำลังแก้ directive ไหนอยู่ (docs/08 ข้อ 55) ── */

export interface DirectiveInfo {
  /** ชื่อ block (note / figure / tabs …) */
  name: string
  /** attribute ต่าง ๆ บน fence */
  attrs: Record<string, string>
  /** จำนวน colon ของ fence (ใช้ตอนปิด block) */
  fence: string
  /** ต้นบรรทัดของ fence */
  lineFrom: number
  /** ตำแหน่งบนจอ (สำหรับวางแถบควบคุม) */
  top: number
  left: number
}

const FENCE_LINE = /^(:{3,})\s*([\w-]+)\s*(\{[^}]*\})?\s*$/
/** อ่าน attribute ของ directive — รับทั้ง `key="value"` และ `key=value` (แบบ registry)
 *  และ flag เปล่า (`strike`) → ค่า "" */
const ATTR_PAIR = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|([^\s}]+)))?/g

function parseAttrs(raw: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {}
  if (!raw) return attrs
  ATTR_PAIR.lastIndex = 0
  let match = ATTR_PAIR.exec(raw)
  while (match) {
    const value = match[2] !== undefined ? match[2] : (match[3] ?? "")
    attrs[match[1] as string] = value
    match = ATTR_PAIR.exec(raw)
  }
  return attrs
}

/** หา directive ที่カーอยู่ข้างใน (ถ้ามี) — สแกนขึ้นหาปิด fence ที่ยังไม่ถูกปิด */
function directiveAtCursor(view: EditorView): DirectiveInfo | null {
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  for (let number = line.number; number >= 1; number -= 1) {
    const current = view.state.doc.line(number)
    const match = FENCE_LINE.exec(current.text)
    if (!match) continue
    const fence = match[1] as string
    // fence ปิดของ block ก่อนหน้า?
    if (current !== line && !match[2]) {
      // เจอ `:::` ปิดก่อนถึงต้น block = ไม่ได้อยู่ข้างใน
      break
    }
    const name = match[2]
    if (!name) break
    const info: DirectiveInfo = {
      name,
      attrs: parseAttrs(match[3]),
      fence,
      lineFrom: current.from,
      top: 0,
      left: 0,
    }
    const coords = view.coordsAtPos(current.from)
    if (coords) {
      const rect = view.dom.getBoundingClientRect()
      info.top = coords.top - rect.top
      info.left = coords.left - rect.left
    }
    return info
  }
  return null
}

/** เขียน attribute กลับเป็นข้อความ directive (ไม่แตะอย่างอื่นในบรรทัด)
 *  `patch.name` = เปลี่ยนชื่อ block (เช่น note → warning) */
function writeAttrs(
  view: EditorView,
  info: DirectiveInfo,
  patch: Record<string, string | null>,
): void {
  const line = view.state.doc.lineAt(info.lineFrom)
  const match = FENCE_LINE.exec(line.text)
  if (!match) return
  const attrs: Record<string, string> = { ...info.attrs }
  for (const [key, value] of Object.entries(patch)) {
    if (key === "name") continue
    if (value === null || value === "") delete attrs[key]
    else attrs[key] = value
  }
  const name = patch.name ?? match[2]
  const pairs = Object.entries(attrs)
  const body = pairs.map(([key, value]) => `${key}="${value.replace(/"/g, "")}"`).join(" ")
  const next = `${info.fence}${name}${body ? `{${body}}` : ""}`
  view.dispatch({ changes: { from: line.from, to: line.to, insert: next } })
}

/* ── mark: แถบ swatch สีของ ==mark== (docs/08 ข้อ 6/55) ───────────────── */

export interface MarkInfo {
  /** สีปัจจุบันจาก `{.color}` — null = ไม่ระบุ (ใช้ accent) */
  color: string | null
  /** ต้นบรรทัดของ mark (key กัน rebuild แถบ) */
  lineFrom: number
  /** ตำแหน่งบนจอ (สำหรับวางแถบ swatch) */
  top: number
  left: number
}

/** หา mark ที่カーอยู่ในช่วง — mark ไม่ข้ามบรรทัด (regex กัน \n) จึงสแกนบรรทัดเดียวพอ */
function markAtCursor(view: EditorView): MarkInfo | null {
  const pos = view.state.selection.main.head
  const line = view.state.doc.lineAt(pos)
  DOKU_MARK.lastIndex = 0
  let match = DOKU_MARK.exec(line.text)
  while (match) {
    const start = line.from + match.index
    const end = start + match[0].length
    if (pos >= start && pos <= end) {
      const info: MarkInfo = {
        color: match[2] ? match[2].slice(2, -1) : null,
        lineFrom: line.from,
        top: 0,
        left: 0,
      }
      const coords = view.coordsAtPos(start)
      if (coords) {
        const rect = view.dom.getBoundingClientRect()
        info.top = coords.top - rect.top
        info.left = coords.left - rect.left
      }
      return info
    }
    match = DOKU_MARK.exec(line.text)
  }
  return null
}

/* ── theme: ให้ตรงกับหน้าอ่าน (docs/03 §1.3) ───────────────────────────── */

const theme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--k-text)",
    fontSize: "var(--d-read)",
    lineHeight: "var(--k-leading-th)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--d-font-sans)",
    lineHeight: "var(--k-leading-th)",
    overflow: "visible",
  },
  ".cm-content": {
    padding: "0",
    fontFamily: "var(--d-font-sans)",
    caretColor: "var(--d-accent)",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--d-accent)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "var(--d-selection) !important",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--d-selection) !important",
  },
})

/** หา TaskMarker ของ checkbox widget ที่คลิก — ใช้บรรทัดของ widget (marker มีได้บรรทัดละตัว)
 *  `posAtDOM` ของ widget คืนตำแหน่ง "ระหว่าง" อักขระ จึงไม่พึ่ง syntax tree */
function taskMarkerForWidget(
  view: EditorView,
  checkbox: Element,
): { from: number; to: number } | null {
  const doc = view.state.doc
  let pos: number
  try {
    pos = view.posAtDOM(checkbox, 0)
  } catch {
    return null
  }
  const line = doc.lineAt(Math.max(0, Math.min(pos, doc.length)))
  const match = /\[[ xX]\]/.exec(line.text)
  if (!match) return null
  const from = line.from + match.index
  return { from, to: from + match[0].length }
}

/** โทเคนโค้ดใน editor — map กับสี Shiki github-light/github-dark ที่หน้าอ่านใช้
 *  (ค่าสีเป็น CSS var ต่อธีม — ดู app.css `--k-code-*`) */
const codeHighlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--k-code-comment)" },
  {
    tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.moduleKeyword, t.definitionKeyword],
    color: "var(--k-code-keyword)",
  },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--k-code-string)" },
  { tag: [t.number, t.bool, t.null, t.atom, t.constant(t.name)], color: "var(--k-code-number)" },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName],
    color: "var(--k-code-function)",
  },
  { tag: [t.typeName, t.className, t.namespace], color: "var(--k-code-type)" },
  {
    tag: [t.propertyName, t.attributeName, t.definition(t.propertyName)],
    color: "var(--k-code-property)",
  },
  { tag: [t.tagName, t.angleBracket], color: "var(--k-code-tag)" },
  { tag: t.variableName, color: "var(--k-code-variable)" },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: "var(--k-code-operator)" },
  { tag: [t.heading, t.strong], fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: t.link, color: "var(--d-accent)", textDecoration: "underline" },
  { tag: t.meta, color: "var(--k-code-meta)" },
  { tag: t.invalid, color: "var(--k-danger)" },
])

/* ── create ─────────────────────────────────────────────────────────────── */

function create(parent: HTMLElement, options: DokuEditorOptions): DokuEditorHandle {
  const resolveAsset = options.resolveAsset ?? ((src: string) => src)
  const decorationOptions: DecorationOptions = {
    resolveAsset,
    blockLabels: options.blockLabels ?? {},
    calloutTypes: options.calloutTypes ?? [],
    inlineBlocks: options.inlineBlocks ?? [],
  }
  const previewPlugin = livePreview(decorationOptions)
  const extensions: Extension[] = [
    history(),
    // GFM เท่าฝั่งอ่าน (ตาราง/ strikethrough / task list) — docs/09 Track B
    markdown({ base: markdownLanguage }),
    EditorView.lineWrapping,
    theme,
    syntaxHighlighting(codeHighlight),
    blockMathField,
    previewPlugin,
    EditorView.atomicRanges.of((view) => view.plugin(previewPlugin)?.atomic ?? Decoration.none),
    EditorView.contentAttributes.of({
      "aria-label": "เนื้อหาเอกสาร (markdown)",
      spellcheck: "false",
    }),
    keymap.of([
      // markdownKeymap (Enter สืบ list · Backspace ลบ marker) มาก่อน defaultKeymap (docs/08 ข้อ 70)
      ...markdownKeymap,
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      {
        key: "Mod-s",
        preventDefault: true,
        run: (view) => {
          options.onSave?.(view.state.doc.toString())
          return true
        },
      },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange?.(update.state.doc.toString())
    }),
    EditorView.domEventHandlers({
      blur: () => {
        options.onBlur?.()
        return false
      },
      click: (event, view) => {
        const target = event.target as HTMLElement | null
        const checkbox = target?.closest?.(".cm-doku-checkbox-input")
        if (!checkbox) return false
        const marker = taskMarkerForWidget(view, checkbox)
        if (!marker) return false
        const source = view.state.doc.sliceString(marker.from, marker.to)
        const next = /\[[xX]\]/.test(source) ? "[ ]" : "[x]"
        view.dispatch({ changes: { from: marker.from, to: marker.to, insert: next } })
        return true
      },
    }),
  ]
  if (options.placeholder) extensions.push(placeholderExt(options.placeholder))
  if (options.slashItems && options.slashItems.length > 0) {
    extensions.push(slashCompletion(options.slashItems))
  }
  if (options.onDirective || options.onMark) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged && !update.focusChanged) return
        // รายงานตำแหน่ง directive จาก selection เสมอ แม้ focus จะอยู่นอก editor
        // (เช่น ผู้ใช้คลิกที่ block control strip) — การตัดสินซ่อน/โชว์เป็นหน้าที่ของ client
        // ห้ามกรองด้วย hasFocus: คลิกที่แผง = CM เสีย focus แต่カーยังอยู่ใน block เดิม
        // รายงาน mark ก่อน directive — client ให้ mark (ตัวเฉพาะจุดกว่า) ชนะเมื่อทั้งคู่ active
        options.onMark?.(markAtCursor(update.view))
        options.onDirective?.(directiveAtCursor(update.view))
      }),
    )
  }

  const anchor = typeof options.anchor === "number" ? options.anchor : null
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      extensions,
      ...(anchor !== null && anchor >= 0 && anchor <= options.doc.length
        ? { selection: EditorSelection.cursor(anchor) }
        : {}),
    }),
  })
  if (options.focus !== false) view.focus()

  return {
    getDoc: () => view.state.doc.toString(),
    setDoc: (text) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    },
    focus: () => view.focus(),
    blur: () => view.contentDOM.blur(),
    destroy: () => view.destroy(),
    scrollTo: (pos) => {
      const clamped = Math.max(0, Math.min(pos, view.state.doc.length))
      view.dispatch({ effects: EditorView.scrollIntoView(clamped, { y: "start" }) })
    },
    coordsAt: (pos) => {
      const coords = view.coordsAtPos(Math.max(0, Math.min(pos, view.state.doc.length)))
      return coords ? { top: coords.top, bottom: coords.bottom } : null
    },
    offsetAtCoords: (y) => {
      const rect = view.dom.getBoundingClientRect()
      const pos = view.posAtCoords({ x: rect.left + 8, y })
      return typeof pos === "number" ? pos : null
    },
    patchDirective: (patch) => {
      const info = directiveAtCursor(view)
      if (info) writeAttrs(view, info, patch)
    },
    patchMark: (color) => {
      const pos = view.state.selection.main.head
      const line = view.state.doc.lineAt(pos)
      DOKU_MARK.lastIndex = 0
      let match = DOKU_MARK.exec(line.text)
      while (match) {
        const start = line.from + match.index
        const end = start + match[0].length
        if (pos >= start && pos <= end) {
          const body = match[1] as string
          const next = color ? `==${body}=={.${color}}` : `==${body}==`
          // คงカーในช่วงข้อความ (clamp กันเลื่อนออกนอก mark เมื่อ suffix ยาวขึ้น/สั้นลง)
          const cursor = Math.min(Math.max(pos, start + 2), start + 2 + body.length)
          view.dispatch({
            changes: { from: start, to: end, insert: next },
            selection: EditorSelection.cursor(cursor),
          })
          return
        }
        match = DOKU_MARK.exec(line.text)
      }
    },
    removeDirective: () => {
      const info = directiveAtCursor(view)
      if (!info) return
      const doc = view.state.doc
      const openLine = doc.lineAt(info.lineFrom)
      const closing = new RegExp(`^:${info.fence.slice(1)}\\s*$`)
      let end = openLine.to
      for (let number = openLine.number + 1; number <= doc.lines; number += 1) {
        const line = doc.line(number)
        if (closing.test(line.text)) {
          end = line.to
          break
        }
        end = line.to
      }
      const after = doc.sliceString(end, Math.min(end + 1, doc.length)) === "\n" ? end + 1 : end
      view.dispatch({
        changes: { from: openLine.from, to: after, insert: "" },
        scrollIntoView: true,
      })
      view.focus()
    },
  }
}

declare global {
  interface Window {
    DokuEditor?: { create: typeof create }
  }
}

window.DokuEditor = { create }
