/**
 * decoration layer ของ editor (M3.2 Track E — แยกจาก `editor.ts`)
 *
 * ประกอบด้วย: widget ทุกตัว (read-parity + Track E) · ตัวสร้าง decoration (`buildDecorations`)
 * · block math StateField (incremental) · ViewPlugin `livePreview` · ตัวนับ perf
 *
 * ข้อกำหนดที่ห้ามละเมิด:
 * - decoration ของ **plugin** ห้ามเป็น block replace / ห้ามคร่อม line break (CM6 throw) — docs/08 ข้อ 69
 * - ระหว่าง IME composition ห้ามสร้าง replace ใหม่ แต่ **ต้อง map set ตาม change** เสมอ
 * - คำนวณเฉพาะ `view.visibleRanges` (perf budget — docs/09 §5 Track E)
 */

import { syntaxTree } from "@codemirror/language"
import { type EditorSelection, StateField, type Text, type Transaction } from "@codemirror/state"
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import type { SyntaxNode } from "@lezer/common"
import katex from "katex"
import {
  blockAtCursor,
  computeBlocks,
  DIRECTIVE_CLOSE,
  DIRECTIVE_LOOKBACK,
  DIRECTIVE_OPEN,
  parseAttrs,
  scanDirectives,
} from "./blocks.ts"

/* ── perf: ต้นทุน decoration ต่อ update (M3.2 Track E) ───────────────────────
   วัด 2 ส่วนที่โตตามเอกสาร: plugin `buildDecorations` (visible-only) และ state field
   block math (incremental) — เก็บเป็นตัวอย่างตัวเลขเท่านั้น ไม่ log ไม่ throw
   ใช้โดย `bun run shot --perf` และเทสต์ perf (docs/09 §5 Track E: budget ≤ 8ms/keystroke) */
export const rebuildPerf = {
  samples: [] as number[],
  /** ต้นทุนของ state field ที่เพิ่งอัปเดต — field อัปเดต "ก่อน" plugin ทุกครั้ง */
  fieldMs: 0,
  record(ms: number): void {
    if (this.samples.length >= 300) this.samples.splice(0, this.samples.length - 300)
    this.samples.push(ms)
  },
  reset(): void {
    this.samples.length = 0
    this.fieldMs = 0
  },
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

/** จับ suffix `{.color}` ด้วย — カーอยู่นอกช่วงต้องซ่อนทั้ง `==` และ suffix (docs/08 ข้อ 52) */
export const DOKU_MARK = /==([^=\n]+?)==(\{\.[\w-]+\})?/g
/** inline directive `:badge[…]` / `:mark[…]` (registry kind = text) */
const INLINE_DIRECTIVE = /:([\w-]+)\[([^\]]*)\](\{[^}]*\})?/g
/** inline math `$…$` — ไม่รับช่องว่างหัว/ท้าย (ตาม remark-math) */
const INLINE_MATH = /(?<![\\$])\$([^\s$][^$\n]*?[^\s$]|[^\s$])\$(?!\$)/g

export interface DecorationOptions {
  resolveAsset: (src: string) => string
  /** ป้ายชื่อ block ไทย (จาก client BLOCK_LABELS) */
  blockLabels: Record<string, string>
  /** ชื่อ callout variant (schema.variants) — เลือกสีพื้นตามชนิด */
  calloutTypes: readonly string[]
  inlineBlocks: readonly string[]
  /** ข้อความ hint เมื่อเอกสาร/บรรทัดว่าง (Track E) — ไม่ส่ง = ไม่โชว์ hint */
  placeholder?: string
}

/** ตำแหน่งนี้อยู่ในโค้ดหรือไม่ (ห้าม decorate `:badge[…]` ใน code span/fence) */
export function insideCode(view: EditorView, from: number, to: number): boolean {
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

  // ── focus line / active block (Track E — docs/09 §5) ───────────────────
  // cue เดียวว่า “カーอยู่ block ไหน” — ขีด accent บางๆ ด้านซ้ายของ block ที่カーอยู่
  // (block selection มีพื้นของตัวเองอยู่แล้ว → ไม่วาดซ้ำ) · ใช้ block model ตรงกับ
  // gutter/keymap (docs/08 ข้อ 64) — คำนวณเฉพาะ visible range
  // block selection มีพื้นของตัวเอง — CSS ซ่อนขีดนี้เมื่อบรรทัดมี .cm-doku-block-selected
  if (focused) {
    const visFrom = view.visibleRanges[0]?.from ?? 0
    const lastVisible = view.visibleRanges[view.visibleRanges.length - 1]
    const visTo = lastVisible?.to ?? doc.length
    const active = blockAtCursor(
      view.state,
      computeBlocks(view.state, Math.max(0, visFrom - DIRECTIVE_LOOKBACK), visTo),
    )
    if (active) {
      let pos = doc.lineAt(active.from).from
      const end = doc.lineAt(Math.min(active.to, doc.length)).from
      while (pos <= end) {
        const line = doc.lineAt(pos)
        lineClass(line, "cm-doku-block-active")
        pos = line.to + 1
        if (pos > doc.length) break
      }
    }
  }

  // บรรทัดว่างตรงカー → hint ว่าพิมพ์ `/` ได้ (ไม่ทับ placeholder ของเอกสารว่าง)
  if (focused && selection.main.empty && doc.length > 0 && options.placeholder) {
    const line = doc.lineAt(selection.main.head)
    if (line.text.trim() === "" && !insideCode(view, line.from, line.to)) {
      ranges.push({
        from: line.from,
        to: line.from,
        value: Decoration.widget({
          widget: new EmptyLineWidget(options.placeholder),
          side: -1,
        }),
      })
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
/** ช่วงของ `$$…$$` (block math) — เก็บไว้ใน field เพื่อไม่ต้องสแกนทั้งเอกสารทุก keystroke */
interface MathBlock {
  /** ต้น `$$` เปิด */
  from: number
  /** จบ `$$` ปิด */
  to: number
  /** ช่วง LaTeX ระหว่าง delimiter */
  latexFrom: number
  latexTo: number
}

/** สแกน `$$` fence ทั้งเอกสาร — เรียกเฉพาะตอนที่การแก้ "อาจ" เปลี่ยนคู่ fence (Track E: incremental)
 *  ต้องเป็น StateField (ไม่ใช่ plugin) เพราะ CM6 ห้าม plugin สร้าง block decoration */
function scanBlockMath(doc: Text): MathBlock[] {
  const blocks: MathBlock[] = []
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
    blocks.push({
      from: open.from,
      latexFrom: open.latexFrom,
      latexTo: line.from + index,
      to: line.from + index + 2,
    })
    open = null
  }
  return blocks
}

/** decoration ของ block math จากช่วงที่ cache ไว้ — O(จำนวน block) ไม่ใช่ O(บรรทัด)
 *  カーแตะ block ใด → ปล่อย raw (แก้ LaTeX ได้) */
function mathDecorations(
  doc: Text,
  selection: EditorSelection,
  blocks: readonly MathBlock[],
): DecorationSet {
  const ranges: Array<{ from: number; to: number; value: Decoration }> = []
  for (const block of blocks) {
    const touched = selection.ranges.some(
      (range) => range.from <= block.to + 1 && range.to >= block.from - 1,
    )
    if (touched) continue
    const startLine = doc.lineAt(Math.min(block.from, doc.length))
    const endLine = doc.lineAt(Math.min(block.to, doc.length))
    const latex = doc.sliceString(
      Math.min(block.latexFrom, doc.length),
      Math.min(block.latexTo, doc.length),
    )
    ranges.push({
      from: startLine.from,
      to: endLine.to,
      value: Decoration.replace({ widget: new MathWidget(latex.trim(), true), block: true }),
    })
  }
  return Decoration.set(
    ranges.map((range) => range.value.range(range.from, range.to)),
    true,
  )
}

export interface MathFieldValue {
  blocks: MathBlock[]
  decos: DecorationSet
}

/** StateField: block math — incremental (Track E perf budget)
 *  · การแก้ที่ไม่แตะ block math เลย → map ตำแหน่งเดิม (ไม่สแกนทั้งเอกสาร)
 *  · เปลี่ยนカー → คำนวณ decoration ใหม่จากช่วงที่ cache (O(#block)) */
export const blockMathField = StateField.define<MathFieldValue>({
  create: (state) => {
    const blocks = scanBlockMath(state.doc)
    return { blocks, decos: mathDecorations(state.doc, state.selection, blocks) }
  },
  update(value, tr) {
    if (!tr.docChanged && !tr.selection) return value
    const started = performance.now()
    const next = updateBlockMath(value, tr)
    rebuildPerf.fieldMs += performance.now() - started
    return next
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decos),
})

function updateBlockMath(value: MathFieldValue, tr: Transaction): MathFieldValue {
  {
    if (!tr.docChanged) {
      return {
        blocks: value.blocks,
        decos: mathDecorations(tr.state.doc, tr.state.selection, value.blocks),
      }
    }
    // doc เปลี่ยน: สแกนใหม่เฉพาะเมื่อ "อาจ" เกิด/หายคู่ fence
    let rescan = false
    tr.changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
      if (rescan) return
      // พิมพ์/วาง `$$` เข้ามา → อาจเป็น fence ใหม่
      if (inserted.toString().includes("$$")) {
        rescan = true
        return
      }
      // แตะช่วงของ block ที่ cache ไว้ (รวมหัว/ท้าย 1 ตัว) → คู่ fence อาจเปลี่ยน
      if (value.blocks.some((block) => fromA <= block.to + 1 && toA >= block.from - 1)) {
        rescan = true
        return
      }
      // บรรทัดที่แก้ (หรือบรรทัดบน/ล่าง) กลายเป็น fence เปิดใหม่หรือเปล่า
      const pos = Math.max(0, Math.min(fromB, tr.state.doc.length))
      const line = tr.state.doc.lineAt(pos)
      if (line.text.trim().startsWith("$$")) {
        rescan = true
        return
      }
      const prev = line.number > 1 ? tr.state.doc.line(line.number - 1) : null
      if (prev?.text.trim().startsWith("$$")) rescan = true
    })
    if (rescan) {
      const blocks = scanBlockMath(tr.state.doc)
      return { blocks, decos: mathDecorations(tr.state.doc, tr.state.selection, blocks) }
    }
    const mapPos = (pos: number, assoc: number) => tr.changes.mapPos(pos, assoc)
    const blocks = value.blocks.map((block) => ({
      from: mapPos(block.from, 1),
      to: mapPos(block.to, -1),
      latexFrom: mapPos(block.latexFrom, 1),
      latexTo: mapPos(block.latexTo, -1),
    }))
    return { blocks, decos: mathDecorations(tr.state.doc, tr.state.selection, blocks) }
  }
}

/** บรรทัดว่างตรงカー → คำใบ้ว่าพิมพ์ `/` ได้ (Track E) — widget ไม่เข้าเอกสาร (aria-hidden)
 *  ข้ามเมื่อเอกสารว่างทั้งหมด (ให้ placeholder ของ CM แสดงคู่ความนั้น) และข้ามในโค้ด */
class EmptyLineWidget extends WidgetType {
  readonly #label: string

  constructor(label: string) {
    super()
    this.#label = label
  }

  override eq(other: EmptyLineWidget): boolean {
    return other.#label === this.#label
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span")
    span.className = "cm-doku-empty-hint"
    span.setAttribute("aria-hidden", "true")
    span.textContent = this.#label
    return span
  }

  override ignoreEvent(): boolean {
    return true
  }
}

/** resolver ของ asset ส่งผ่าน closure ตอนสร้าง plugin — widget ต้องใช้ตอนคำนวณ decoration ครั้งแรก */
export const livePreview = (options: DecorationOptions) =>
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
        // composition guard (docs/08 ข้อ 69): ห้าม "สร้าง replace ใหม่" ระหว่าง IME ทำงาน
        // (ไทย/จีน/ญี่ปุ่น) — แต่ตำแหน่งของ set ที่ค้างอยู่ต้อง map ตาม change เสมอ
        // ไม่งั้น range เก่าอาจไปคร่อม line break หลังข้อความขยับ → CM throw
        // "Decorations that replace line breaks may not be specified via plugins"
        if (update.view.composing) {
          if (update.docChanged) {
            this.decorations = this.decorations.map(update.changes)
            this.atomic = this.atomic.map(update.changes)
          }
          return
        }
        if (
          update.docChanged ||
          update.viewportChanged ||
          update.selectionSet ||
          update.focusChanged
        ) {
          const started = performance.now()
          const built = buildDecorations(update.view, options)
          // ต้นทุนต่อ keystroke = plugin + state field ที่อัปเดตใน transaction เดียวกัน
          rebuildPerf.record(performance.now() - started + rebuildPerf.fieldMs)
          rebuildPerf.fieldMs = 0
          this.decorations = built.decorations
          this.atomic = built.atomic
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )
