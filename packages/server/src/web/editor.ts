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
import { markdown } from "@codemirror/lang-markdown"
import { syntaxTree } from "@codemirror/language"
import { EditorSelection, EditorState, type Extension } from "@codemirror/state"
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

export interface DokuEditorHandle {
  getDoc(): string
  setDoc(text: string): void
  focus(): void
  destroy(): void
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
  /** แปลง path ใน markdown เป็น URL ของ asset จริง (client รู้ doc path) */
  resolveAsset?: (src: string) => string
  /** รายการของ slash menu — client ประกอบจาก /api/schema + markdown พื้นฐาน */
  slashItems?: SlashItem[]
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

/* ── decoration ─────────────────────────────────────────────────────────── */

const HEADING_LINE = /^ATXHeading(\d)$/
const HIDE_MARKS = new Set(["EmphasisMark", "CodeMark", "StrikethroughMark"])
/** marker ที่ซ่อนได้เมื่อカーออกจาก node — `HeaderMark`/`LinkMark` จัดการแยก */
const LINK_MARKS = new Set(["LinkMark"])

const lineDeco = (cls: string) => Decoration.line({ class: cls })
const markDeco = (cls: string) => Decoration.mark({ class: cls })
const hide = () => Decoration.replace({})

const DOKU_FENCE = /^(:{3,})\s*([\w-]*)\s*(\{[^}]*\})?\s*$/
/** จับ suffix `{.color}` ด้วย — カーอยู่นอกช่วงต้องซ่อนทั้ง `==` และ suffix (docs/08 ข้อ 52) */
const DOKU_MARK = /==([^=\n]+?)==(\{\.[\w-]+\})?/g

/** ซ่อน marker + ใส่คลาสระดับบรรทัด — เฉพาะช่วงที่มองเห็น (ไม่เดินทั้งเอกสาร) */
function buildDecorations(view: EditorView, resolveAsset: (src: string) => string): DecorationSet {
  const ranges: Array<{ from: number; to: number; value: Decoration }> = []
  const doc = view.state.doc
  const selection = view.state.selection
  const touching = (from: number, to: number): boolean =>
    selection.ranges.some((range) => range.from <= to + 1 && range.to >= from - 1)

  for (const visible of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from: visible.from,
      to: visible.to,
      enter: (node) => {
        const name = node.name
        const heading = HEADING_LINE.exec(name)
        if (heading) {
          // decoration ระดับบรรทัดใช้ offset ต้นบรรทัด
          ranges.push({
            from: doc.lineAt(node.from).from,
            to: doc.lineAt(node.from).from,
            value: lineDeco(`cm-doku-h${heading[1]}`),
          })
          return
        }
        if (name === "Blockquote") {
          let pos = doc.lineAt(node.from).from
          const end = doc.lineAt(Math.min(node.to, doc.length)).from
          while (pos <= end) {
            ranges.push({ from: pos, to: pos, value: lineDeco("cm-doku-quote") })
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
            ranges.push({ from: pos, to: pos, value: lineDeco(cls) })
            pos = pos + doc.lineAt(pos).length + 1
            if (pos > doc.length) break
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
              widget: new ImageWidget(match[2] as string, match[1] as string, resolveAsset),
            }),
          })
          return
        }
        if (name === "HeaderMark") {
          if (touching(node.from, node.to)) return
          const after = doc.sliceString(node.to, node.to + 1)
          ranges.push({
            from: node.from,
            to: after === " " ? node.to + 1 : node.to,
            value: hide(),
          })
          return
        }
        if (HIDE_MARKS.has(name) || LINK_MARKS.has(name)) {
          if (touching(node.from, node.to)) return
          ranges.push({ from: node.from, to: node.to, value: hide() })
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
        }
      },
    })
  }

  // doku extensions ที่ Lezer ไม่รู้จัก (`:::` fence, `==mark==`) — สแกนเป็นบรรทัด
  for (const visible of view.visibleRanges) {
    let line = doc.lineAt(visible.from)
    while (line.from <= visible.to) {
      const text = line.text
      const fence = DOKU_FENCE.exec(text)
      if (fence) {
        ranges.push({ from: line.from, to: line.from, value: lineDeco("cm-doku-fence") })
      }
      DOKU_MARK.lastIndex = 0
      let match = DOKU_MARK.exec(text)
      while (match) {
        const start = line.from + match.index
        const end = start + match[0].length
        const color = match[2] ? match[2].slice(2, -1) : ""
        // Decoration.mark แนบ data-color → CSS อ่าน --dk-mapped-bg ตาม {.color} (ผิวเดียวกับหน้าอ่าน)
        const deco = Decoration.mark({
          class: "cm-doku-mark",
          ...(color ? { attributes: { "data-color": color } } : {}),
        })
        ranges.push({ from: start, to: end, value: deco })
        if (!touching(start, end)) {
          ranges.push({ from: start, to: start + 2, value: hide() })
          ranges.push({ from: end - 2, to: end, value: hide() })
          // ซ่อน `{.color}` ท้ายช่วงด้วย — ไม่งั้นผู้ใช้เห็นข้อความดิบค้าง (docs/08 ข้อ 52)
          if (match[2]) ranges.push({ from: end - match[2].length, to: end, value: hide() })
        }
        match = DOKU_MARK.exec(text)
      }
      if (line.to >= doc.length) break
      line = doc.lineAt(line.to + 1)
    }
  }

  return Decoration.set(
    ranges.map((range) => range.value.range(range.from, range.to)),
    true,
  )
}

/** resolver ของ asset ส่งผ่าน closure ตอนสร้าง plugin — widget ต้องใช้ตอนคำนวณ decoration ครั้งแรก */
const livePreview = (resolveAsset: (src: string) => string) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, resolveAsset)
      }
      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view, resolveAsset)
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
  /** กรองเอง (ไทย/อังกฤษ) แล้วส่ง `filter: false` — CM6 กรองด้วย label ASCII ไม่โดนคำไทย */
  const matchItem = (item: SlashItem, query: string): boolean => {
    if (!query) return true
    const needle = query.toLowerCase()
    return (
      item.keyword.toLowerCase().startsWith(needle) || item.label.toLowerCase().includes(needle)
    )
  }

  const source = (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos)
    const before = line.text.slice(0, context.pos - line.from)
    // `/` ที่ต้นบรรทัด (หรือหลังช่องว่าง) แล้วพิมพ์ต่อด้วยตัวอักษร (รวมไทย) หรือขีด
    const match = /(^|\s)\/([\p{L}\p{N}_-]*)$/u.exec(before)
    if (!match) return null
    const query = match[2] as string
    const start = context.pos - query.length - 1
    // ต้องไม่ใช่ URL (https://) หรือส่วนของ path
    if (start > line.from) {
      const prev = line.text[start - line.from - 1]
      if (prev && /[\w:/.-]/.test(prev)) return null
    }
    const options: Completion[] = items
      .filter((item) => matchItem(item, query))
      .map((item) => ({
        label: item.keyword,
        displayLabel: item.label,
        detail: item.detail,
        type: "keyword",
        apply: (view, _completion, from, to) => applyTemplate(view, item, from, to),
      }))
    if (options.length === 0) return null
    return {
      from: start,
      options,
      filter: false,
      validFor: /^\/[\p{L}\p{N}_-]*$/u,
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
const ATTR_PAIR = /([\w-]+)\s*=\s*"([^"]*)"/g

function parseAttrs(raw: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {}
  if (!raw) return attrs
  ATTR_PAIR.lastIndex = 0
  let match = ATTR_PAIR.exec(raw)
  while (match) {
    attrs[match[1] as string] = match[2] as string
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

/* ── create ─────────────────────────────────────────────────────────────── */

function create(parent: HTMLElement, options: DokuEditorOptions): DokuEditorHandle {
  const resolveAsset = options.resolveAsset ?? ((src: string) => src)
  const extensions: Extension[] = [
    history(),
    markdown(),
    EditorView.lineWrapping,
    theme,
    livePreview(resolveAsset),
    keymap.of([
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
  view.focus()

  return {
    getDoc: () => view.state.doc.toString(),
    setDoc: (text) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
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
