/**
 * ETag / optimistic concurrency — docs/05 "Concurrency"
 *
 * ETag = hash ของ `{md, meta}` ที่ normalize แล้ว → PUT/PATCH ส่ง `If-Match` มาเทียบ
 * ไม่ตรง = 409 + ETag ปัจจุบัน (client/agent โหลดใหม่แล้วลองอีกครั้ง)
 */

import { sha256Hex } from "./hash.ts"
import type { Meta } from "./schema.ts"

export async function docEtag(markdown: string, meta: Meta): Promise<string> {
  return sha256Hex(["doku-etag", markdown, JSON.stringify(meta)].join("\u0000"))
}

/** รูปแบบ header มาตรฐาน — quoted strong etag */
export function etagHeader(etag: string): string {
  return `"${etag}"`
}

function normalizeToken(token: string): string {
  return token
    .trim()
    .replace(/^W\//, "")
    .replace(/^"(.*)"$/, "$1")
}

/**
 * เทียบ `If-Match` ตาม RFC 9110 แบบย่อ: `*` = มีอยู่ก็พอ · รองรับ list + weak prefix
 */
export function matchesIfMatch(header: string | null | undefined, etag: string): boolean {
  if (!header) return false
  const tokens = header.split(",").map(normalizeToken)
  return tokens.includes("*") || tokens.includes(etag)
}
