/**
 * remark plugin: แปลง `:::name{attrs}` (remark-directive) → `dokuBlock` / `dokuInline`
 *
 * แบ่งงานเป็นสองชั้น:
 * 1. plugin นี้ (mdast → mdast) — ตรวจชื่อ block/attribute, เตือน, แปลง directive ที่ implement
 *    เป็น node ของเรา ส่วน block ที่ไม่รู้จัก/ยังไม่ทำ = fallback code block (docs/01)
 * 2. `createDokuHandlers` (mdast → hast ให้ remark-rehype) — เรียก renderer จาก registry
 *
 * หมายเหตุ positions: `position.end` ของ container ที่ซ้อนกันไม่น่าเชื่อถือ (micromark รวม stack)
 * จึง slice จาก source เฉพาะตอนทำ fallback เท่านั้น และถ้า slice ไม่ครบให้ประกอบใหม่จาก node
 * ส่วน block ที่ implement แล้วไม่ต้องใช้ source เลย (children ถูกส่งต่อให้ remark-rehype เอง)
 */

import type { ElementContent } from "hast"
import type { Code, InlineCode, Root, RootContent } from "mdast"
import type { Options as RemarkRehypeOptions } from "remark-rehype"
import { type Warning, warning } from "../types.ts"
import { type BlockDefinition, findBlock } from "./registry.ts"
import type { BlockContext, DirectiveKind, DokuDirectiveNode } from "./types.ts"

const DIRECTIVE_TYPES: Record<string, DirectiveKind> = {
  containerDirective: "container",
  leafDirective: "leaf",
  textDirective: "text",
}

/** บรรทัดที่เป็น fence เปล่า ๆ (artifact ของ `:::` ที่ไม่เข้าคู่) */
const STRAY_FENCE = /^:{3,}$/

type HandlerMap = NonNullable<RemarkRehypeOptions["handlers"]>
type Handler = NonNullable<HandlerMap[keyof HandlerMap]>

export interface DokuDirectiveOptions {
  /** md ต้นฉบับ (ตัด frontmatter แล้ว) — ใช้ slice ข้อความดิบของ directive ตอน fallback */
  source: string
  onWarning: (w: Warning) => void
  docId?: string
}

interface Position {
  start: { offset?: number }
  end: { offset?: number }
}

interface DirectiveLike {
  type: string
  name?: string
  attributes?: Record<string, string | null | undefined> | null
  children?: RootContent[]
  position?: Position
}

export function remarkDokuDirectives(options: DokuDirectiveOptions) {
  return (tree: Root): void => {
    convert(tree as unknown as DirectiveLike, options)
  }
}

/** แปลง directive ทั้งหมดเป็น node ของเรา — เรียกซ้ำจากในสุดออกมา (inner ก่อน outer) */
function convert(parent: DirectiveLike, options: DokuDirectiveOptions): void {
  const children = parent.children
  if (!Array.isArray(children)) return

  const out: RootContent[] = []
  for (const child of children) {
    if (child.type === "paragraph") {
      const text = textOf(child).trim()
      // `:::` เปล่า = artifact ของ fence ที่ไม่เข้าคู่ → ตัดทิ้ง (fences.ts เตือนให้แล้ว)
      if (STRAY_FENCE.test(text)) continue
      convert(child as unknown as DirectiveLike, options) // text directive (`:badge`) อยู่ในนี้
      out.push(child)
      continue
    }

    const kind = DIRECTIVE_TYPES[child.type]
    if (!kind) {
      convert(child as unknown as DirectiveLike, options)
      out.push(child)
      continue
    }

    const directive = child as unknown as DirectiveLike
    convert(directive, options) // แปลง block ข้างในก่อน (tabs → tab, grid → col)

    // `:name` กลางข้อความโดยไม่มี `[...]` (เช่น `bun:sqlite`) = ข้อความธรรมดา ไม่ใช่ directive
    if (kind === "text" && (directive.children?.length ?? 0) === 0) {
      out.push({
        type: "text",
        value: fallbackSource(options.source, directive, kind),
      } as RootContent)
      continue
    }

    const definition = findBlock(directive.name ?? "")
    if (!definition?.implemented) {
      warnMissing(definition, directive.name ?? "", options)
      const raw = fallbackSource(options.source, directive, kind)
      out.push((kind === "text" ? inlineFallback(raw) : blockFallback(raw)) as RootContent)
      continue
    }

    const attrs = readAttributes(directive, definition, options)
    const node: DokuDirectiveNode = {
      type: kind === "text" ? "dokuInline" : "dokuBlock",
      name: definition.name,
      attributes: attrs,
      children: (directive.children ?? []) as unknown[],
    }
    out.push(node as unknown as RootContent)
  }

  parent.children = out
}

function warnMissing(
  definition: BlockDefinition | undefined,
  name: string,
  options: DokuDirectiveOptions,
): void {
  if (!definition) {
    options.onWarning(
      warning("block_unknown", `block ที่ไม่รู้จัก: :::${name} — แสดงเป็น code block แทน`, "warning", {
        path: options.docId,
        field: name,
      }),
    )
    return
  }
  options.onWarning(
    warning("block_unimplemented", `block :::${name} ยังไม่รองรับ — แสดงเป็น code block แทน`, "info", {
      path: options.docId,
      field: name,
    }),
  )
}

/** attribute ของ directive: trim, ตรวจชื่อที่รู้จักและค่าใน allowlist — ค่าที่ไม่ผ่าน = ignore + เตือน */
function readAttributes(
  directive: DirectiveLike,
  definition: BlockDefinition,
  options: DokuDirectiveOptions,
): Record<string, string> {
  const known = new Set(definition.attributes)
  const out: Record<string, string> = {}
  const warnAttr = (message: string): void => {
    options.onWarning(
      warning("block_attribute_unknown", message, "info", {
        path: options.docId,
        field: definition.name,
      }),
    )
  }

  for (const [key, value] of Object.entries(directive.attributes ?? {})) {
    if (value === null || value === undefined) continue
    if (!known.has(key)) {
      warnAttr(`attribute ที่ไม่รู้จัก: ${key} (block :::${definition.name}) — ไม่ใช้`)
      continue
    }
    const trimmed = value.trim()
    const allowed = definition.values[key]
    if (trimmed !== "" && allowed && !allowed.includes(trimmed)) {
      warnAttr(`ค่า ${key}=${trimmed} ไม่รองรับ (block :::${definition.name}) — ไม่ใช้`)
      continue
    }
    out[key] = trimmed
  }
  return out
}

/**
 * remark-rehype handlers — จุดเดียวที่ block renderer ถูกเรียก
 * ทุกอย่างที่ renderer คืน จะยังผ่าน rehype-sanitize ต่อ (docs/06)
 */
export function createDokuHandlers(options: {
  docId?: string
  onWarning: (w: Warning) => void
}): Record<string, Handler> {
  const docId = options.docId ?? ""
  const render: Handler = (state, node) => {
    const directive = node as unknown as DokuDirectiveNode
    const definition = findBlock(directive.name)
    if (!definition) return state.all(node as never) as ElementContent[]

    const warn = (code: Parameters<typeof warning>[0], message: string, level = "info"): void => {
      options.onWarning(
        warning(code, message, level as never, { path: docId, field: directive.name }),
      )
    }

    const context: BlockContext = {
      attrs: directive.attributes ?? {},
      children: state.all(node as never) as ElementContent[],
      node: directive,
      docId,
      warn,
    }
    return (definition.render(context) ?? []) as ElementContent
  }

  return { dokuBlock: render, dokuInline: render }
}

/**
 * ข้อความดิบจาก md ตาม position
 * - text/leaf directive = บรรทัดเดียว → ใช้ slice ตรง ๆ
 * - container = ต้องมีบรรทัด `:::` ปิด ไม่งั้น position ไม่ครบ → ประกอบใหม่จาก node
 */
function fallbackSource(source: string, node: DirectiveLike, kind: DirectiveKind): string {
  const slice = sliceByPosition(source, node.position)
  if (!slice) return reconstruct(node)
  if (kind === "container" && !hasClosingFence(slice)) return reconstruct(node)
  return slice.replace(/\s+$/, "")
}

function sliceByPosition(source: string, position: Position | undefined): string | null {
  const start = position?.start.offset
  const end = position?.end.offset
  if (typeof start !== "number" || typeof end !== "number") return null
  return source.slice(start, end)
}

function hasClosingFence(slice: string): boolean {
  const lines = slice.split("\n").filter((line) => line.trim() !== "")
  const last = lines[lines.length - 1]
  return lines.length > 1 && last !== undefined && last.trimStart().startsWith(":::")
}

function reconstruct(node: DirectiveLike): string {
  const parts: string[] = []
  for (const child of node.children ?? []) {
    const text = textOf(child).trim()
    if (text) parts.push(text)
  }
  const attrs = formatAttributes(node.attributes)
  const body = parts.join("\n\n")
  return body ? `:::${node.name}${attrs}\n${body}\n:::` : `:::${node.name}${attrs}\n:::`
}

function formatAttributes(attributes: DirectiveLike["attributes"]): string {
  if (!attributes) return ""
  const entries = Object.entries(attributes).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0,
  )
  if (entries.length === 0) return ""
  return `{${entries.map(([key, value]) => `${key}=${value}`).join(" ")}}`
}

function textOf(node: RootContent): string {
  const candidate = node as unknown as { value?: string; children?: RootContent[]; type: string }
  if (typeof candidate.value === "string") return candidate.value
  if (!Array.isArray(candidate.children)) return ""
  const separator = candidate.type === "paragraph" || candidate.type === "heading" ? "" : "\n"
  return candidate.children.map((child) => textOf(child)).join(separator)
}

function blockFallback(value: string): Code {
  return { type: "code", lang: "md", meta: null, value }
}

/** text directive อยู่กลางบรรทัด → ต้องเป็น inline element (ห้าม <pre> ใน <p>) */
function inlineFallback(value: string): InlineCode {
  return { type: "inlineCode", value }
}

export type { BlockDefinition }
