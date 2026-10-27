/**
 * REST API — โฟลเดอร์: create/update(meta)/delete + move (docs/05 §3)
 *
 * - path ของโฟลเดอร์ parse ด้วย `stripSuffix = false` (ชื่อโฟลเดอร์ลงท้าย `.md` ได้ ต้องไม่ถูกตัด)
 * - delete = soft-delete เข้า `.trash/` (`kind: "folder"`) + เก็บ revision ของเอกสารข้างในก่อน
 *   · โฟลเดอร์ไม่ว่าง = 409 `folder_not_empty` เว้นแต่ `?recursive=true`
 * - `POST /folders/*path/move` อยู่ใน route เดียวกับ create (dispatch ด้วย suffix) — คงลำดับเดิม
 */

import { MoveError, moveFolder } from "@doku/core"
import type { Context, Hono } from "hono"
import { auditLog } from "../audit.ts"
import {
  type ApiContext,
  apiError,
  jsonSidecar,
  mergeShallowObjects,
  moveErrorResponse,
  parseJsonObject,
  parseVaultPath,
  readJson,
  tailAfter,
  validateFolderMeta,
} from "./shared.ts"

const FOLDERS_PREFIX = "/api/folders/"

export function registerFolders(api: Hono, ctx: ApiContext): void {
  const { deps, fs, writable, exists, guardWrite, saveRevision, saveRevisions, docsUnder, touch } =
    ctx
  const vaultName = deps.vaultName

  api.post("/folders/*", async (context) => {
    const raw = tailAfter(context.req.url, FOLDERS_PREFIX) ?? ""
    if (raw.endsWith("/move")) {
      const path = parseVaultPath(raw.slice(0, -"/move".length), vaultName, false)
      if (!path) return apiError(context, 400, "path_invalid", `path ไม่ปลอดภัย: ${raw}`)
      return moveFolderRoute(context, path)
    }

    const blocked = guardWrite(context)
    if (blocked) return blocked

    const path = parseVaultPath(raw, vaultName, false)
    if (!path) return apiError(context, 400, "path_invalid", `path ไม่ปลอดภัย: ${raw}`)
    if ((await exists(path)) || (await exists(`${path}.md`))) {
      return apiError(context, 409, "already_exists", `มีอยู่แล้ว: ${path}`)
    }

    const body = await readJson(context)
    if (!body) return apiError(context, 400, "invalid_json", "body ต้องเป็น JSON object")

    await writable?.mkdir(path)
    if (body.meta && typeof body.meta === "object" && !Array.isArray(body.meta)) {
      const check = validateFolderMeta(body.meta as Record<string, unknown>)
      if (!check.ok) {
        return apiError(context, 400, "meta_invalid", "folder meta ไม่ผ่าน schema", check.fields)
      }
      await writable?.writeText(
        `${path}/_folder.meta.json`,
        jsonSidecar(body.meta as Record<string, unknown>),
      )
    }
    touch()
    auditLog(context, "folder.create", path)
    return context.json({ ok: true, path }, 201)
  })

  api.patch("/folders/*", async (context) => {
    const blocked = guardWrite(context)
    if (blocked) return blocked

    const path = parseVaultPath(tailAfter(context.req.url, FOLDERS_PREFIX) ?? "", vaultName, false)
    if (!path) return apiError(context, 400, "path_invalid", "path ไม่ปลอดภัย")
    if (!(await exists(path))) return apiError(context, 404, "not_found", `ไม่พบโฟลเดอร์: ${path}`)

    const body = await readJson(context)
    if (!body) return apiError(context, 400, "invalid_json", "body ต้องเป็น JSON object")
    const existing = parseJsonObject(await fs.readText(`${path}/_folder.meta.json`))
    const merged = mergeShallowObjects(existing, body)
    const check = validateFolderMeta(merged)
    if (!check.ok) {
      return apiError(context, 400, "meta_invalid", "folder meta ไม่ผ่าน schema", check.fields)
    }
    await writable?.writeText(`${path}/_folder.meta.json`, jsonSidecar(merged))
    touch()
    auditLog(context, "folder.update", path)
    return context.json({ ok: true, path, meta: merged })
  })

  api.delete("/folders/*", async (context) => {
    const blocked = guardWrite(context)
    if (blocked) return blocked

    const path = parseVaultPath(tailAfter(context.req.url, FOLDERS_PREFIX) ?? "", vaultName, false)
    if (!path) return apiError(context, 400, "path_invalid", "path ไม่ปลอดภัย")
    if (!(await exists(path))) return apiError(context, 404, "not_found", `ไม่พบโฟลเดอร์: ${path}`)

    const recursive = context.req.query("recursive") === "true"
    const entries = await fs.list(path)
    if (entries.length > 0 && !recursive) {
      return apiError(
        context,
        409,
        "folder_not_empty",
        `โฟลเดอร์ไม่ว่าง: ${path} (ใช้ ?recursive=true)`,
      )
    }

    for (const id of await docsUnder(path)) await saveRevision(id)
    const item = await deps.trash.put([path], { label: path, kind: "folder" })
    touch()
    auditLog(context, "folder.delete", path)
    return context.json({ ok: true, path, trash: item })
  })

  async function moveFolderRoute(context: Context, from: string) {
    const blocked = guardWrite(context)
    if (blocked) return blocked
    if (!writable) return apiError(context, 503, "read_only", "vault นี้เปิดแบบอ่านอย่างเดียว")

    const body = await readJson(context)
    if (!body) return apiError(context, 400, "invalid_json", "body ต้องเป็น JSON object")
    if (typeof body.to !== "string") {
      return apiError(context, 400, "invalid_body", "ต้องมี field `to` เป็น string")
    }
    const to = parseVaultPath(body.to, vaultName, false)
    if (!to) return apiError(context, 400, "path_invalid", `path ปลายทางไม่ปลอดภัย: ${body.to}`)

    try {
      const result = await moveFolder(writable, from, to, {
        updateLinks: body.update_links !== false,
        beforeMove: saveRevisions,
      })
      touch()
      auditLog(context, "folder.move", result.from, { to: result.to })
      return context.json({
        ok: true,
        from: result.from,
        to: result.to,
        updated_links: result.updated_links,
      })
    } catch (error) {
      if (error instanceof MoveError) return moveErrorResponse(context, error)
      throw error
    }
  }
}
