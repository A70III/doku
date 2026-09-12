/**
 * สแกน md แบบเบา (ไม่ render) — ใช้โดย `doku check`
 * เก็บ: headings, ลิงก์ (doc/asset/external), wikilink, block directive, จำนวนคำ
 */

import type { Root } from "mdast"
import remarkDirective from "remark-directive"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { visit } from "unist-util-visit"
import { analyzeDirectiveFences, type FenceProblem } from "./blocks/fences.ts"
import { findBlock } from "./blocks/registry.ts"
import { dirnameOf, resolveRelativePath } from "./paths.ts"

export type LinkKind = "doc" | "asset" | "external" | "unsafe"

export interface ScannedLink {
  raw: string
  kind: LinkKind
  /** vault path ที่ resolve ได้ (null = external/unsafe) */
  resolved: string | null
}

export interface ScannedBlock {
  name: string
  known: boolean
  implemented: boolean
}

export interface DocScan {
  headings: { depth: number; text: string }[]
  links: ScannedLink[]
  wikilinks: string[]
  blocks: ScannedBlock[]
  /** ปัญหา fence ของ `:::` ที่ตรวจจาก source (เปิดไม่ปิด · `:::` เปล่า · ซ้อน fence ยาวเท่ากัน) */
  fenceProblems: FenceProblem[]
  words: number
}

const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i
const DIRECTIVE_NAMES: Record<string, true> = {
  containerDirective: true,
  leafDirective: true,
  textDirective: true,
}
const WIKILINK = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkDirective).use(remarkMath)

export function scanMarkdown(body: string, docId = ""): DocScan {
  const tree = parser.parse(body) as Root
  const scan: DocScan = {
    headings: [],
    links: [],
    wikilinks: [],
    blocks: [],
    fenceProblems: analyzeDirectiveFences(body),
    words: 0,
  }

  visit(tree, (node) => {
    if (node.type === "heading") {
      scan.headings.push({ depth: node.depth, text: textOf(node) })
      return
    }

    if (node.type === "link" || node.type === "image") {
      scan.links.push(classify(node.url, docId))
      return
    }

    if (node.type === "text") {
      WIKILINK.lastIndex = 0
      for (const match of node.value.matchAll(WIKILINK)) {
        scan.wikilinks.push((match[1] ?? "").trim())
      }
      scan.words += node.value.trim().split(/\s+/).filter(Boolean).length
      return
    }

    if (DIRECTIVE_NAMES[node.type]) {
      const directive = node as unknown as { name: string }
      const definition = findBlock(directive.name)
      scan.blocks.push({
        name: directive.name,
        known: Boolean(definition),
        implemented: definition?.implemented ?? false,
      })
      return
    }
  })

  return scan
}

function classify(raw: string, docId: string): ScannedLink {
  if (!raw || URL_LIKE.test(raw)) return { raw, kind: "external", resolved: null }
  const resolved = resolveRelativePath(dirnameOf(docId), raw)
  if (!resolved) return { raw, kind: "unsafe", resolved: null }
  return { raw, kind: resolved.endsWith(".md") ? "doc" : "asset", resolved }
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
