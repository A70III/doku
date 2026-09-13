/**
 * remark plugin: `[[wikilink]]` → mdast link
 *
 * resolve ด้วย basename ทั้ง vault (ซ้ำ = เตือน เลือกตัวแรก) หรือ path ตรงจาก vault (docs/02)
 * ก่อนมี index (M5) ใช้การ scan vault ตามต้องการ — ตามที่ docs/02 ระบุไว้
 */

import type { Root } from "mdast"
import { basenameOf, dirnameOf, docUrl, resolveRelativePath } from "../paths.ts"
import { type Warning, warning } from "../types.ts"
import { resolveWikiTarget } from "../vault-walk.ts"

export interface WikiLinkOptions {
  docId?: string
  /** map basename → path id (จาก vault scan) — ไม่มี = ไม่ resolve */
  index?: Map<string, string[]>
  onWarning: (w: Warning) => void
}

const WIKILINK = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g

/** รูปแบบ node เท่าที่ plugin นี้แตะ (mdast จริง ๆ — cast เฉพาะตอนเดิน tree) */
interface MutableNode {
  type: string
  value?: string
  children?: MutableNode[]
  url?: string
  title?: string | null
}

/** node ที่ไม่ควรมีลิงก์ซ้อนอยู่ข้างใน */
const OPAQUE_TYPES = new Set(["link", "linkReference", "image", "imageReference"])

export function remarkWikilinks(options: WikiLinkOptions) {
  return (tree: Root): void => {
    if (!options.index) return
    walk(tree as unknown as MutableNode, options)
  }
}

function walk(parent: MutableNode, options: WikiLinkOptions): void {
  const children = parent.children
  if (!children) return

  const next: MutableNode[] = []
  for (const child of children) {
    if (child.type === "text" && typeof child.value === "string" && child.value.includes("[[")) {
      next.push(...splitText(child, options))
      continue
    }
    if (!OPAQUE_TYPES.has(child.type)) walk(child, options)
    next.push(child)
  }
  parent.children = next
}

function splitText(node: MutableNode, options: WikiLinkOptions): MutableNode[] {
  const value = node.value ?? ""
  const result: MutableNode[] = []
  let cursor = 0

  WIKILINK.lastIndex = 0
  for (const match of value.matchAll(WIKILINK)) {
    const start = match.index ?? 0
    const target = (match[1] ?? "").trim()
    const alias = match[2]?.trim()
    if (start > cursor) result.push(textNode(value.slice(cursor, start)))
    result.push(...resolveToNodes(target, alias, options))
    cursor = start + match[0].length
  }

  if (cursor < value.length) result.push(textNode(value.slice(cursor)))
  return result.length > 0 ? result : [node]
}

function resolveToNodes(
  target: string,
  alias: string | undefined,
  options: WikiLinkOptions,
): MutableNode[] {
  const label = alias ?? target
  // หาไม่เจอ = คงข้อความต้นฉบับเป๊ะ ๆ (รวมเคส alias) — docs/08 ข้อ 61
  const fallback = textNode(alias ? `[[${target}|${alias}]]` : `[[${target}]]`)
  const index = options.index ?? new Map<string, string[]>()
  // `[[doc#anchor]]` — แยก anchor ออกจาก target ก่อน resolve (docs/08 ข้อ 56)
  const hash = target.indexOf("#")
  const targetPath = hash === -1 ? target : target.slice(0, hash)
  const anchor = hash === -1 ? "" : target.slice(hash)
  const resolution = resolveTarget(targetPath, index, options.docId)

  if (!resolution.id) {
    options.onWarning(
      warning("wikilink_missing", `wikilink [[${target}]] หาไม่เจอ — แสดงเป็นข้อความ`, "warning", {
        path: options.docId,
        field: target,
      }),
    )
    return [fallback]
  }

  if (resolution.ambiguous) {
    options.onWarning(
      warning(
        "wikilink_ambiguous",
        `wikilink [[${target}]] ซ้ำหลายไฟล์ — เลือก ${resolution.id}`,
        "warning",
        { path: options.docId, field: target },
      ),
    )
  }

  return [
    {
      type: "link",
      url: docUrl(resolution.id) + anchor,
      title: null,
      children: [textNode(label)],
    },
  ]
}

function resolveTarget(
  target: string,
  index: Map<string, string[]>,
  docId?: string,
): { id: string | null; ambiguous: boolean } {
  if (!target.includes("/")) return resolveWikiTarget(index, target)

  const cleaned = target.endsWith(".md") ? target.slice(0, -3) : target
  const path =
    cleaned.startsWith("./") || cleaned.startsWith("../")
      ? docId
        ? resolveRelativePath(dirnameOf(docId), cleaned)
        : null
      : cleaned
  if (!path) return { id: null, ambiguous: false }

  const candidates = index.get(basenameOf(path)) ?? []
  return candidates.includes(path) ? { id: path, ambiguous: false } : { id: null, ambiguous: false }
}

function textNode(value: string): MutableNode {
  return { type: "text", value }
}
