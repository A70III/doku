/**
 * REST API — เอกสาร: list/read/create/update/patch/delete + move (docs/05 §3)
 *
 * **ลำดับการ register สำคัญ** (`Hono` รัน handler ตามลำดับที่ลงทะเบียน และ wildcard ตัวบน
 * ที่ไม่เรียก `next()` จะกลืนทุก request ที่ match):
 * 1. `POST /docs/*path/assets` (upload) ต้องมาก่อน `POST /docs/*` ทั่วไป
 * 2. `GET /docs` (list) ต้องมาก่อน `GET /docs/*`
 *
 * ETag/`If-Match` อยู่ที่ `ApiContext.checkPrecondition` — ที่นี่แค่เรียกตามลำดับ
 * (read-only → 503 · rate limit → 429 · ไม่มี If-Match → 428 · ETag ไม่ตรง → 409 + ETag ปัจจุบัน)
 */

import { etagHeader, MAX_MD_BYTES, MoveError, moveDoc } from "@doku/core"
import type { Context, Hono } from "hono"
import { auditLog } from "../audit.ts"
import {
  type ApiContext,
  type AssetUploader,
  apiError,
  jsonSidecar,
  mergeShallowObjects,
  moveErrorResponse,
  parseJsonObject,
  parseVaultPath,
  readJson,
  tailAfter,
  validateMetaInput,
} from "./shared.ts"

const DOCS_PREFIX = "/api/docs/"

export function registerDocs(api: Hono, ctx: ApiContext, uploadAssets: AssetUploader): void {
  const {
    deps,
    fs,
    writable,
    exists,
    guardWrite,
    currentEtag,
    saveRevision,
    saveRevisions,
    checkPrecondition,
    touch,
  } = ctx
  const vaultName = deps.vaultName

  /* ── documents ─────────────────────────────────────────────────────── */

  api.get("/docs", async (context) => {
    const { docs } = await deps.state.get()
    const tag = context.req.query("tag")
    const status = context.req.query("status")
    const query = context.req.query("q")?.toLowerCase()
    const limit = Number.parseInt(context.req.query("limit") ?? "", 10)

    let items = docs
    if (tag) items = items.filter((doc) => doc.tags.includes(tag))
    if (status) items = items.filter((doc) => doc.status === status)
    if (query) {
      items = items.filter(
        (doc) => doc.id.toLowerCase().includes(query) || doc.title.toLowerCase().includes(query),
      )
    }
    items = [...items].sort((a, b) => b.mtimeMs - a.mtimeMs)
    if (Number.isFinite(limit) && limit > 0) items = items.slice(0, limit)

    return context.json({ ok: true, docs: items })
  })

  api.get("/docs/*", async (context) => {
    const raw = tailAfter(context.req.url, DOCS_PREFIX) ?? ""
    const id = parseVaultPath(raw, vaultName)
    if (!id) return apiError(context, 400, "path_invalid", `path ไม่ปลอดภัย: ${raw}`)

    const current = await currentEtag(id)
    if (!current) return apiError(context, 404, "not_found", `ไม่พบเอกสาร: ${id}`)
    context.header("etag", etagHeader(current.etag))

    if (context.req.query("format") === "html") {
      const rendered = await deps.renderer.render(id)
      return context.json({
        ok: true,
        path: id,
        html: rendered.fragment,
        meta: rendered.meta,
        warnings: rendered.warnings,
        etag: current.etag,
      })
    }

    const metaRaw = await fs.readText(`${id}.meta.json`)
    return context.json({
      ok: true,
      path: id,
      md: current.md,
      meta: current.meta,
      meta_raw: metaRaw,
      etag: current.etag,
    })
  })

  /** upload asset — `POST /docs/*path/assets` (docs/05 §3) ต้อง register **ก่อน** generic `POST /docs/*`:
   *  Hono รัน handler ตามลำดับ และตัวล่าง return Response ทันที (ไม่ผ่าน next) */
  api.post("/docs/*", async (context, next) => {
    const raw = tailAfter(context.req.url, DOCS_PREFIX) ?? ""
    if (!raw.endsWith("/assets")) return next()
    const id = parseVaultPath(raw.slice(0, -"/assets".length), vaultName)
    if (!id) return apiError(context, 400, "path_invalid", `path ไม่ปลอดภัย: ${raw}`)
    return uploadAssets(context, id)
  })

  api.post("/docs/*", async (context) => {
    const raw = tailAfter(context.req.url, DOCS_PREFIX) ?? ""
    if (raw.endsWith("/move")) {
      const id = parseVaultPath(raw.slice(0, -"/move".length), vaultName)
      if (!id) return apiError(context, 400, "path_invalid", `path ไม่ปลอดภัย: ${raw}`)
      return moveDocRoute(context, id)
    }

    const blocked = guardWrite(context)
    if (blocked) return blocked

    const id = parseVaultPath(raw, vaultName)
    if (!id) return apiError(context, 400, "path_invalid", `path ไม่ปลอดภัย: ${raw}`)

    const body = await readJson(context)
    if (!body) return apiError(context, 400, "invalid_json", "body ต้องเป็น JSON object")
    if (typeof body.md !== "string") {
      return apiError(context, 400, "invalid_body", "ต้องมี field `md` เป็น string")
    }
    if (new TextEncoder().encode(body.md).byteLength > MAX_MD_BYTES) {
      return apiError(context, 413, "too_large", `md ใหญ่กว่า limit ${MAX_MD_BYTES} bytes`)
    }
    if ((await exists(`${id}.md`)) || (await exists(`${id}.meta.json`)) || (await exists(id))) {
      return apiError(context, 409, "already_exists", `มีอยู่แล้ว: ${id}`)
    }

    let metaPatch: Record<string, unknown> | null = null
    if (body.meta !== undefined && body.meta !== null) {
      if (typeof body.meta !== "object" || Array.isArray(body.meta)) {
        return apiError(context, 400, "meta_invalid", "`meta` ต้องเป็น object", ["meta"])
      }
      metaPatch = body.meta as Record<string, unknown>
      const check = validateMetaInput(metaPatch)
      if (!check.ok) {
        return apiError(context, 400, "meta_invalid", "meta ไม่ผ่าน schema", check.fields)
      }
    }

    await writable?.writeText(`${id}.md`, body.md)
    if (metaPatch) await writable?.writeText(`${id}.meta.json`, jsonSidecar(metaPatch))
    touch()
    const created = await currentEtag(id)
    auditLog(context, "doc.create", id, { etag: created?.etag })
    context.header("etag", etagHeader(created?.etag ?? ""))
    return context.json({ ok: true, path: id, etag: created?.etag ?? "" }, 201)
  })

  api.put("/docs/*", async (context) => {
    const blocked = guardWrite(context)
    if (blocked) return blocked

    const id = parseVaultPath(tailAfter(context.req.url, DOCS_PREFIX) ?? "", vaultName)
    if (!id) return apiError(context, 400, "path_invalid", "path ไม่ปลอดภัย")

    const gate = await checkPrecondition(context, id)
    if ("response" in gate) return gate.response

    const body = await readJson(context)
    if (!body) return apiError(context, 400, "invalid_json", "body ต้องเป็น JSON object")
    if (body.md !== undefined && typeof body.md !== "string") {
      return apiError(context, 400, "invalid_body", "`md` ต้องเป็น string")
    }
    if (
      typeof body.md === "string" &&
      new TextEncoder().encode(body.md).byteLength > MAX_MD_BYTES
    ) {
      return apiError(context, 413, "too_large", `md ใหญ่กว่า limit ${MAX_MD_BYTES} bytes`)
    }
    if ("meta" in body && body.meta !== null) {
      if (typeof body.meta !== "object" || Array.isArray(body.meta)) {
        return apiError(context, 400, "meta_invalid", "`meta` ต้องเป็น object หรือ null", ["meta"])
      }
      const check = validateMetaInput(body.meta as Record<string, unknown>)
      if (!check.ok) {
        return apiError(context, 400, "meta_invalid", "meta ไม่ผ่าน schema", check.fields)
      }
    }

    await saveRevision(id)
    if (typeof body.md === "string") await writable?.writeText(`${id}.md`, body.md)
    if ("meta" in body) {
      if (body.meta === null) await writable?.remove(`${id}.meta.json`)
      else
        await writable?.writeText(
          `${id}.meta.json`,
          jsonSidecar(body.meta as Record<string, unknown>),
        )
    }

    touch()
    const next = await currentEtag(id)
    auditLog(context, "doc.update", id, { etag: next?.etag })
    context.header("etag", etagHeader(next?.etag ?? ""))
    return context.json({ ok: true, path: id, etag: next?.etag ?? "" })
  })

  api.patch("/docs/*", async (context) => {
    const blocked = guardWrite(context)
    if (blocked) return blocked

    const id = parseVaultPath(tailAfter(context.req.url, DOCS_PREFIX) ?? "", vaultName)
    if (!id) return apiError(context, 400, "path_invalid", "path ไม่ปลอดภัย")

    const gate = await checkPrecondition(context, id)
    if ("response" in gate) return gate.response

    const body = await readJson(context)
    if (!body) return apiError(context, 400, "invalid_json", "body ต้องเป็น JSON object")
    if (body.md !== undefined && typeof body.md !== "string") {
      return apiError(context, 400, "invalid_body", "`md` ต้องเป็น string")
    }

    let mergedMeta: Record<string, unknown> | null = null
    if (body.meta !== undefined) {
      if (body.meta === null || typeof body.meta !== "object" || Array.isArray(body.meta)) {
        return apiError(context, 400, "meta_invalid", "`meta` ต้องเป็น object", ["meta"])
      }
      const existing = parseJsonObject(await fs.readText(`${id}.meta.json`))
      mergedMeta = mergeShallowObjects(existing, body.meta as Record<string, unknown>)
      const check = validateMetaInput(mergedMeta)
      if (!check.ok) {
        return apiError(context, 400, "meta_invalid", "meta ไม่ผ่าน schema", check.fields)
      }
    }

    await saveRevision(id)
    if (typeof body.md === "string") await writable?.writeText(`${id}.md`, body.md)
    if (mergedMeta) await writable?.writeText(`${id}.meta.json`, jsonSidecar(mergedMeta))

    touch()
    const next = await currentEtag(id)
    auditLog(context, "doc.update", id, { etag: next?.etag })
    context.header("etag", etagHeader(next?.etag ?? ""))
    return context.json({ ok: true, path: id, etag: next?.etag ?? "" })
  })

  api.delete("/docs/*", async (context) => {
    const blocked = guardWrite(context)
    if (blocked) return blocked

    const id = parseVaultPath(tailAfter(context.req.url, DOCS_PREFIX) ?? "", vaultName)
    if (!id) return apiError(context, 400, "path_invalid", "path ไม่ปลอดภัย")
    if (!(await exists(`${id}.md`))) {
      return apiError(context, 404, "not_found", `ไม่พบเอกสาร: ${id}`)
    }

    await saveRevision(id)
    const item = await deps.trash.put([`${id}.md`, `${id}.meta.json`], { label: id, kind: "doc" })
    touch()
    auditLog(context, "doc.delete", id)
    return context.json({ ok: true, path: id, trash: item })
  })

  async function moveDocRoute(context: Context, id: string) {
    const blocked = guardWrite(context)
    if (blocked) return blocked
    if (!writable) return apiError(context, 503, "read_only", "vault นี้เปิดแบบอ่านอย่างเดียว")

    const body = await readJson(context)
    if (!body) return apiError(context, 400, "invalid_json", "body ต้องเป็น JSON object")
    if (typeof body.to !== "string") {
      return apiError(context, 400, "invalid_body", "ต้องมี field `to` เป็น string")
    }
    const to = parseVaultPath(body.to, vaultName)
    if (!to) return apiError(context, 400, "path_invalid", `path ปลายทางไม่ปลอดภัย: ${body.to}`)

    try {
      const result = await moveDoc(writable, id, to, {
        updateLinks: body.update_links !== false,
        beforeMove: saveRevisions,
      })
      touch()
      auditLog(context, "doc.move", result.from, { to: result.to })
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
