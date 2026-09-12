/**
 * YAML frontmatter — รองรับเพื่อ compat กับ Obsidian (docs/02)
 * ลำดับความสำคัญ: `meta.json` ชนะ frontmatter เสมอ
 */

import { parse as parseYaml } from "yaml"

export interface FrontmatterSplit {
  /** YAML ที่ parse แล้ว (null ถ้าไม่มี/พัง) */
  data: Record<string, unknown> | null
  /** เนื้อหา md ที่ตัด frontmatter ออกแล้ว */
  body: string
}

const FRONTMATTER = /^(?:\ufeff)?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

export function splitFrontmatter(md: string): FrontmatterSplit {
  const match = FRONTMATTER.exec(md)
  if (!match) return { data: null, body: md }

  const raw = match[1] ?? ""
  let data: Record<string, unknown> | null = null
  try {
    const parsed: unknown = parseYaml(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>
    }
  } catch {
    // frontmatter พัง = ไม่มี frontmatter (ไม่ทำให้เอกสารล้ม)
    data = null
  }
  // ตัด newline ที่ตามหลัง block ออก เพื่อให้ body เริ่มที่เนื้อหาจริง
  return { data, body: md.slice(match[0].length).replace(/^\r?\n/, "") }
}
