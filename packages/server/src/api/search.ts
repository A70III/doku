/**
 * REST API — `GET /api/search?q=&limit=&tag=` (M5 · docs/05 §3)
 *
 * FTS5 trigram จาก `var/index.db` · **อ่านอย่างเดียว** — index ไม่พร้อม = 503 `internal_error`
 * (ไม่ใช่ 500) เพื่อให้ client แยก "ปิดอยู่" ออกจาก "พัง" ได้
 */

import type { Hono } from "hono"
import { type ApiContext, apiError } from "./shared.ts"

export function registerSearch(api: Hono, ctx: ApiContext): void {
  const { deps } = ctx

  api.get("/search", (context) => {
    if (!deps.searchIndex) {
      return apiError(context, 503, "internal_error", "search index ยังไม่พร้อม")
    }
    const q = context.req.query("q") ?? ""
    const limit = Number.parseInt(context.req.query("limit") ?? "", 10)
    const tag = context.req.query("tag") || undefined
    const hits = deps.searchIndex.search(q, {
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
      tag,
    })
    return context.json({ ok: true, query: q, count: hits.length, hits })
  })
}
