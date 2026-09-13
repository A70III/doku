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
import { history } from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { EditorSelection, EditorState, type Extension } from "@codemirror/state"
import { Decoration, EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view"
import { tags as t } from "@lezer/highlight"
import {
  type BlockHit,
  type BlockOp,
  blockSelectionField,
  blocksInView,
  hoverBlockField,
  replaceDocument,
  runBlockOp,
  selectedDecoField,
  setBlockSelection,
  setHighlight,
  toHit,
} from "./editor/block-layer.ts"
import {
  blockAt,
  blockAtCursor,
  blockText,
  computeBlocks,
  moveBlockTo,
  parseAttrs,
  type TurnInto,
  turnIntoBlock,
} from "./editor/blocks.ts"
import {
  blockMathField,
  type DecorationOptions,
  DOKU_MARK,
  insideCode,
  livePreview,
  rebuildPerf,
} from "./editor/decorations.ts"
import {
  alignPaste,
  type HtmlNode,
  htmlToMarkdown,
  type InlineMark,
  replaceEmoji,
  setHighlightColor,
} from "./editor/inline.ts"
import {
  applyTextEdit,
  type InlineSelection,
  selectionInfo,
  setLinkAt,
  toggleMarkAt,
} from "./editor/inline-layer.ts"
import { dokuKeymap } from "./editor/keymap.ts"

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
  /* ── block layer (Track C) ── */
  /** block ที่อยู่ใน viewport */
  blocks(): BlockHit[]
  /** block ที่พิกัดจอ (clientX/clientY) — ใช้กับ gutter/drag */
  blockAtPoint(x: number, y: number): BlockHit | null
  /** block ที่カーอยู่ */
  currentBlock(): BlockHit | null
  /** ไฮไลต์ block (null = เลิก) */
  highlight(from: number, to: number): void
  clearHighlight(): void
  /** เลือก/ยกเลิก block selection */
  selectBlock(from: number, to: number): void
  clearBlockSelection(): void
  selectedBlock(): { from: number; to: number } | null
  /** รัน operation ของ block — ระบุ range ได้ (เมนู/gutter ทำกับ block ที่ชี้อยู่ ไม่ใช่カー)
   *  คืน false = ไม่มีอะไรเปลี่ยน */
  runBlockOp(op: BlockOp, range?: { from: number; to: number } | null): boolean
  /** เปลี่ยนชนิด block ที่เลือก/カーอยู่ */
  turnInto(from: number, to: number, target: TurnInto): void
  /** ข้อความของ block (word count/menu) */
  textOfBlock(from: number, to: number): string
  /** แทรกข้อความที่ตำแหน่ง (เมนู `+`) */
  insertAt(pos: number, text: string): void
  /** ย้าย block ไปตำแหน่งที่ลากวาง (drag & drop) */
  moveBlockTo(from: number, to: number, targetPos: number, depth: number): void
  /** ลบ block ที่เลือก (Backspace) */
  deleteSelectedBlocks(): boolean
  /** แก้ attribute ของ directive ที่カーอยู่ (ค่าที่เขียนกลับเป็นข้อความ markdown) */
  patchDirective(patch: Record<string, string | null>): void
  /** ตั้ง/ลบสีของ `==mark==` ที่カーอยู่ในช่วง — null = ลบ `{.color}` (เขียนกลับเป็น markdown เสมอ) */
  patchMark(color: string | null): void
  /** ลบ directive block ที่カーอยู่ทั้ง block (รวม fence ปิด) */
  removeDirective(): void
  /* ── inline layer (Track D) ── */
  /** ข้อความที่เลือกอยู่ (null = ว่าง/เป็น block selection) — bubble toolbar */
  inlineSelection(): InlineSelection | null
  /** ครอบ/ถอด mark ที่ selection (bubble + `Mod+B/I/E`/`Mod+Shift+S`) */
  toggleMark(kind: InlineMark, color?: string | null): void
  /** ตั้งสีของ `==…==` ที่ selection (null = เอาเฉพาะ `{.color}` ออก) */
  setHighlight(color: string | null): void
  /** ใส่/แก้/ลบลิงก์ (`url` ว่าง = ถอดลิงก์เหลือข้อความ) */
  setLink(url: string): void
}

/** ข้อมูลของข้อความที่เลือก — client ใช้เปิด bubble toolbar (Track D) */
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
  /** `Mod-/` หรือ ⋮⋮ → Turn into — client เปิดเมนูที่พิกัดนี้ */
  onTurnInto?: (target: { from: number; to: number; x: number; y: number }) => void
  /** カーเข้า/ออก directive block — client ใช้โชว์ block control strip */
  onDirective?: (info: DirectiveInfo | null) => void
  /** カ์อยู่ใน `==mark==` หรือไม่ — client ใช้โชว์แถบ swatch สี (docs/08 ข้อ 55) */
  onMark?: (info: MarkInfo | null) => void
  /** มีข้อความถูกเลือก/カーในลิงก์ — client วาง bubble toolbar (null = ซ่อน) */
  onInlineSelection?: (info: InlineSelection | null) => void
  /** `Mod+K` → client เปิด popover แก้ URL ที่พิกัดนี้ (docs/09 §2.3) */
  onLink?: (info: InlineSelection) => void
  onChange?: (value: string) => void
  onSave?: (value: string) => void
  /** カーออกจาก editor (คลิกนอกกล่อง) — ให้ client ปิดโหมดเขียน */
  onBlur?: () => void
}

/** HTML ที่มี "โครงสร้าง" จริง → ค่อยแปลงเป็น markdown (ไม่ทับ paste ข้อความธรรมดา) */
const STRUCTURED_HTML = /<(h[1-6]|ul|ol|li|table|pre|blockquote|strong|b|em|i|a|img)\b/i

/** html จาก clipboard → markdown (allowlist เดียวกับ sanitize — ไม่มี HTML ดิบหลุดเข้า vault) */
export function htmlToMarkdownBrowser(html: string): string {
  return htmlToMarkdown(
    html,
    (source) =>
      // DOMParser ของเบราว์เซอร์ — รูปร่างตรงกับ HtmlNode (docs/06: parse แบบ inert)
      new DOMParser().parseFromString(source, "text/html") as unknown as HtmlNode,
  )
}

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
    ...(options.placeholder ? { placeholder: options.placeholder } : {}),
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
    hoverBlockField,
    blockSelectionField,
    selectedDecoField,
    previewPlugin,
    EditorView.atomicRanges.of((view) => view.plugin(previewPlugin)?.atomic ?? Decoration.none),
    EditorView.contentAttributes.of({
      "aria-label": "เนื้อหาเอกสาร (markdown)",
      spellcheck: "false",
    }),
    keymap.of(dokuKeymap(options)),
    // `:emoji:` — เขียนกลับเป็นอักขระจริงใน markdown (Track D · docs/09 §4)
    // IME guard: ห้ามแทรกแซงระหว่าง composition (docs/08 ข้อ 69)
    EditorView.inputHandler.of((view, from, to, text) => {
      if (view.composing || from !== to) return false
      if (text !== ":" && text !== " ") return false
      const doc = view.state.doc.toString()
      const trigger = text === ":" ? `${doc.slice(0, from)}:` : doc.slice(0, from)
      const hit = replaceEmoji(trigger, trigger.length)
      if (!hit) return false
      const insert = text === ":" ? hit.insert : `${hit.insert} `
      view.dispatch({
        changes: { from: hit.from, to: from, insert },
        selection: { anchor: hit.from + insert.length },
        userEvent: "input.emoji",
      })
      return true
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange?.(update.state.doc.toString())
    }),
    EditorView.domEventHandlers({
      // smart paste (Track D): HTML จากเว็บ → markdown ผ่าน inline.ts
      // ปล่อย paste ปกติ (plain text + markdown pasteURLAsLink) เมื่อไม่มี HTML/อยู่ในโค้ด
      paste: (event, view) => {
        const data = event.clipboardData
        if (!data) return false
        const html = data.getData("text/html")
        if (!html || !STRUCTURED_HTML.test(html)) return false
        const { from, to } = view.state.selection.main
        if (insideCode(view, from, to)) return false
        const md = htmlToMarkdownBrowser(html)
        if (!md) return false
        // カーอยู่กลางบรรทัด + paste เริ่ม block → ขึ้นบรรทัดใหม่ (ไม่งั้นโครงสร้างหาย)
        const line = view.state.doc.lineAt(from)
        const insert = alignPaste(line.text.slice(0, from - line.from), md)
        view.dispatch({
          changes: { from, to, insert },
          userEvent: "input.paste",
          scrollIntoView: true,
        })
        return true
      },
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

  if (options.onInlineSelection) {
    extensions.push(
      EditorView.updateListener.of((update) => {
        if (!update.selectionSet && !update.docChanged) return
        options.onInlineSelection?.(selectionInfo(update.view))
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
    blocks: () => blocksInView(view).map(toHit),
    blockAtPoint: (x, y) => {
      const pos = view.posAtCoords({ x, y })
      if (typeof pos !== "number") return null
      const blocks = blocksInView(view)
      const block = blockAt(blocks, pos) ?? blockAt(blocks, Math.max(0, pos - 1))
      return block ? toHit(block) : null
    },
    currentBlock: () => {
      const block = blockAtCursor(view.state, blocksInView(view))
      return block ? toHit(block) : null
    },
    highlight: (from, to) => {
      view.dispatch({ effects: setHighlight.of({ from, to }) })
    },
    clearHighlight: () => {
      view.dispatch({ effects: setHighlight.of(null) })
    },
    selectBlock: (from, to) => {
      view.dispatch({
        selection: EditorSelection.range(from, to),
        effects: setBlockSelection.of({ from, to }),
      })
    },
    clearBlockSelection: () => {
      view.dispatch({ effects: setBlockSelection.of(null) })
    },
    selectedBlock: () => view.state.field(blockSelectionField, false) ?? null,
    runBlockOp: (op, range) => runBlockOp(view, op, range ?? null),
    turnInto: (from, to, target) => {
      const blocks = computeBlocks(view.state, from, to)
      const block = blocks.find((item) => item.from === from && item.to === to) ?? blocks[0]
      if (!block) return
      const md = view.state.doc.toString()
      const next = turnIntoBlock(md, block, target)
      if (next === md) return
      replaceDocument(view, next, "doku.block.turnInto")
    },
    textOfBlock: (from, to) => {
      const blocks = computeBlocks(view.state, from, to)
      const block = blocks.find((item) => item.from === from) ?? blocks[0]
      return block ? blockText(view.state.doc.toString(), block) : ""
    },
    insertAt: (pos, template) => {
      const doc = view.state.doc
      const at = Math.max(0, Math.min(pos, doc.length))
      const line = doc.lineAt(at)
      const atLineStart = at === line.from
      const caretInTemplate = template.indexOf("|")
      const body = template.replace("|", "")
      let insert = body
      let offset = caretInTemplate === -1 ? body.length : caretInTemplate
      if (!insert.endsWith("\n")) insert += "\n"
      if (atLineStart) {
        // แทรก "ก่อน" block เป้าหมาย — เว้นบรรทัดให้อ่านออก (markdown block)
        const prevIsBlank = at === 0 || doc.lineAt(Math.max(0, at - 1)).text.trim() === ""
        if (!prevIsBlank) {
          insert = `\n${insert}`
          offset += 1
        }
        const nextLine = line.number < doc.lines ? doc.line(line.number + 1) : null
        if (nextLine && nextLine.text.trim() !== "") insert += "\n"
      }
      view.dispatch({
        changes: { from: at, insert },
        selection: EditorSelection.cursor(at + offset),
        scrollIntoView: true,
        userEvent: "doku.block.insert",
      })
      view.focus()
    },
    moveBlockTo: (from, to, targetPos, depth) => {
      const blocks = computeBlocks(view.state, Math.min(from, targetPos), to)
      const block = blocks.find((item) => item.from === from)
      if (!block) return
      const targetLine =
        view.state.doc.lineAt(Math.max(0, Math.min(targetPos, view.state.doc.length))).number - 1
      const md = view.state.doc.toString()
      const next = moveBlockTo(md, block, blocksInView(view), targetLine, depth)
      if (!next || next === md) return
      replaceDocument(view, next, "doku.block.dragMove")
      view.dispatch({ effects: [setBlockSelection.of(null), setHighlight.of(null)] })
    },
    deleteSelectedBlocks: () => {
      if (!view.state.field(blockSelectionField, false)) return false
      return runBlockOp(view, "delete")
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
    inlineSelection: () => selectionInfo(view),
    toggleMark: (kind, color) => {
      // bubble/ปุ่ม = โต้ตอบนอก CM → คืนโฟกัสให้พิมพ์ต่อได้ทันที (selection ยังอยู่)
      toggleMarkAt(view, kind, color ?? null)
      view.focus()
    },
    setHighlight: (color) => {
      const { from, to } = view.state.selection.main
      applyTextEdit(
        view,
        setHighlightColor(view.state.doc.toString(), from, to, color),
        "doku.inline.highlight",
      )
      view.focus()
    },
    setLink: (url) => {
      setLinkAt(view, url)
      view.focus()
    },
  }
}

declare global {
  interface Window {
    DokuEditor?: {
      create: typeof create
      /** สถิติ decoration rebuild (ms ต่อ update) — Track E perf budget */
      perf: { rebuilds: () => number[]; reset: () => void }
    }
  }
}

window.DokuEditor = {
  create,
  perf: {
    rebuilds: () => [...rebuildPerf.samples],
    reset: () => rebuildPerf.reset(),
  },
}
