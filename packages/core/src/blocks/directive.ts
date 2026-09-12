/**
 * remark plugin: แปลง `:::name{attrs}` (remark-directive) → HTML ของเรา
 *
 * M0: ยังไม่มี block ที่ implement → ทุก directive กลายเป็น code block + warning
 * (ตาม docs/01 "block ไม่รู้จัก → แสดง code block + เตือน")
 * M2: เพิ่ม renderer ต่อ block โดยไม่ต้องแก้ไฟล์นี้ — แค่เติม `render` ใน registry
 *
 * หมายเหตุสำคัญ (positions ไม่น่าเชื่อถือเมื่อ directive ซ้อนกัน):
 * remark-directive/micromark ให้ `position.end` ของ container ที่ซ้อนกันไม่ครบทุกกรณี
 * จึงต้อง
 *   1. แทนที่ directive แล้ว `SKIP` ไม่ลงไปข้างใน (outermost ตัวเดียวที่ต้องจัดการ —
 *      เนื้อในถูกแสดงเป็นข้อความอยู่แล้วใน fallback)
 *   2. ถ้า slice จาก position ดูไม่ครบ (ไม่มีบรรทัดปิด) → ประกอบข้อความใหม่จาก node
 *      เพื่อไม่ให้เนื้อหาซ้ำหรือหาย
 */

import type { Code, InlineCode, Root, RootContent } from "mdast"
import { SKIP, visit } from "unist-util-visit"
import { type Warning, warning } from "../types.ts"
import { type BlockDefinition, type DirectiveKind, findBlock } from "./registry.ts"

const DIRECTIVE_TYPES: Record<string, DirectiveKind> = {
  containerDirective: "container",
  leafDirective: "leaf",
  textDirective: "text",
}

/** บรรทัดที่เป็น fence เปล่า ๆ (artifact ของ `:::` ที่ไม่เข้าคู่) */
const STRAY_FENCE = /^:{3,}$/

export interface KairnDirectiveOptions {
  /** md ต้นฉบับ (ตัด frontmatter แล้ว) — ใช้ slice ข้อความดิบของ directive */
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
  name: string
  attributes?: Record<string, string | null | undefined> | null
  children?: RootContent[]
  position?: Position
}

export function remarkKairnDirectives(options: KairnDirectiveOptions) {
  return (tree: Root): void => {
    visit(tree, (node, index, parent) => {
      if (!parent || index === undefined) return

      if (node.type === "paragraph") {
        const text = textOf(node).trim()
        // `:::` เปล่า = artifact ของ fence ที่ไม่เข้าคู่ → ตัดทิ้ง
        // (warning เรื่อง fence มาจาก blocks/fences.ts ที่ตรวจจาก source)
        if (STRAY_FENCE.test(text)) {
          parent.children.splice(index, 1)
          return [SKIP, index]
        }
        return
      }

      const kind = DIRECTIVE_TYPES[node.type]
      if (!kind) return

      const directive = node as unknown as DirectiveLike
      const definition = findBlock(directive.name)
      const raw = fallbackSource(options.source, directive, kind)

      if (!definition) {
        options.onWarning(
          warning(
            "block_unknown",
            `block ที่ไม่รู้จัก: :::${directive.name} — แสดงเป็น code block แทน`,
            "warning",
            { path: options.docId, field: directive.name },
          ),
        )
      } else if (!definition.implemented) {
        options.onWarning(
          warning(
            "block_unimplemented",
            `block :::${directive.name} ยังไม่รองรับ (${definition.stage}) — แสดงเป็น code block แทน`,
            "info",
            { path: options.docId, field: directive.name },
          ),
        )
      }

      // M2: ถ้า definition.render มี → ใช้ renderer ของ block แทน fallback นี้
      parent.children[index] = kind === "text" ? inlineFallback(raw) : blockFallback(raw)
      return [SKIP, index]
    })
  }
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
    const text = textOf(child as RootContent).trim()
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
