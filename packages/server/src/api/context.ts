/**
 * REST API — `GET /api/context/*path` (M4 · docs/05 §3)
 *
 * md + meta สรุปสั้นสำหรับใส่ prompt ของ agent · **อ่านอย่างเดียว** — ไม่ผ่าน `guardWrite`
 * (ไม่กิน write rate limit และใช้ได้ในโหมด read-only)
 */

import { loadMeta } from "@doku/core"
import type { Hono } from "hono"
import { type ApiContext, apiError, parseVaultPath, tailAfter } from "./shared.ts"

const CONTEXT_PREFIX = "/api/context/"

export function registerContext(api: Hono, ctx: ApiContext): void {
  const { deps, fs } = ctx
  const vaultName = deps.vaultName

  api.get("/context/*", async (context) => {
    const raw = tailAfter(context.req.url, CONTEXT_PREFIX) ?? ""
    const id = parseVaultPath(raw, vaultName)
    if (!id) return apiError(context, 400, "path_invalid", `path ไม่ปลอดภัย: ${raw}`)
    const md = await fs.readText(`${id}.md`)
    if (md === null) return apiError(context, 404, "not_found", `ไม่พบเอกสาร: ${id}`)
    const { meta } = await loadMeta(fs, id, null)
    const text = md.trim()
    return context.json({
      ok: true,
      path: id,
      md,
      // meta สรุป: ตัดค่า config ที่ไม่เกี่ยวกับเนื้อหา (theme/render) ออก — prompt ไม่ต้องการ
      meta: {
        title: meta.title,
        summary: meta.summary,
        tags: meta.tags,
        status: meta.status,
        created: meta.created,
        pinned: meta.pinned,
        authors: meta.authors,
        agent: meta.agent,
        relations: meta.relations,
      },
      words: text ? text.split(/\s+/u).filter(Boolean).length : 0,
      bytes: new TextEncoder().encode(md).byteLength,
    })
  })
}
