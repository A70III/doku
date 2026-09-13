/**
 * Block model ของ editor (M3.2 Track C — docs/09 §3.2 · docs/08 ข้อ 64)
 *
 * - **block = line range** ไม่มี id ในไฟล์ · คำนวณสดจาก Lezer + fence scan ตัวเดียวกับ renderer
 * - ทุก operation ในไฟล์นี้เป็น "ฟังก์ชันบริสุทธิ์บนข้อความ" (md เข้า → md ออก) → เทสต์ได้ตรง ๆ
 *   และรับประกันว่าเขียนกลับเป็น markdown เสมอ (ไม่มี state ซ่อน)
 * - `computeBlocks(state, from, to)` รับช่วง (visible range) — ไม่เดินทั้งเอกสาร
 */

import { syntaxTree } from "@codemirror/language"
import type { EditorState } from "@codemirror/state"
import type { SyntaxNode } from "@lezer/common"

export type BlockKind =
  | "heading"
  | "paragraph"
  | "listItem"
  | "code"
  | "table"
  | "directive"
  | "hr"
  | "image"
  | "blockquote"

export interface BlockInfo {
  /** offset ต้นบรรทัดแรก */
  from: number
  /** offset ท้ายบรรทัดสุดท้าย */
  to: number
  kind: BlockKind
  /** ระดับการซ้อน (list indent / directive ผ่าน stack) */
  depth: number
  /** เลขบรรทัดแรก (1-based) */
  headLine: number
  /** จำนวน block ลูกโดยตรง */
  childCount: number
}

interface DirectiveBlock {
  name: string
  attrs: Record<string, string>
  openFrom: number
  openTo: number
  closeFrom: number | null
  closeTo: number | null
}

/** `:::` fence (มีชื่อ block) */
export const DIRECTIVE_OPEN = /^(:{3,})\s*([\w-]+)\s*(\{[^}]*\})?\s*$/
/** `:::` ปิด (ไม่มีชื่อ) */
export const DIRECTIVE_CLOSE = /^(:{3,})\s*$/
/** อ่าน attribute — รับ quoted, unquoted และ flag เปล่า (registry เขียนได้ทั้งแบบ) */
const ATTR_PAIR = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|([^\s}]+)))?/g

export function parseAttrs(raw: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {}
  if (!raw) return attrs
  ATTR_PAIR.lastIndex = 0
  let match = ATTR_PAIR.exec(raw)
  while (match) {
    attrs[match[1] as string] = match[2] !== undefined ? match[2] : (match[3] ?? "")
    match = ATTR_PAIR.exec(raw)
  }
  return attrs
}

/** attribute ที่ "ตั้งชื่อ" block — เรียงตามลำดับความหมาย (docs/08 ข้อ 79)
 * `note`/`card` ใช้ `title` · `progress`/`stat` ใช้ `label` · `figure` ใช้ `caption` */
export const DIRECTIVE_TITLE_ATTRS = ["title", "label", "caption"] as const

/** ข้อความที่โชว์บนหัว block ใน editor — ใช้ attribute ที่ผู้ใช้ตั้งเองตัวแรกที่มีค่า
 *
 * หัว block บอก "ก้อนนี้คืออะไร" จึงต้องมีข้อความของผู้ใช้ ไม่ใช่แค่ชื่อ block กลาง ๆ
 * (progress ที่ label="อาหารเป็นพิษ" ต้องไม่เห็นแค่ "แถบความคืบหน้า") — ค่าว่าง = ใช้ชื่อ block */
export function directiveTitle(attrs: Record<string, string> | undefined): string {
  if (!attrs) return ""
  for (const key of DIRECTIVE_TITLE_ATTRS) {
    const value = (attrs[key] ?? "").trim()
    if (value) return value
  }
  return ""
}

/** สแกน `:::` ในช่วงบรรทัด — stack ตามความยาว fence (ชั้นนอกต้องยาวกว่าชั้นใน — docs/08 ข้อ 24) */
export function scanDirectives(
  doc: EditorState["doc"],
  fromLine: number,
  toLine: number,
): DirectiveBlock[] {
  const blocks: DirectiveBlock[] = []
  const stack: Array<{
    name: string
    attrs: Record<string, string>
    fence: number
    openFrom: number
    openTo: number
  }> = []
  const last = Math.min(toLine, doc.lines)
  for (let n = Math.max(1, fromLine); n <= last; n += 1) {
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
  // block ที่ยังไม่ปิด (กำลังเขียน) — ยังต้องได้เป็น block
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

const LIST_NODES = new Set(["BulletList", "OrderedList"])
const HEADING_NODE = /^(?:ATX|Setext)Heading(\d)$/
/** ถอยหลังกี่บรรทัดเพื่อหาต้น `:::` ที่囲 visible range */
export const DIRECTIVE_LOOKBACK = 200

/** ความลึกของ list item จาก indent (2 เคาะ = 1 ชั้น) */
function listDepth(text: string): number {
  const match = /^(\s*)/.exec(text)
  const indent = match ? (match[1] as string).length : 0
  return Math.floor(indent / 2)
}

interface RawBlock extends BlockInfo {
  /** ช่วงบรรทัด (1-based, ปิด) */
  lastLine: number
}

function pushBlock(
  out: RawBlock[],
  doc: EditorState["doc"],
  from: number,
  to: number,
  kind: BlockKind,
  depth: number,
): void {
  out.push({
    from,
    to,
    kind,
    depth,
    headLine: doc.lineAt(from).number,
    lastLine: doc.lineAt(to).number,
    childCount: 0,
  })
}

/** block ลูกโดยตรง = block ที่อยู่ภายใน + depth มากกว่า 1 ชั้นพอดี (และไม่ใช่ตัวเอง) */
function countChildren(blocks: RawBlock[]): void {
  for (const block of blocks) {
    let count = 0
    for (const other of blocks) {
      if (other === block) continue
      if (other.from > block.from && other.to <= block.to && other.depth === block.depth + 1) {
        count += 1
      }
    }
    block.childCount = count
  }
}

/**
 * คำนวณ block ที่ intersect ช่วง [from, to] — เรียงตามตำแหน่ง, ไม่ซ้ำ, ไม่ซ้อนกันแบบทับหัว
 * (list item กับ list ถูกยุบเป็น listItem · เนื้อหาใน directive เป็นของ directive)
 */
export function computeBlocks(state: EditorState, from: number, to: number): BlockInfo[] {
  const doc = state.doc
  const out: RawBlock[] = []

  const firstLine = doc.lineAt(Math.max(0, Math.min(from, doc.length))).number
  const lastLine = doc.lineAt(Math.max(0, Math.min(to, doc.length))).number
  const directives = scanDirectives(doc, Math.max(1, firstLine - DIRECTIVE_LOOKBACK), lastLine)
  for (const directive of directives) {
    const depth = directives.filter((other) => {
      if (other === directive) return false
      if (other.openFrom >= directive.openFrom) return false
      return other.closeTo === null || other.closeTo > directive.openTo
    }).length
    const to2 = directive.closeTo ?? directive.openTo
    pushBlock(out, doc, directive.openFrom, to2, "directive", depth)
  }
  const inDirective = (pos: number): boolean =>
    directives.some((d) => d.openFrom <= pos && (d.closeTo === null || d.closeTo >= pos))

  const visit = (node: SyntaxNode, depth: number): void => {
    if (node.to < from || node.from > to) return
    if (inDirective(node.from)) return
    const name = node.name
    const heading = HEADING_NODE.exec(name)
    if (heading) {
      pushBlock(out, doc, node.from, node.to, "heading", depth)
      return
    }
    if (name === "Paragraph") {
      const onlyImage =
        node.firstChild !== null &&
        node.firstChild.name === "Image" &&
        node.firstChild.nextSibling === null
      pushBlock(out, doc, node.from, node.to, onlyImage ? "image" : "paragraph", depth)
      return
    }
    if (name === "FencedCode" || name === "CodeBlock") {
      pushBlock(out, doc, node.from, node.to, "code", depth)
      return
    }
    if (name === "Table") {
      pushBlock(out, doc, node.from, node.to, "table", depth)
      return
    }
    if (name === "HorizontalRule") {
      pushBlock(out, doc, node.from, node.to, "hr", depth)
      return
    }
    if (name === "Blockquote") {
      pushBlock(out, doc, node.from, node.to, "blockquote", depth)
      return
    }
    if (LIST_NODES.has(name)) {
      let item = node.firstChild
      while (item) {
        if (item.name === "ListItem") {
          // item = block หนึ่ง (範圍รวมลูก) · list ที่ซ้อนอยู่ใน item = block depth ถัดไป
          if (item.to >= from && item.from <= to) {
            pushBlock(
              out,
              doc,
              item.from,
              item.to,
              "listItem",
              listDepth(doc.lineAt(item.from).text),
            )
          }
          let inner = item.firstChild
          while (inner) {
            if (LIST_NODES.has(inner.name)) visit(inner, 0)
            inner = inner.nextSibling
          }
        }
        item = item.nextSibling
      }
      return
    }
    // อื่น ๆ (HTML block, text ตรง ๆ) — เดินเข้าไปข้างใน
    let child = node.firstChild
    while (child) {
      visit(child, depth)
      child = child.nextSibling
    }
  }

  let node: SyntaxNode | null = syntaxTree(state).topNode.firstChild
  while (node) {
    visit(node, 0)
    node = node.nextSibling
  }

  // ซ้ำ/ทับกัน (directive vs เนื้อหา, paragraph ใน list) — เก็บตัวที่範圍ไม่ถูกกลืน
  out.sort((a, b) => a.from - b.from || a.to - b.to)
  const kept: RawBlock[] = []
  for (const block of out) {
    const swallowed = kept.some(
      (other) => other.kind === "directive" && other.from <= block.from && other.to >= block.to,
    )
    if (swallowed) continue
    kept.push(block)
  }
  // list item ใน list เดียวกัน: paragraph ที่อยู่ "ใน" item ไม่ต้องเป็น block แยก
  const filtered = kept.filter((block, index) => {
    if (block.kind !== "paragraph") return true
    return !kept.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.kind === "listItem" &&
        other.from <= block.from &&
        other.to >= block.to,
    )
  })
  countChildren(filtered)
  return filtered.map(({ lastLine: _lastLine, ...rest }) => rest)
}

/* ── operations (pure: md → md) ─────────────────────────────────────────── */

export interface LineRange {
  /** index บรรทัดแรก (0-based) */
  start: number
  /** index บรรทัดสุดท้าย (0-based, ปิด) */
  end: number
}

/** แปลง BlockInfo → ช่วงบรรทัดในข้อความ */
export function blockLines(md: string, block: BlockInfo): LineRange {
  const lines = md.split("\n")
  let offset = 0
  let start = 0
  let end = 0
  for (let i = 0; i < lines.length; i += 1) {
    const lineStart = offset
    const lineEnd = offset + (lines[i] as string).length
    if (lineStart <= block.from) start = i
    if (lineEnd <= block.to) end = i
    offset = lineEnd + 1
  }
  return { start, end }
}

export function blockText(md: string, block: BlockInfo): string {
  const { start, end } = blockLines(md, block)
  return md
    .split("\n")
    .slice(start, end + 1)
    .join("\n")
}

/** block ที่ตำแหน่ง pos — ตัวที่แคบที่สุด (innermost) */
export function blockAt(blocks: readonly BlockInfo[], pos: number): BlockInfo | null {
  let best: BlockInfo | null = null
  for (const block of blocks) {
    if (block.from <= pos && block.to >= pos) {
      if (!best || block.to - block.from < best.to - best.from) best = block
    }
  }
  return best
}

/** block ที่カーอยู่ (จาก selection head) */
export function blockAtCursor(state: EditorState, blocks: readonly BlockInfo[]): BlockInfo | null {
  const pos = state.selection.main.head
  return blockAt(blocks, pos) ?? blockAt(blocks, Math.max(0, pos - 1))
}

export function hasMarker(md: string, block: BlockInfo, re: RegExp): boolean {
  return re.test(firstLine(blockText(md, block)))
}

function firstLine(text: string): string {
  const index = text.indexOf("\n")
  return index === -1 ? text : text.slice(0, index)
}

/** จำนวนบรรทัดทั้งหมดของ block */
function lineCount(md: string, block: BlockInfo): number {
  return blockLines(md, block).end - blockLines(md, block).start + 1
}

/** ย้าย block ขึ้น/ลง — ข้าม block ลูก (child ไปด้วยทั้งก้อน) */
export function moveBlock(
  md: string,
  block: BlockInfo,
  blocks: readonly BlockInfo[],
  direction: -1 | 1,
): string | null {
  const lines = md.split("\n")
  const { start, end } = blockLines(md, block)
  // ขยายไปถึงลูกที่ตามหลังติดกัน (depth มากกว่า) — ย้ายทั้งก้อน
  let last = end
  for (const other of blocks) {
    if (other.from <= block.to) continue
    if (other.depth <= block.depth) break
    const range = blockLines(md, other)
    if (range.start <= last + 1) last = Math.max(last, range.end)
  }
  const chunk = lines.slice(start, last + 1)

  if (direction < 0) {
    let target: number | null = null
    for (const other of blocks) {
      if (other.to >= block.from || other.depth > block.depth) continue
      const range = blockLines(md, other)
      if (range.start < start) target = range.start
    }
    if (target === null) return null
    lines.splice(start, chunk.length)
    lines.splice(target, 0, ...chunk)
    return lines.join("\n")
  }

  let nextStart: number | null = null
  let nextEnd: number | null = null
  for (const other of blocks) {
    if (other.from <= block.to || other.depth > block.depth) continue
    const range = blockLines(md, other)
    nextStart = range.start
    nextEnd = range.end
    break
  }
  if (nextStart === null || nextEnd === null) return null
  lines.splice(start, chunk.length)
  lines.splice(nextEnd + 1 - chunk.length, 0, ...chunk)
  return lines.join("\n")
}

/** ทำสำเนา block แล้วแทรกถัดจากของเดิม */
export function duplicateBlock(
  md: string,
  block: BlockInfo,
  blocks?: readonly BlockInfo[],
): string {
  const lines = md.split("\n")
  const { start, end } = blockLines(md, block)
  let last = end
  if (blocks) {
    for (const other of blocks) {
      if (other.from <= block.to) continue
      if (other.depth <= block.depth) break
      const range = blockLines(md, other)
      if (range.start <= last + 1) last = Math.max(last, range.end)
    }
  }
  const chunk = lines.slice(start, last + 1)
  lines.splice(last + 1, 0, ...chunk)
  return lines.join("\n")
}

/** ลบ block (พร้อมบรรทัดว่างที่เกินมาหนึ่งบรรทัด) */
export function deleteBlock(md: string, block: BlockInfo, blocks?: readonly BlockInfo[]): string {
  const lines = md.split("\n")
  const { start, end } = blockLines(md, block)
  let last = end
  if (blocks) {
    for (const other of blocks) {
      if (other.from <= block.to) continue
      if (other.depth <= block.depth) break
      const range = blockLines(md, other)
      if (range.start <= last + 1) last = Math.max(last, range.end)
    }
  }
  lines.splice(start, last - start + 1)
  // ถ้าหัว/ท้ายกลายเป็นบรรทัดว่างติดกัน — เก็บไว้หนึ่ง
  if (lines[start] === "" && lines[start - 1] === "") lines.splice(start, 1)
  return lines.join("\n")
}

const LIST_MARKER = /^(\s*)(?:[-*+]|\d+[.)])\s+/
const TASK_MARKER = /^(\s*)(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+/

/** เพิ่ม/ลด indent ของ block (list → เติม 2 เคาะ · ไม่ใช่ list → แปลงเป็น list ก่อน) */
export function indentBlock(md: string, block: BlockInfo): string {
  const lines = md.split("\n")
  const { start, end } = blockLines(md, block)
  if (!LIST_MARKER.test(lines[start] as string)) {
    lines[start] = `- ${lines[start]}`
  }
  for (let i = start; i <= end; i += 1) lines[i] = `  ${lines[i]}`
  return lines.join("\n")
}

export function outdentBlock(md: string, block: BlockInfo): string {
  const lines = md.split("\n")
  const { start, end } = blockLines(md, block)
  let changed = false
  for (let i = start; i <= end; i += 1) {
    const line = lines[i] as string
    if (line.startsWith("  ")) {
      lines[i] = line.slice(2)
      changed = true
    } else if (i === start && LIST_MARKER.test(line)) {
      // depth 0 → ถอด marker ออก กลายเป็นย่อหน้า (ตาม Notion)
      lines[i] = line.replace(LIST_MARKER, "$1")
      changed = true
    }
  }
  return changed ? lines.join("\n") : md
}

export type TurnInto = "paragraph" | "h1" | "h2" | "h3" | "list" | "todo" | "quote" | "code"

/** เปลี่ยนชนิด block — ตัด marker เดิมก่อน แล้วใส่ marker ใหม่ (เขียนกลับ markdown เสมอ) */
export function turnIntoBlock(md: string, block: BlockInfo, target: TurnInto): string {
  const lines = md.split("\n")
  const { start, end } = blockLines(md, block)
  const strip = (line: string): string =>
    line
      .replace(TASK_MARKER, "$1")
      .replace(LIST_MARKER, "$1")
      .replace(/^(\s*)>\s?/, "$1")
      .replace(/^\s*#{1,6}\s+/, "")

  for (let i = start; i <= end; i += 1) lines[i] = strip(lines[i] as string)

  const prefix =
    target === "h1"
      ? "# "
      : target === "h2"
        ? "## "
        : target === "h3"
          ? "### "
          : target === "list"
            ? "- "
            : target === "todo"
              ? "- [ ] "
              : target === "quote"
                ? "> "
                : ""
  if (target === "code") {
    lines.splice(start, 0, "```")
    lines.splice(end + 2, 0, "```")
    return lines.join("\n")
  }
  lines[start] = prefix + (lines[start] as string)
  if (target === "paragraph" || target === "quote") {
    // blockquote ต่อเนื่อง: เติม `>` ทุกบรรทัด
    if (target === "quote") {
      for (let i = start + 1; i <= end; i += 1) {
        if ((lines[i] as string).trim() !== "") lines[i] = `> ${lines[i]}`
      }
    }
  }
  return lines.join("\n")
}

/** จำนวนคำใน block (สำหรับเมนู) */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/u).filter(Boolean).length
}

/** แทนข้อความบรรทัดที่กำหนด — helper ให้ caller ที่มี view dispatcher */
export function blockLineCount(md: string, block: BlockInfo): number {
  return lineCount(md, block)
}

/** ย้าย block ไปตำแหน่งที่ลากวาง — `targetLine` = index บรรทัด (0-based) ที่จะแทรกก่อน
 *  `depth` = ระดับการซ้อนที่เลือกจากตำแหน่งแนวนอน (list เท่านั้น) */
export function moveBlockTo(
  md: string,
  block: BlockInfo,
  blocks: readonly BlockInfo[],
  targetLine: number,
  depth: number,
): string | null {
  const lines = md.split("\n")
  const { start, end } = blockLines(md, block)
  let last = end
  for (const other of blocks) {
    if (other.from <= block.to) continue
    if (other.depth <= block.depth) break
    const range = blockLines(md, other)
    if (range.start <= last + 1) last = Math.max(last, range.end)
  }
  if (targetLine >= start && targetLine <= last + 1) return null
  const chunk = lines.slice(start, last + 1)
  const isList = chunk.some((line) => LIST_MARKER.test(line))
  const shifted = isList
    ? chunk.map((line) => {
        const stripped = line.replace(/^\s*/, "")
        if (stripped.trim() === "") return stripped
        return "  ".repeat(Math.max(0, depth)) + stripped
      })
    : chunk
  lines.splice(start, chunk.length)
  const insertAt = targetLine > last ? targetLine - chunk.length : targetLine
  lines.splice(Math.max(0, Math.min(insertAt, lines.length)), 0, ...shifted)
  return lines.join("\n")
}
