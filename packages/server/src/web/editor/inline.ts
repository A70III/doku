/**
 * Inline layer (M3.2 Track D — docs/09 §5 Track D)
 *
 * ฟังก์ชันบริสุทธิ์บนข้อความ: ครอบ/ถอด markdown marker ของข้อความที่เลือก · แปลง HTML
 * ที่ paste จากเว็บเป็น markdown (sanitize allowlist เดิม — ไม่มี HTML ดิบหลุดเข้า vault)
 * · `:emoji:` — ทั้งหมดเขียนกลับเป็น markdown เสมอ
 */

export type InlineMark = "bold" | "italic" | "strike" | "code" | "highlight"

export interface TextEdit {
  text: string
  /** ช่วง selection ใหม่ (offset ในข้อความผลลัพธ์) */
  from: number
  to: number
  changed: boolean
}

const MARKERS: Record<InlineMark, { open: string; close: string }> = {
  bold: { open: "**", close: "**" },
  italic: { open: "*", close: "*" },
  strike: { open: "~~", close: "~~" },
  code: { open: "`", close: "`" },
  highlight: { open: "==", close: "==" },
}

/** regex ของ "ช่วงที่ถูกครอบ" ต่อ kind — group 1 = เนื้อใน (Track D)
 *  · ใช้หา region จริงในข้อความ ไม่เดาจาก marker ที่ติดกับ selection เท่านั้น
 *    (カーอยู่กลาง `**หนา มาก**` แล้วกด Mod+B ต้องถอดได้ทั้งช่วง)
 *  · lookbehind/lookahead กัน `*` ของ italic ไปกิน `**` ของ bold */
const REGIONS: Record<InlineMark, RegExp> = {
  bold: /\*\*([^*\n]+)\*\*/g,
  italic: /(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)/g,
  strike: /~~([^~\n]+)~~/g,
  code: /`([^`\n]+)`/g,
  highlight: /==([^=\n]+)==(\{\.[\w-]+\})?/g,
}

interface Region {
  /** จุดเริ่ม marker เปิด */
  start: number
  /** เนื้อใน (ไม่รวม marker) */
  innerFrom: number
  innerTo: number
  /** จุดจบ marker ปิด (+ suffix `{.color}` ของ highlight) */
  end: number
}

/** ช่วงที่ครอบ selection อยู่ — เลือกในเนื้อ หรือเลือกทั้งก้อนรวม marker */
function findRegion(text: string, from: number, to: number, kind: InlineMark): Region | null {
  const { open } = MARKERS[kind]
  const pattern = new RegExp(REGIONS[kind].source, REGIONS[kind].flags)
  let match = pattern.exec(text)
  while (match) {
    const start = match.index
    const innerFrom = start + open.length
    const innerTo = innerFrom + (match[1] as string).length
    const end = start + match[0].length
    const inside = from >= innerFrom && to <= innerTo
    const exact = from === start && to === end
    if (inside || exact) return { start, innerFrom, innerTo, end }
    match = pattern.exec(text)
  }
  return null
}

/** ครอบ/ถอด marker ของ markdown (กดซ้ำ = ถอดออก — เหมือน Notion) */
export function toggleInlineMark(
  text: string,
  from: number,
  to: number,
  kind: InlineMark,
  color?: string | null,
): TextEdit {
  const { open, close } = MARKERS[kind]
  const suffix = kind === "highlight" && color ? `{.${color}}` : ""
  const existing = findRegion(text, from, to, kind)

  if (existing) {
    // ถอด marker (+ suffix `{.color}` ของ highlight — อยู่ในช่วง region แล้ว)
    const selected = text.slice(existing.innerFrom, existing.innerTo)
    const next = text.slice(0, existing.start) + selected + text.slice(existing.end)
    return { text: next, from: existing.start, to: existing.start + selected.length, changed: true }
  }

  const selected = text.slice(from, to)
  if (selected.length === 0) {
    // カーว่าง → ใส่ marker แล้ววางカーใน (ผู้ใช้พิมพ์ต่อได้ทันที)
    const next = text.slice(0, from) + open + close + suffix + text.slice(to)
    return { text: next, from: from + open.length, to: from + open.length, changed: true }
  }

  const insert = open + selected + close + suffix
  const next = text.slice(0, from) + insert + text.slice(to)
  return {
    text: next,
    from: from + open.length,
    to: from + open.length + selected.length,
    changed: true,
  }
}

/** ตั้งสีของ `==…==` ที่ selection — มี highlight อยู่แล้ว = เปลี่ยนสี (ไม่ถอด)
 *  `color = null` = เอาเฉพาะ `{.color}` ออก คง `==…==` ไว้ (ต่างจาก toggle ที่ถอดทั้ง marker) */
export function setHighlightColor(
  text: string,
  from: number,
  to: number,
  color: string | null,
): TextEdit {
  const suffix = color ? `{.${color}}` : ""
  const region = findRegion(text, from, to, "highlight")
  if (region) {
    const inner = text.slice(region.innerFrom, region.innerTo)
    const next = `${text.slice(0, region.start)}==${inner}==${suffix}${text.slice(region.end)}`
    return {
      text: next,
      from: region.innerFrom,
      to: region.innerFrom + inner.length,
      changed: next !== text,
    }
  }
  const selected = text.slice(from, to)
  const next = `${text.slice(0, from)}==${selected}==${suffix}${text.slice(to)}`
  return { text: next, from: from + 2, to: from + 2 + selected.length, changed: true }
}

/** mark ที่ selection อยู่ "ในช่วงของมัน" — ใช้ตั้ง aria-pressed ของ bubble toolbar */
export function detectMarks(text: string, from: number, to: number): InlineMark[] {
  const out: InlineMark[] = []
  for (const kind of Object.keys(MARKERS) as InlineMark[]) {
    if (findRegion(text, from, to, kind)) out.push(kind)
  }
  return out
}

/** diff ที่เล็กที่สุดของ (before → after) สำหรับ dispatch ของ CodeMirror
 *  — change เล็ก = undo ละเอียด + カーไม่กระโดด (docs/09 §5 Track C3) */
export function minimalChange(
  before: string,
  after: string,
): { from: number; to: number; insert: string } | null {
  if (before === after) return null
  const max = Math.min(before.length, after.length)
  let prefix = 0
  while (prefix < max && before.charAt(prefix) === after.charAt(prefix)) prefix += 1
  let suffix = 0
  while (
    suffix < max - prefix &&
    before.charAt(before.length - 1 - suffix) === after.charAt(after.length - 1 - suffix)
  ) {
    suffix += 1
  }
  return {
    from: prefix,
    to: before.length - suffix,
    insert: after.slice(prefix, after.length - suffix),
  }
}

/** หา URL/markdown link ที่カー/selection อยู่ (สำหรับ popover) */
export function linkAt(
  text: string,
  pos: number,
): { from: number; to: number; label: string; url: string } | null {
  const pattern = /\[([^\]]*)\]\(([^)\s]+)\)/g
  let match = pattern.exec(text)
  while (match) {
    const from = match.index
    const to = from + match[0].length
    if (pos >= from && pos <= to) {
      return { from, to, label: match[1] as string, url: match[2] as string }
    }
    match = pattern.exec(text)
  }
  return null
}

/** ใส่/แก้ลิงก์ — `url` ว่าง = ถอดลิงก์เหลือแต่ข้อความ */
export function applyLink(
  text: string,
  from: number,
  to: number,
  url: string,
  pos = from,
): TextEdit {
  const existing = linkAt(text, pos)
  const label = existing ? existing.label : text.slice(from, to)
  const rangeFrom = existing ? existing.from : from
  const rangeTo = existing ? existing.to : to
  if (!url.trim()) {
    const next = text.slice(0, rangeFrom) + label + text.slice(rangeTo)
    return { text: next, from: rangeFrom, to: rangeFrom + label.length, changed: true }
  }
  const insert = label ? `[${label}](${url})` : `[](${url})`
  const next = text.slice(0, rangeFrom) + insert + text.slice(rangeTo)
  const caret = label ? rangeFrom + label.length + 3 : rangeFrom + 1
  return { text: next, from: caret, to: caret, changed: true }
}

/* ── smart paste: HTML → markdown (allowlist เดียวกับ sanitize) ─────────── */
/** รูปร่างขั้นต่ำของ DOM node ที่ smart paste ใช้ — ให้ส่ง DOMParser (เบราว์เซอร์)
 *  หรือ linkedom (เทสต์) เข้ามาได้ โดยไม่ผูก dependency */
export type HtmlNode = {
  nodeType: number
  nodeName: string
  textContent?: string | null
  childNodes: ArrayLike<HtmlNode>
  getAttribute?: (name: string) => string | null
}

type NodeLike = HtmlNode

const BLOCK_TAGS = new Set([
  "P",
  "DIV",
  "SECTION",
  "ARTICLE",
  "MAIN",
  "HEADER",
  "FOOTER",
  "FIGURE",
  "FIGCAPTION",
  "TABLE",
  "UL",
  "OL",
  "PRE",
  "BLOCKQUOTE",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
])

/** โครงสร้างที่ต้อง "ทิ้งทั้งก้อน" — ห้ามข้อความในนั้นกลายเป็น markdown
 *  (script/style = โค้ดหน้าเว็บ ไม่ใช่เนื้อหา · docs/06: ไม่มี HTML หลุดเข้า vault) */
const DROP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "TEMPLATE",
  "HEAD",
  "TITLE",
  "META",
  "LINK",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "CANVAS",
  "SVG",
  "DIALOG",
])

function textOf(node: NodeLike): string {
  let out = ""
  const children = Array.from(node.childNodes ?? [])
  for (const child of children) {
    if (child.nodeType === 3) out += child.textContent ?? ""
    else out += textOf(child)
  }
  return out
}

function inline(node: NodeLike): string {
  if (node.nodeType === 3) return node.textContent ?? ""
  // nodeName ของ HTML = ตัวพิมพ์ใหญ่ แต่ foreign element (svg) มาเป็นพิมพ์เล็ก → normalize
  const tag = node.nodeName.toUpperCase()
  if (DROP_TAGS.has(tag)) return ""
  const children = Array.from(node.childNodes ?? [])
  const inner = children.map(inline).join("")
  switch (tag) {
    case "STRONG":
    case "B":
      return inner.trim() ? `**${inner}**` : inner
    case "EM":
    case "I":
      return inner.trim() ? `*${inner}*` : inner
    case "DEL":
    case "S":
    case "STRIKE":
      return inner.trim() ? `~~${inner}~~` : inner
    case "CODE":
      return inner.trim() ? `\`${inner}\`` : inner
    case "MARK":
      return inner.trim() ? `==${inner}==` : inner
    case "BR":
      return "\n"
    case "A": {
      const href = node.getAttribute?.("href") ?? ""
      if (!href || href.startsWith("javascript:")) return inner
      return inner.trim() ? `[${inner}](${href})` : href
    }
    case "IMG": {
      const src = node.getAttribute?.("src") ?? ""
      if (!src) return ""
      const alt = node.getAttribute?.("alt") ?? ""
      return `![${alt}](${src})`
    }
    default:
      return inner
  }
}

function block(node: NodeLike, listDepth: number, ordered: boolean, index: number): string {
  if (node.nodeType === 3) return node.textContent ?? ""
  const tag = node.nodeName.toUpperCase()
  if (DROP_TAGS.has(tag)) return ""
  if (/^H[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1))
    const text = inline(node).trim()
    return text ? `${"#".repeat(level)} ${text}\n\n` : ""
  }
  if (tag === "P" || tag === "DIV" || tag === "SECTION" || tag === "ARTICLE") {
    const text = Array.from(node.childNodes ?? [])
      .map((child) => inline(child))
      .join("")
    return text.trim() ? `${text.trim()}\n\n` : ""
  }
  if (tag === "BR") return "\n"
  if (tag === "HR") return "---\n\n"
  if (tag === "PRE") {
    const code = textOf(node).replace(/\n+$/, "")
    return `\`\`\`\n${code}\n\`\`\`\n\n`
  }
  if (tag === "BLOCKQUOTE") {
    const innerText = Array.from(node.childNodes ?? [])
      .map((child) => block(child, 0, false, 0))
      .join("")
      .trim()
    return innerText
      ? `${innerText
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}\n\n`
      : ""
  }
  if (tag === "UL" || tag === "OL") {
    const isOrdered = tag === "OL"
    const items = Array.from(node.childNodes ?? []).filter((child) => child.nodeName === "LI")
    return `${items
      .map((item, itemIndex) => {
        const prefix = isOrdered ? `${itemIndex + 1}. ` : "- "
        const innerText = Array.from(item.childNodes ?? [])
          .map((child) => block(child, listDepth + 1, isOrdered, itemIndex))
          .join("")
          .trim()
        const indent = "  ".repeat(listDepth)
        return innerText
          .split("\n")
          .map((line, lineIndex) =>
            lineIndex === 0 ? indent + prefix + line : `${indent}  ${line}`,
          )
          .join("\n")
      })
      .join("\n")}\n\n`
  }
  if (tag === "LI") {
    const text = Array.from(node.childNodes ?? [])
      .map((child) => inline(child))
      .join("")
      .trim()
    return `${prefixFor(ordered, index) + text}\n`
  }
  if (tag === "TABLE") {
    const rows = Array.from(node.childNodes ?? []).filter((child) => child.nodeName === "TR")
    const cells = rows.map((row) =>
      Array.from(row.childNodes ?? [])
        .filter((cell) => cell.nodeName === "TD" || cell.nodeName === "TH")
        .map((cell) =>
          Array.from(cell.childNodes ?? [])
            .map((child) => inline(child))
            .join("")
            .trim(),
        ),
    )
    if (cells.length === 0) return ""
    const header = cells[0] as string[]
    const body = cells.slice(1)
    const lines = [header, header.map(() => "---"), ...body]
    return `${lines.map((row) => `| ${row.join(" | ")} |`).join("\n")}\n\n`
  }
  if (BLOCK_TAGS.has(tag)) {
    const text = Array.from(node.childNodes ?? [])
      .map((child) =>
        child.nodeType === 3 ? (child.textContent ?? "") : block(child, listDepth, ordered, index),
      )
      .join("")
    return text
  }
  return inline(node)
}

function prefixFor(ordered: boolean, index: number): string {
  return ordered ? `${index + 1}. ` : "- "
}

/** แปลง HTML จาก clipboard เป็น markdown — ไม่มี HTML ดิบหลุดเข้า vault (docs/06) */
function findBody(root: NodeLike): NodeLike {
  let node: NodeLike = root
  for (let depth = 0; depth < 3; depth += 1) {
    const next = Array.from(node.childNodes ?? []).find(
      (child) =>
        child.nodeName === "BODY" || child.nodeName === "HTML" || child.nodeName === "#document",
    )
    if (!next) break
    node = next
  }
  return node
}

export function htmlToMarkdown(html: string, parse: (html: string) => NodeLike): string {
  if (!html.trim()) return ""
  const root = parse(html)
  const body = findBody(root)
  let out = ""
  for (const child of Array.from(body.childNodes ?? [])) {
    out += block(child, 0, false, 0)
  }
  return out
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
}

/** markdown ที่ paste ต้องเริ่ม block ได้จริง — ถ้าカーอยู่กลางบรรทัด (มีข้อความก่อนหน้า)
 *  และ paste ขึ้นต้นด้วย block markdown → ขึ้นบรรทัดใหม่ก่อน ไม่งั้น `xx## หัวข้อ`
 *  ไม่เป็น heading (โครงสร้างจากเว็บหายเงียบ ๆ — docs/09 §5 Track D) */
export function alignPaste(textBeforeCaret: string, md: string): string {
  if (textBeforeCaret.trim() === "") return md
  const startsBlock = /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|`{3}|:{3}|\|)/.test(md)
  return startsBlock ? `\n\n${md}` : md
}

/* ── `:emoji:` ──────────────────────────────────────────────────────────── */

/** ชุดเล็กที่ใช้บ่อย (ไม่โหลดทั้งชุด — LAN/offline) */
export const EMOJI: Record<string, string> = {
  smile: "🙂",
  grin: "😀",
  joy: "😂",
  wink: "😉",
  heart: "❤️",
  thumbsup: "👍",
  thumbsdown: "👎",
  clap: "👏",
  pray: "🙏",
  fire: "🔥",
  sparkles: "✨",
  star: "⭐",
  tada: "🎉",
  rocket: "🚀",
  bulb: "💡",
  warning: "⚠️",
  white_check_mark: "✅",
  x: "❌",
  heavy_check_mark: "✔️",
  eyes: "👀",
  thinking: "🤔",
  sweat_smile: "😅",
  cry: "😢",
  sunglasses: "😎",
  wave: "👋",
  point_right: "👉",
  point_left: "👈",
  ok_hand: "👌",
  muscle: "💪",
  boom: "💥",
  zap: "⚡",
  bug: "🐛",
  coffee: "☕",
  beer: "🍺",
  pizza: "🍕",
  cake: "🎂",
  book: "📖",
  memo: "📝",
  pushpin: "📌",
  paperclip: "📎",
  lock: "🔒",
  key: "🔑",
  wrench: "🔧",
  hammer: "🔨",
  mag: "🔍",
  bell: "🔔",
  hourglass: "⏳",
  calendar: "📅",
  chart: "📊",
  gem: "💎",
  recycle: "♻️",
  seedling: "🌱",
  sun: "☀️",
  moon: "🌙",
  cloud: "☁️",
  rainbow: "🌈",
  100: "💯",
}

/** พิมพ์ `:name:` (ตามด้วยช่องว่าง/จบบรรทัด) → แทนด้วยอีโมจิ — คืน null ถ้าไม่รู้จัก */
export function replaceEmoji(
  text: string,
  pos: number,
): { from: number; to: number; insert: string } | null {
  const line = text.slice(0, pos)
  const match = /:([a-z0-9_+-]+):$/.exec(line)
  if (!match) return null
  const name = match[1] as string
  const emoji = EMOJI[name]
  if (!emoji) return null
  return { from: pos - match[0].length, to: pos, insert: emoji }
}
