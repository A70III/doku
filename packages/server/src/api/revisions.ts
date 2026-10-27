/**
 * REST API — revisions: list + restore (M3 · docs/05 §3)
 *
 * - `GET /revisions/*path` — รายการ revision ของเอกสาร (อ่านอย่างเดียว)
 * - `POST /revisions/*path` — กู้ snapshot กลับเป็นไฟล์จริง · `ts` ไม่ส่ง = ใช้ตัวล่าสุด
 *   · **เก็บ snapshot ปัจจุบันเป็น revision ก่อนทับ** (กู้ผิดตัวยังย้อนได้) · rate limit write
 */

import type { Hono } from "hono"
import { auditLog } from "../audit.ts"
import { type ApiContext, apiError, parseVaultPath, readJson, tailAfter } from "./shared.ts"

const REVISIONS_PREFIX = "/api/revisions/"

export function registerRevisions(api: Hono, ctx: ApiContext): void {
  const { deps, writable, guardWrite, saveRevision, touch } = ctx
  const vaultName = deps.vaultName

  api.get("/revisions/*", async (context) => {
    const id = parseVaultPath(tailAfter(context.req.url, REVISIONS_PREFIX) ?? "", vaultName)
    if (!id) return apiError(context, 400, "path_invalid", "path ไม่ปลอดภัย")
    return context.json({ ok: true, path: id, items: await deps.revisions.list(id) })
  })

  api.post("/revisions/*", async (context) => {
    const blocked = guardWrite(context)
    if (blocked) return blocked

    const id = parseVaultPath(tailAfter(context.req.url, REVISIONS_PREFIX) ?? "", vaultName)
    if (!id) return apiError(context, 400, "path_invalid", "path ไม่ปลอดภัย")

    const body = await readJson(context)
    if (!body) return apiError(context, 400, "invalid_json", "body ต้องเป็น JSON object")
    const requested = typeof body.ts === "string" ? body.ts : undefined
    const target = requested ?? (await deps.revisions.latest(id))?.ts
    if (!target) return apiError(context, 404, "not_found", `ไม่พบ revision ของ: ${id}`)

    const snapshot = await deps.revisions.read(id, target)
    if (!snapshot) return apiError(context, 404, "not_found", `ไม่พบ revision: ${target}`)

    await saveRevision(id)
    if (snapshot.md !== null) await writable?.writeText(`${id}.md`, snapshot.md)
    if (snapshot.meta !== null) await writable?.writeText(`${id}.meta.json`, snapshot.meta)
    touch()
    auditLog(context, "doc.revision_restore", id)
    return context.json({ ok: true, path: id, ts: target })
  })
}
