/**
 * remark plugin: `==ข้อความ=={.สี}` → `dokuInline` name `mark`
 *
 * `==mark==` **ไม่ใช่ GFM** — เป็น extension ของ doku เอง (docs/03 Highlight สี)
 * จึงต้องแปลงเอง (remark ไม่รู้จัก) แล้วให้ block registry เป็นคน render
 *
 * จงใจแปลงที่ระดับ mdast text node (ไม่ทำ micromark extension) เพราะ syntax เล็ก
 * และผูกกับ allowlist สีเท่านั้น — text node ใน code ไม่ถูกแตะ (type ไม่ใช่ `text`)
 */

import type { Root } from "mdast"
import { BLOCK_COLORS } from "../blocks/types.ts"
import type { Warning } from "../types.ts"

export interface MarkOptions {
  onWarning?: (w: Warning) => void
  docId?: string
}

/** `==…==` + `{.color}` ที่ตามหลัง (ถ้ามี) — สีต้องอยู่ใน allowlist */
const MARK = /==([^=\n]+?)==(?:\{\.([a-z]+)\})?/g
const COLORS = new Set<string>(BLOCK_COLORS)

interface MutableNode {
  type: string
  value?: string
  name?: string
  attributes?: Record<string, string>
  children?: MutableNode[]
}

/** node ที่ไม่ควรแทน mark ข้างใน (ลิงก์/รูปมี syntax ของตัวเอง) */
const OPAQUE = new Set(["link", "linkReference", "image", "imageReference", "inlineCode", "code"])

export function remarkMark(options: MarkOptions = {}) {
  return (tree: Root): void => {
    walk(tree as unknown as MutableNode, options)
  }
}

function walk(parent: MutableNode, options: MarkOptions): void {
  const children = parent.children
  if (!children) return
  const next: MutableNode[] = []
  for (const child of children) {
    if (child.type === "text" && typeof child.value === "string" && child.value.includes("==")) {
      next.push(...splitText(child.value, options))
      continue
    }
    if (!OPAQUE.has(child.type)) walk(child, options)
    next.push(child)
  }
  parent.children = next
}

function splitText(value: string, options: MarkOptions): MutableNode[] {
  const result: MutableNode[] = []
  let cursor = 0
  MARK.lastIndex = 0

  for (const match of value.matchAll(MARK)) {
    const start = match.index ?? 0
    const body = match[1] ?? ""
    const color = match[2]
    if (color && !COLORS.has(color)) {
      options.onWarning?.({
        code: "block_attribute_unknown",
        message: `สีของ mark ไม่รองรับ: ${color} (ใช้ ${[...COLORS].join(" ")}) — ใช้สี accent แทน`,
        level: "info",
        path: options.docId,
        field: "mark",
      })
    }
    if (start > cursor) result.push(textNode(value.slice(cursor, start)))
    const attributes: Record<string, string> = {}
    if (color && COLORS.has(color)) attributes.color = color
    result.push({ type: "dokuInline", name: "mark", attributes, children: [textNode(body)] })
    cursor = start + match[0].length
  }

  if (result.length === 0) return [textNode(value)]
  if (cursor < value.length) result.push(textNode(value.slice(cursor)))
  return result
}

function textNode(value: string): MutableNode {
  return { type: "text", value }
}
