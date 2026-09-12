/**
 * Resolve: path id → md + meta
 * ขั้นแรกของ pipeline (docs/01 data flow)
 */

import { splitFrontmatter } from "./frontmatter.ts"
import type { VaultFs } from "./fs.ts"
import { loadMeta, type MetaSource } from "./meta.ts"
import { mdPathFromDocId, normalizeVaultPath } from "./paths.ts"
import { defaultMeta, type Meta, MetaSchema } from "./schema.ts"
import { type Warning, warning } from "./types.ts"

/** 5 MB — limit เดียวกับ REST/MCP (docs/05) */
export const MAX_MD_BYTES = 5 * 1024 * 1024

export class DocNotFoundError extends Error {
  readonly code = "doc_not_found"
  readonly docId: string
  constructor(docId: string) {
    super(`ไม่พบเอกสาร: ${docId}`)
    this.name = "DocNotFoundError"
    this.docId = docId
  }
}

export interface ResolvedDoc {
  /** path id (ไม่มี `.md`) — ว่างเมื่อเป็น content inline (stdin/REST `/render`) */
  id: string
  /** md ต้นฉบับเต็ม (มี frontmatter ถ้ามี) */
  markdown: string
  /** md ที่ตัด frontmatter แล้ว — ใช้เข้า render pipeline */
  body: string
  /** frontmatter ที่ parse ได้ (ถ้ามี) */
  frontmatter: Record<string, unknown> | null
  meta: Meta
  metaSource: MetaSource
  warnings: Warning[]
}

export interface ResolveOptions {
  /** ชื่อโฟลเดอร์ vault — ตัดออกถ้าผู้ใช้พิมพ์ `vault/x` มา */
  vaultName?: string
  maxBytes?: number
}

export async function resolveDoc(
  input: string,
  fs: VaultFs,
  options: ResolveOptions = {},
): Promise<ResolvedDoc> {
  const id = normalizeVaultPath(input, { vaultName: options.vaultName })
  const markdown = await fs.readText(mdPathFromDocId(id))
  if (markdown === null) throw new DocNotFoundError(id)

  const warnings: Warning[] = []
  const maxBytes = options.maxBytes ?? MAX_MD_BYTES
  const bytes = new TextEncoder().encode(markdown).length
  if (bytes > maxBytes) {
    warnings.push(
      warning(
        "md_too_large",
        `เอกสารใหญ่กว่า limit (${bytes} > ${maxBytes} bytes) — REST/MCP จะปฏิเสธการเขียน`,
        "warning",
        { path: id },
      ),
    )
  }

  const { data: frontmatter, body } = splitFrontmatter(markdown)
  const { meta, source, warnings: metaWarnings } = await loadMeta(fs, id, frontmatter)

  return {
    id,
    markdown,
    body,
    frontmatter,
    meta,
    metaSource: source,
    warnings: [...warnings, ...metaWarnings],
  }
}

/**
 * เอกสารแบบไม่มี vault (stateless) — meta มาจาก frontmatter เท่านั้น
 * ใช้ทั้ง `kairn render --stdin`, REST `POST /render`, MCP `doc_render`
 */
export function resolveInline(markdown: string, id = "untitled"): ResolvedDoc {
  const { data: frontmatter, body } = splitFrontmatter(markdown)
  if (!frontmatter) {
    return {
      id,
      markdown,
      body,
      frontmatter: null,
      meta: defaultMeta(id),
      metaSource: "default",
      warnings: [],
    }
  }

  const parsed = MetaSchema.safeParse(frontmatter)
  if (parsed.success) {
    return {
      id,
      markdown,
      body,
      frontmatter,
      meta: parsed.data,
      metaSource: "frontmatter",
      warnings: [],
    }
  }

  const warnings = parsed.error.issues.map((issue) =>
    warning(
      "meta_invalid",
      `frontmatter ไม่ผ่าน schema ที่ ${issue.path.join(".")}: ${issue.message}`,
      "warning",
      { path: id, field: issue.path.join(".") },
    ),
  )
  return {
    id,
    markdown,
    body,
    frontmatter,
    meta: defaultMeta(id),
    metaSource: "default",
    warnings,
  }
}
