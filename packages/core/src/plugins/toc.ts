/** rehype plugin: เก็บสารบัญ (h2/h3) จาก tree ที่ slug แล้ว — ใช้ทำ TOC ที่ M1/M2 */

import type { Root } from "hast"
import { visit } from "unist-util-visit"

export interface TocEntry {
  depth: number
  id: string
  text: string
}

export function rehypeCollectToc(options: {
  onEntry: (entry: TocEntry) => void
  minDepth?: number
  maxDepth?: number
}) {
  const min = options.minDepth ?? 2
  const max = options.maxDepth ?? 3

  return (tree: Root): void => {
    visit(tree, "element", (node) => {
      const match = /^h([1-6])$/.exec(node.tagName)
      if (!match) return
      const depth = Number(match[1])
      if (depth < min || depth > max) return
      const id = typeof node.properties?.id === "string" ? node.properties.id : null
      if (!id) return
      options.onEntry({ depth, id, text: textOf(node) })
    })
  }
}

function textOf(node: { children?: unknown[] }): string {
  let out = ""
  const walk = (children: unknown[]): void => {
    for (const child of children) {
      if (!child || typeof child !== "object") continue
      const candidate = child as { type?: string; value?: string; children?: unknown[] }
      if (candidate.type === "text" && typeof candidate.value === "string") out += candidate.value
      if (Array.isArray(candidate.children)) walk(candidate.children)
    }
  }
  if (Array.isArray(node.children)) walk(node.children)
  return out.trim()
}
