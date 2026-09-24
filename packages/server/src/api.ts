/**
 * REST API (`/api/*`) — docs/05
 *
 * M3: docs CRUD + move (+auto-update links) · folders CRUD/move · trash (soft-delete)
 *     · revisions list/restore · ETag + `If-Match` → 409 · rate limit (docs/06)
 *
 * หลักการ: route ทุกตัวต้องผ่าน path safety (`normalizeVaultPath`) และ "ไฟล์คือความจริง"
 * ไม่มี state ใน DB — mutate แล้ว `state.invalidate()` + broadcast SSE
 */

import {
  assetMimeOf,
  assetUrl,
  BLOCK_COLORS,
  BLOCKS,
  basenameOf,
  buildDocIndex,
  CALLOUT_TYPES,
  dirnameOf,
  docEtag,
  etagHeader,
  FOLDER_META_KEYS,
  FolderMetaSchema,
  isSafeAssetName,
  isSafeVaultPath,
  isTrashId,
  isWritableVaultFs,
  loadMeta,
  MAX_MD_BYTES,
  META_KNOWN_KEYS,
  type Meta,
  MetaSchema,
  MoveError,
  matchesIfMatch,
  moveDoc,
  moveFolder,
  normalizeVaultPath,
  PathError,
  type RevisionStore,
  renderMarkdown,
  resolveInline,
  sha256Hex,
  type TrashStore,
  type VaultFs,
  type WritableVaultFs,
  walkVault,
} from "@doku/core"
import { type Context, Hono } from "hono"
import { auditLog } from "./audit.ts"
import type { DocRenderer } from "./doc.ts"
import type { SearchIndex } from "./index-db.ts"
import type { SseHub } from "./sse.ts"
import { clampTreeDepth, type VaultState } from "./tree.ts"

export interface ApiDeps {
  fs: VaultFs
  vaultName: string
  state: VaultState
  renderer: DocRenderer
  hub: SseHub
  trash: TrashStore
  revisions: RevisionStore
  /** ปิด write ทั้งหมด (ใช้ใน test/โหมดอ่านอย่างเดียว) */
  readOnly?: boolean
  /** M5: search index สำหรับ `GET /api/search` — ไม่ส่ง = route ตอบ 503 */
  searchIndex?: SearchIndex
}

/* ── errors ──────────────────────────────────────────────────────────── */

export type ApiErrorCode =
  | "not_found"
  | "already_exists"
  | "meta_invalid"
  | "too_large"
  | "conflict"
  | "asset_type_rejected"
  | "folder_not_empty"
  | "path_invalid"
  | "precondition_required"
  | "invalid_body"
  | "invalid_json"
  | "rate_limited"
  | "read_only"
  | "internal_error"

type ApiErrorStatus = 400 | 404 | 409 | 413 | 428 | 429 | 503

export function apiError(
  context: Context,
  status: ApiErrorStatus | 500,
  code: ApiErrorCode,
  message: string,
  fields?: string[],
) {
  const error: { code: ApiErrorCode; message: string; fields?: string[] } = { code, message }
  if (fields && fields.length > 0) error.fields = fields
  return context.json({ ok: false, error }, status)
}

/** map `MoveError` ของ core → HTTP (docs/05 §3: ต้นทางไม่มี = 404 · ปลายทางซ้ำ = 409) */
function moveErrorResponse(context: Context, error: MoveError): Response {
  if (error.code === "not_found") return apiError(context, 404, "not_found", error.message)
  if (error.code === "already_exists") {
    return apiError(context, 409, "already_exists", error.message)
  }
  return apiError(context, 400, "invalid_body", error.message)
}

/* ── rate limit (docs/06) — in-memory, ไม่ต้อง Redis ──────────────────── */

export class RateLimiter {
  #hits = new Map<string, number[]>()

  /** true = ผ่าน · false = เกิน limit */
  check(key: string, limit: number, windowMs = 60_000): boolean {
    const now = Date.now()
    const hits = (this.#hits.get(key) ?? []).filter((at) => now - at < windowMs)
    if (hits.length >= limit) {
      this.#hits.set(key, hits)
      return false
    }
    hits.push(now)
    this.#hits.set(key, hits)
    if (this.#hits.size > 1000) {
      for (const [bucket, times] of this.#hits) {
        if (times.every((at) => now - at >= windowMs)) this.#hits.delete(bucket)
      }
    }
    return true
  }
}

/** limit ตาม docs/06 — write 60/min · render 120/min */
export const RATE_LIMITS = { write: 60, render: 120 } as const

/** ลิมิต asset ตาม docs/05 Agent policy — 25 MB/ไฟล์ · ≤ 20 ไฟล์/คำขอ */
export const ASSET_MAX_BYTES = 25 * 1024 * 1024
export const ASSET_MAX_FILES = 20
/** `NAME_MAX` ของ filesystem (bytes) — ชื่อไฟล์ยาวกว่านี้ validate ผ่านแต่เขียนลง disk จริงไม่ได้ (ENAMETOOLONG) */
const ASSET_NAME_MAX_BYTES = 255

/* ── helpers ─────────────────────────────────────────────────────────── */

function tailAfter(url: string, prefix: string): string | null {
  const path = new URL(url).pathname
  if (!path.startsWith(prefix)) return null
  return path
    .slice(prefix.length)
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    })
    .join("/")
}

function parseVaultPath(raw: string, vaultName: string, stripSuffix = true): string | null {
  try {
    return normalizeVaultPath(raw, { vaultName, stripSuffix })
  } catch (error) {
    if (error instanceof PathError) return null
    throw error
  }
}

async function readJson(context: Context): Promise<Record<string, unknown> | null> {
  let text: string
  try {
    text = await context.req.text()
  } catch {
    return null
  }
  if (text.length > MAX_MD_BYTES + 64 * 1024) return null
  if (text.trim() === "") return {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

interface FieldValidation {
  ok: boolean
  fields: string[]
}

/** ตรวจ meta ที่รับมาจาก API: รู้จักทุก key + ผ่าน MetaSchema */
function validateMetaInput(value: Record<string, unknown>): FieldValidation {
  const fields = Object.keys(value).filter((key) => !META_KNOWN_KEYS.has(key))
  const parsed = MetaSchema.safeParse(value)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fields.push(issue.path.join(".") || "(root)")
  }
  return { ok: fields.length === 0, fields }
}

function validateFolderMeta(value: Record<string, unknown>): FieldValidation {
  const fields = Object.keys(value).filter((key) => !FOLDER_META_KEYS.has(key))
  const parsed = FolderMetaSchema.safeParse(value)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fields.push(issue.path.join(".") || "(root)")
  }
  return { ok: fields.length === 0, fields }
}

/** deep merge 1 ระดับสำหรับ object field ที่รู้จัก (patch ทับเฉพาะ sub-key ที่ส่งมา) */
function mergeShallowObjects(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...existing, ...patch }
  for (const key of ["theme", "render", "relations", "agent"] as const) {
    const incoming = patch[key]
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) continue
    const current = existing[key]
    result[key] = {
      ...(current && typeof current === "object" && !Array.isArray(current) ? current : {}),
      ...(incoming as Record<string, unknown>),
    }
  }
  return result
}

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function jsonSidecar(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/* ── app ─────────────────────────────────────────────────────────────── */

export function createApi(deps: ApiDeps, limiter = new RateLimiter()): Hono {
  const api = new Hono()
  const fs = deps.fs
  const writable = !deps.readOnly && isWritableVaultFs(fs) ? (fs as WritableVaultFs) : null

  const clientKey = (context: Context): string =>
    context.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    context.req.header("x-real-ip") ??
    "lan"

  const touch = (): void => {
    deps.state.invalidate()
    deps.hub.scheduleBroadcast()
  }

  /** มีไฟล์/โฟลเดอร์อยู่ไหม — ใช้ write adapter (ทุก route ที่เรียกถูก guard ด้วย guardWrite แล้ว) */
  const exists = (rel: string): Promise<boolean> => writable?.exists(rel) ?? Promise.resolve(false)

  /** คืน Response เมื่อห้ามเขียน — null = ผ่าน */
  const guardWrite = (context: Context): Response | null => {
    if (!writable) return apiError(context, 503, "read_only", "vault นี้เปิดแบบอ่านอย่างเดียว")
    if (!limiter.check(`write:${clientKey(context)}`, RATE_LIMITS.write)) {
      return apiError(context, 429, "rate_limited", "เขียนถี่เกิน limit (60/min)")
    }
    return null
  }

  const currentEtag = async (
    id: string,
  ): Promise<{ md: string; meta: Meta; etag: string } | null> => {
    const md = await fs.readText(`${id}.md`)
    if (md === null) return null
    const { meta } = await loadMeta(fs, id, null)
    return { md, meta, etag: await docEtag(md, meta) }
  }

  const saveRevision = async (id: string): Promise<void> => {
    const md = await fs.readText(`${id}.md`)
    const meta = await fs.readText(`${id}.meta.json`)
    if (md === null && meta === null) return
    await deps.revisions.save(id, { md, meta })
  }

  /** เก็บ revision ก่อน move จริง — ส่งเข้า core ผ่าน `beforeMove` hook (plan §4 #4) */
  const saveRevisions = async (ids: readonly string[]): Promise<void> => {
    for (const id of ids) await saveRevision(id)
  }

  /** `If-Match` gate ของ PUT/PATCH — คืน Response เมื่อไม่ผ่าน */
  const checkPrecondition = async (
    context: Context,
    id: string,
  ): Promise<{ current: { md: string; meta: Meta; etag: string } } | { response: Response }> => {
    const current = await currentEtag(id)
    if (!current) {
      return { response: apiError(context, 404, "not_found", `ไม่พบเอกสาร: ${id}`) }
    }
    const header = context.req.header("if-match")
    if (!header) {
      return {
        response: apiError(context, 428, "precondition_required", "ต้องส่ง If-Match (ETag ปัจจุบัน)"),
      }
    }
    if (!matchesIfMatch(header, current.etag)) {
      context.header("etag", etagHeader(current.etag))
      return {
        response: apiError(context, 409, "conflict", "เอกสารถูกแก้ไปแล้ว — โหลดใหม่แล้วลองอีกครั้ง"),
      }
    }
    return { current }
  }

  const docsUnder = async (path: string): Promise<string[]> => {
    const { docs } = await walkVault(fs)
    return docs.filter((id) => id.startsWith(`${path}/`))
  }

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
    const raw = tailAfter(context.req.url, "/api/docs/") ?? ""
    const id = parseVaultPath(raw, deps.vaultName)
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
    const raw = tailAfter(context.req.url, "/api/docs/") ?? ""
    if (!raw.endsWith("/assets")) return next()
    const id = parseVaultPath(raw.slice(0, -"/assets".length), deps.vaultName)
    if (!id) return apiError(context, 400, "path_invalid", `path ไม่ปลอดภัย: ${raw}`)
    return uploadAssets(context, id)
  })

  api.post("/docs/*", async (context) => {
    const raw = tailAfter(context.req.url, "/api/docs/") ?? ""
    if (raw.endsWith("/move")) {
      const id = parseVaultPath(raw.slice(0, -"/move".length), deps.vaultName)
      if (!id) return apiError(context, 400, "path_invalid", `path ไม่ปลอดภัย: ${raw}`)
      return moveDocRoute(context, id)
    }

    const blocked = guardWrite(context)
    if (blocked) return blocked

    const id = parseVaultPath(raw, deps.vaultName)
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

    const id = parseVaultPath(tailAfter(context.req.url, "/api/docs/") ?? "", deps.vaultName)
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

    const id = parseVaultPath(tailAfter(context.req.url, "/api/docs/") ?? "", deps.vaultName)
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

    const id = parseVaultPath(tailAfter(context.req.url, "/api/docs/") ?? "", deps.vaultName)
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
    const to = parseVaultPath(body.to, deps.vaultName)
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

  /* ── folders ───────────────────────────────────────────────────────── */

  api.post("/folders/*", async (context) => {
    const raw = tailAfter(context.req.url, "/api/folders/") ?? ""
    if (raw.endsWith("/move")) {
      const path = parseVaultPath(raw.slice(0, -"/move".length), deps.vaultName, false)
      if (!path) return apiError(context, 400, "path_invalid", `path ไม่ปลอดภัย: ${raw}`)
      return moveFolderRoute(context, path)
    }

    const blocked = guardWrite(context)
    if (blocked) return blocked

    const path = parseVaultPath(raw, deps.vaultName, false)
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

    const path = parseVaultPath(
      tailAfter(context.req.url, "/api/folders/") ?? "",
      deps.vaultName,
      false,
    )
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

    const path = parseVaultPath(
      tailAfter(context.req.url, "/api/folders/") ?? "",
      deps.vaultName,
      false,
    )
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
    const to = parseVaultPath(body.to, deps.vaultName, false)
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

  /* ── assets upload / delete + context (M4 · docs/05 §3) ─────────────── */

  /** อัปโหลด asset (multipart) ที่ dispatch มาจาก `POST /docs/*path/assets`
   *
   * - filename ทุกไฟล์ต้องผ่าน charset ของ docs/06 (Q7 → docs/08 ข้อ 74) + ความยาวชื่อ ≤ 255 bytes (NAME_MAX)
   *   + path safety ของ path เต็ม (จับ dotfile อย่าง `.hidden.png`) + mime allowlist ชุดเดียวกับ route serve
   *   `/assets/*` — validate **ครบก่อน**เขียนไฟล์แรก (พลาด = ไม่มีไฟล์หลุดลง disk) · fs error ตอนเขียน = 400 ไม่ใช่ 500
   * - ตำแหน่งเขียน: `<โฟลเดอร์ของเอกสาร>/assets/<filename>` (docs/05 §1)
   * - เขียนทับไฟล์เดิมได้ (put semantics — ตรงกับ MCP `asset_put`) · ผ่าน adapter เดิม (safeJoin + atomic)
   * - ไม่เช็คว่าเอกสารปลายทางมีอยู่ — upload ได้ก่อนเขียนเอกสาร */
  async function uploadAssets(context: Context, id: string): Promise<Response> {
    const blocked = guardWrite(context)
    if (blocked) return blocked

    let form: FormData
    try {
      form = await context.req.formData()
    } catch {
      return apiError(context, 400, "invalid_body", "body ต้องเป็น multipart/form-data")
    }

    const files: File[] = []
    // type ของ `FormData.values()` ในโปรเจกต์นี้ประกาศเป็น `string` อย่างเดียว — ค่าจริงเป็น `string | File` (web standard)
    for (const value of form.values() as Iterable<string | File>) {
      if (typeof value !== "string") files.push(value)
    }
    if (files.length === 0) {
      return apiError(context, 400, "invalid_body", "ไม่มีไฟล์ในคำขอ — ส่งไฟล์ผ่าน multipart field ใดก็ได้")
    }
    if (files.length > ASSET_MAX_FILES) {
      return apiError(context, 400, "invalid_body", `เกินลิมิต ${ASSET_MAX_FILES} ไฟล์/คำขอ (docs/05)`)
    }

    const dir = dirnameOf(id)
    const encoder = new TextEncoder()
    const planned: { file: File; target: string; mime: string }[] = []
    for (const file of files) {
      const name = file.name
      if (!isSafeAssetName(name)) {
        return apiError(
          context,
          400,
          "path_invalid",
          `ชื่อไฟล์ไม่ผ่าน charset ของ asset (docs/06): ${name}`,
        )
      }
      // NAME_MAX ของ filesystem = 255 bytes/ชื่อไฟล์ — ยาวกว่านี้ validate ผ่านได้แต่ตอนเขียนจะโยน ENAMETOOLONG
      if (encoder.encode(name).byteLength > ASSET_NAME_MAX_BYTES) {
        return apiError(
          context,
          400,
          "path_invalid",
          `ชื่อไฟล์ยาวเกิน ${ASSET_NAME_MAX_BYTES} bytes (NAME_MAX ของ filesystem): ${name}`,
        )
      }
      const mime = assetMimeOf(name)
      if (!mime) {
        return apiError(context, 400, "asset_type_rejected", `นามสกุลไม่อยู่ใน allowlist: ${name}`)
      }
      if (file.size > ASSET_MAX_BYTES) {
        return apiError(context, 413, "too_large", `ไฟล์ใหญ่กว่า limit ${ASSET_MAX_BYTES} bytes`)
      }
      const target = dir ? `${dir}/assets/${name}` : `assets/${name}`
      // path เต็มต้องผ่าน path safety ด้วย — ชื่ออย่าง `.hidden.png` ผ่าน charset แต่เป็น dotfile ที่
      // `isSafeVaultPath` ปฏิเสธ → จับตรงนี้ **ก่อนเขียนไฟล์แรก** (plan §4: validate ครบก่อนเขียนเสมอ)
      if (!isSafeVaultPath(target)) {
        return apiError(
          context,
          400,
          "path_invalid",
          `path เป้าหมายไม่ผ่าน path safety (docs/06): ${target}`,
        )
      }
      planned.push({ file, target, mime })
    }

    const assets: { path: string; url: string; bytes: number; content_type: string }[] = []
    try {
      for (const item of planned) {
        const bytes = new Uint8Array(await item.file.arrayBuffer())
        await writable?.writeBytes(item.target, bytes)
        auditLog(context, "asset.upload", item.target)
        assets.push({
          path: item.target,
          // `?h=` ต้องเป็น sha256 เต็ม (64 hex) — serve เทียบกับ hash เต็มของไฟล์จริงก่อนให้ immutable (docs/08 ข้อ 58)
          url: assetUrl(item.target, await sha256Hex(bytes)),
          bytes: bytes.byteLength,
          content_type: item.mime,
        })
      }
    } catch {
      // fs error ที่ validation ไม่ครอบคลุม — route นี้ห้ามยิง 500 → map เป็น 400 ให้ client เห็นสาเหตุ
      return apiError(
        context,
        400,
        "path_invalid",
        "เขียนไฟล์ไม่สำเร็จ — path/ชื่อไฟล์ไม่ถูกต้องบน filesystem",
      )
    }
    touch()
    return context.json({ ok: true, path: id, assets }, 201)
  }

  /** ลบ asset — soft-delete เข้า `.trash/` (`kind: "asset"`) เหมือน doc/folder — invariant 7 ไม่มี route ลบถาวร */
  api.delete("/assets/*", async (context) => {
    const blocked = guardWrite(context)
    if (blocked) return blocked
    const raw = tailAfter(context.req.url, "/api/assets/") ?? ""
    const path = parseVaultPath(raw, deps.vaultName, false)
    if (!path) return apiError(context, 400, "path_invalid", `path ไม่ปลอดภัย: ${raw}`)
    // เฉพาะ path ที่มี segment `assets` ตรง ๆ = asset store (`<โฟลเดอร์>/assets/<file>` รวม `assets/<file>` ระดับ root —
    // ตรงกับตำแหน่งที่ upload เขียน) · อื่น ๆ (sidecar `*.meta.json` / `_folder.meta.json`) ไม่ใช่ asset
    // → เทียบเท่า GET /assets/* = 404 **ก่อนแตะ fs** (ห้ามลบ meta ของเอกสาร/โฟลเดอร์ผ่าน route นี้)
    if (!path.split("/").includes("assets")) {
      return apiError(context, 404, "not_found", `ไม่พบ asset: ${path}`)
    }
    const name = basenameOf(path)
    if (!isSafeAssetName(name)) {
      return apiError(
        context,
        400,
        "path_invalid",
        `ชื่อไฟล์ไม่ผ่าน charset ของ asset (docs/06): ${name}`,
      )
    }
    // ไม่ใช่ชนิดที่ serve ได้ = ไม่ใช่ asset (รวมโฟลเดอร์/path ที่ไม่มี extension) — เทียบเท่า GET /assets/* → 404
    if (!assetMimeOf(name)) return apiError(context, 404, "not_found", `ไม่พบ asset: ${path}`)
    if (!(await exists(path))) return apiError(context, 404, "not_found", `ไม่พบ asset: ${path}`)

    const item = await deps.trash.put([path], { label: path, kind: "asset" })
    touch()
    auditLog(context, "asset.delete", path)
    return context.json({ ok: true, path, trash: item })
  })

  /** `GET /context/*path` — md + meta สรุปสั้นสำหรับใส่ prompt (docs/05 §3) · อ่านอย่างเดียว ไม่ใช้ write limit */
  api.get("/context/*", async (context) => {
    const raw = tailAfter(context.req.url, "/api/context/") ?? ""
    const id = parseVaultPath(raw, deps.vaultName)
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

  /** `GET /api/search?q=&limit=&tag=` — FTS จาก `var/index.db` (M5 · docs/05 §3) · อ่านอย่างเดียว */
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

  /* ── tree / render / trash / revisions ─────────────────────────────── */

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

  api.get("/trash", async (context) => {
    await deps.trash.purge()
    return context.json({ ok: true, items: await deps.trash.list() })
  })

  api.post("/trash/empty", async (context) => {
    // ลบถาวร = คนเท่านั้น — ไม่มี MCP tool นี้ (docs/06) · เว็บยืนยัน 2 ชั้นฝั่ง UI
    const removed = await deps.trash.empty()
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

  api.get("/revisions/*", async (context) => {
    const id = parseVaultPath(tailAfter(context.req.url, "/api/revisions/") ?? "", deps.vaultName)
    if (!id) return apiError(context, 400, "path_invalid", "path ไม่ปลอดภัย")
    return context.json({ ok: true, path: id, items: await deps.revisions.list(id) })
  })

  api.post("/revisions/*", async (context) => {
    const blocked = guardWrite(context)
    if (blocked) return blocked

    const id = parseVaultPath(tailAfter(context.req.url, "/api/revisions/") ?? "", deps.vaultName)
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
    return context.json({ ok: true, path: id, ts: target })
  })

  // error ที่ยังไม่ถูกจับ → ตอบ JSON เสมอ (และ map path-safety error เป็น 400)
  api.onError((error, context) => {
    const message = error instanceof Error ? error.message : String(error)
    if (/symlink|ออกนอก vault|ไม่ปลอดภัย|path escapes/i.test(message)) {
      return apiError(context, 400, "path_invalid", message)
    }
    return apiError(context, 500, "internal_error", "เกิดข้อผิดพลาดภายใน")
  })

  return api
}
