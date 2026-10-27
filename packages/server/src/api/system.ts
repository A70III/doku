/**
 * REST API — utility ที่ทั้ง UI และ agent ใช้: `/tree` · `/render` · `/schema`
 *
 * - `GET /tree` — tree จาก `state` (depth จำกัดได้) · อ่านอย่างเดียว
 * - `POST /render` — render markdown ที่ยังไม่บันทึก (live preview) · **rate limit render 120/min**
 *   (ไม่ใช่ write limit เพราะไม่แตะ disk)
 * - `GET /schema` — block registry สำหรับ slash menu / block control strip / MCP descriptions
 */

import {
  BLOCK_COLORS,
  BLOCKS,
  buildDocIndex,
  CALLOUT_TYPES,
  MAX_MD_BYTES,
  renderMarkdown,
  resolveInline,
  walkVault,
} from "@doku/core"
import type { Hono } from "hono"
import { clampTreeDepth } from "../tree.ts"
import { type ApiContext, apiError, RATE_LIMITS, readJson } from "./shared.ts"

export function registerSystem(api: Hono, ctx: ApiContext): void {
  const { deps, fs, limiter, clientKey } = ctx

  api.get("/tree", async (context) => {
    const { tree } = await deps.state.get()
    const depth = Number.parseInt(context.req.query("depth") ?? "", 10)
    return context.json({
      ok: true,
      tree: Number.isFinite(depth) ? clampTreeDepth(tree, depth) : tree,
    })
  })

  api.post("/render", async (context) => {
    if (!limiter.check(`render:${clientKey(context)}`, RATE_LIMITS.render)) {
      return apiError(context, 429, "rate_limited", "render ถี่เกิน limit (120/min)")
    }
    const body = await readJson(context)
    if (!body) return apiError(context, 400, "invalid_json", "body ต้องเป็น JSON object")
    if (typeof body.md !== "string") {
      return apiError(context, 400, "invalid_body", "ต้องมี field `md` เป็น string")
    }
    if (new TextEncoder().encode(body.md).byteLength > MAX_MD_BYTES) {
      return apiError(context, 413, "too_large", `md ใหญ่กว่า limit ${MAX_MD_BYTES} bytes`)
    }

    const requestedPath = typeof body.path === "string" ? body.path.trim() : ""
    const inline = resolveInline(body.md, requestedPath || "untitled")
    const listing = await walkVault(fs)
    const index = buildDocIndex(listing.docs)
    const known = new Set(listing.docs)
    const result = await renderMarkdown(inline.body, {
      docId: inline.id,
      meta: inline.meta,
      vault: { fs, index, hasDoc: (id) => known.has(id) },
      warnings: inline.warnings,
    })
    return context.json({
      ok: true,
      html: result.html,
      meta: result.meta,
      warnings: result.warnings,
    })
  })

  /** `/api/schema` — block registry สำหรับ agent + UI (docs/03 §9 · docs/05)
   *  ใช้ที่: slash menu / block control strip (M3.1) และ MCP descriptions (M4) */
  api.get("/schema", (context) => {
    return context.json({
      ok: true,
      colors: BLOCK_COLORS,
      variants: CALLOUT_TYPES,
      blocks: BLOCKS.filter((block) => block.implemented).map((block) => ({
        name: block.name,
        kind: block.kind,
        attributes: block.attributes,
        values: block.values,
        example: block.example,
      })),
    })
  })
}
