/**
 * REST API — trash: list / empty / restore (M3 · docs/06)
 *
 * - `GET /trash` — purge ของเก่า (30 วัน) ก่อน list แล้วคืนรายการที่เหลือ
 * - `POST /trash/empty` — **ลบถาวร = คนเท่านั้น** ไม่มี MCP tool นี้ · เขียน log 1 บรรทัดต่อ item ที่ถูก purge
 * - `POST /trash/:id/restore` — คืนไฟล์กลับที่เดิม · path เดิมมีอยู่แล้ว = 409 (ไม่ทับ)
 *
 * ไม่มี route ลบถาวรรายรายการ (invariant 7) — `empty` เท่านั้น
 */

import { isTrashId } from "@doku/core"
import type { Hono } from "hono"
import { auditLog } from "../audit.ts"
import { type ApiContext, apiError } from "./shared.ts"

export function registerTrash(api: Hono, ctx: ApiContext): void {
  const { deps, writable, exists, touch } = ctx

  api.get("/trash", async (context) => {
    await deps.trash.purge()
    return context.json({ ok: true, items: await deps.trash.list() })
  })

  api.post("/trash/empty", async (context) => {
    // ลบถาวร = คนเท่านั้น — ไม่มี MCP tool นี้ (docs/06) · เว็บยืนยัน 2 ชั้นฝั่ง UI
    const items = await deps.trash.list()
    const removed = await deps.trash.empty()
    // ทำลายข้อมูล = ต้องมีร่องรอย — ล็อกต่อ item (path จริงของแต่ละรายการที่ถูก purge)
    for (const item of items) auditLog(context, `${item.kind}.purge`, item.label)
    return context.json({ ok: true, removed })
  })

  api.post("/trash/:id/restore", async (context) => {
    const id = context.req.param("id")
    if (!isTrashId(id)) return apiError(context, 404, "not_found", `ไม่พบรายการ: ${id}`)
    if (!writable) return apiError(context, 503, "read_only", "vault นี้เปิดแบบอ่านอย่างเดียว")
    const items = await deps.trash.list()
    const item = items.find((entry) => entry.id === id)
    if (!item) return apiError(context, 404, "not_found", `ไม่พบรายการ: ${id}`)
    for (const source of item.sources) {
      if (await exists(source)) {
        return apiError(context, 409, "already_exists", `path เดิมมีอยู่แล้ว: ${source}`)
      }
    }
    await deps.trash.restore(id)
    touch()
    auditLog(context, `${item.kind}.restore`, item.label)
    return context.json({ ok: true, item })
  })
}
