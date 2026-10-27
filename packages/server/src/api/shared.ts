/**
 * REST API — ส่วนที่ใช้ร่วมกันทุก route (docs/05 · docs/06)
 *
 * เก็บ 4 อย่าง:
 * 1. **contract ของ error** — `ApiErrorCode` + `apiError()` (รูป `{ ok: false, error }` ทุก route)
 * 2. **rate limit** — `RateLimiter` ของ write (60/min) และ render (120/min) + เพดาน asset
 * 3. **helper ของ input** — path (`tailAfter`/`parseVaultPath`) · body (`readJson`) · meta (validate/merge/sidecar)
 * 4. **`ApiContext`** — hook ที่ทุก module ใช้ร่วม: write guard (read-only + rate limit), ETag/`If-Match`,
 *    revision ก่อนทับ, `touch()` (invalidate tree + broadcast SSE) และ `docsUnder()` ของ folder delete
 *
 * หลักการ: route module ห้ามประกอบ behavior เหล่านี้เองซ้ำ — เรียกผ่าน `ApiContext` เท่านั้น
 * เพื่อให้สัญญา 428/409/429/503 อยู่ที่เดียว (agent พังทั้งชุดถ้าเพี้ยน)
 */

import {
  docEtag,
  etagHeader,
  FOLDER_META_KEYS,
  FolderMetaSchema,
  isWritableVaultFs,
  loadMeta,
  MAX_MD_BYTES,
  META_KNOWN_KEYS,
  type MediaStore,
  type Meta,
  MetaSchema,
  type MoveError,
  matchesIfMatch,
  mediaStoreOf,
  normalizeVaultPath,
  PathError,
  type RevisionStore,
  type TrashStore,
  type VaultFs,
  type WritableVaultFs,
  walkVault,
} from "@doku/core"
import type { Context } from "hono"
import type { DocRenderer } from "../doc.ts"
import type { SearchIndex } from "../index-db.ts"
import type { SseHub } from "../sse.ts"
import type { VaultState } from "../tree.ts"

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
export function moveErrorResponse(context: Context, error: MoveError): Response {
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
export const ASSET_NAME_MAX_BYTES = 255

/* ── helpers ─────────────────────────────────────────────────────────── */

/** path หลัง prefix จาก URL จริง (decode ทีละ segment — `%2F` ไม่ถูกยุบเป็น `/`) */
export function tailAfter(url: string, prefix: string): string | null {
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

export function parseVaultPath(raw: string, vaultName: string, stripSuffix = true): string | null {
  try {
    return normalizeVaultPath(raw, { vaultName, stripSuffix })
  } catch (error) {
    if (error instanceof PathError) return null
    throw error
  }
}

export async function readJson(context: Context): Promise<Record<string, unknown> | null> {
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

export interface FieldValidation {
  ok: boolean
  fields: string[]
}

/** ตรวจ meta ที่รับมาจาก API: รู้จักทุก key + ผ่าน MetaSchema */
export function validateMetaInput(value: Record<string, unknown>): FieldValidation {
  const fields = Object.keys(value).filter((key) => !META_KNOWN_KEYS.has(key))
  const parsed = MetaSchema.safeParse(value)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fields.push(issue.path.join(".") || "(root)")
  }
  return { ok: fields.length === 0, fields }
}

export function validateFolderMeta(value: Record<string, unknown>): FieldValidation {
  const fields = Object.keys(value).filter((key) => !FOLDER_META_KEYS.has(key))
  const parsed = FolderMetaSchema.safeParse(value)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fields.push(issue.path.join(".") || "(root)")
  }
  return { ok: fields.length === 0, fields }
}

/** deep merge 1 ระดับสำหรับ object field ที่รู้จัก (patch ทับเฉพาะ sub-key ที่ส่งมา) */
export function mergeShallowObjects(
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

export function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function jsonSidecar(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/* ── per-app context (hook ที่ทุก route module ใช้) ───────────────────── */

/** snapshot ของเอกสาร 1 ตัว ณ ตอนอ่าน (md + meta + etag) */
export interface CurrentDoc {
  md: string
  meta: Meta
  etag: string
}

/** ผลของ `If-Match` gate — มี `response` = ไม่ผ่าน (คืนให้ client ทันที) */
export type PreconditionResult = { current: CurrentDoc } | { response: Response }

/** upload handler ของ asset — `POST /docs/*path/assets` (docs.ts) dispatch มาที่นี่ */
export type AssetUploader = (context: Context, id: string) => Promise<Response>

export interface ApiContext {
  deps: ApiDeps
  fs: VaultFs
  /** null = read-only (หรือ adapter ที่เขียนไม่ได้) — ทุก write route ต้องผ่าน `guardWrite` ก่อน */
  writable: WritableVaultFs | null
  /** media store (`.media/`) — null = adapter ไม่รองรับ (upload จะตอบ 503) */
  media: MediaStore | null
  limiter: RateLimiter
  clientKey(context: Context): string
  /** หลัง mutate ทุกครั้ง: invalidate tree + broadcast SSE */
  touch(): void
  /** มีไฟล์/โฟลเดอร์อยู่ไหม — ใช้ write adapter (ทุก route ที่เรียกถูก guard ด้วย guardWrite แล้ว) */
  exists(rel: string): Promise<boolean>
  /** คืน Response เมื่อห้ามเขียน — null = ผ่าน */
  guardWrite(context: Context): Response | null
  currentEtag(id: string): Promise<CurrentDoc | null>
  saveRevision(id: string): Promise<void>
  saveRevisions(ids: readonly string[]): Promise<void>
  /** `If-Match` gate ของ PUT/PATCH — คืน Response เมื่อไม่ผ่าน */
  checkPrecondition(context: Context, id: string): Promise<PreconditionResult>
  docsUnder(path: string): Promise<string[]>
}

export function createApiContext(deps: ApiDeps, limiter: RateLimiter): ApiContext {
  const fs = deps.fs
  const writable = !deps.readOnly && isWritableVaultFs(fs) ? (fs as WritableVaultFs) : null
  const media = mediaStoreOf(fs)

  const clientKey = (context: Context): string =>
    context.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    context.req.header("x-real-ip") ??
    "lan"

  const touch = (): void => {
    deps.state.invalidate()
    deps.hub.scheduleBroadcast()
  }

  const exists = (rel: string): Promise<boolean> => writable?.exists(rel) ?? Promise.resolve(false)

  const guardWrite = (context: Context): Response | null => {
    if (!writable) return apiError(context, 503, "read_only", "vault นี้เปิดแบบอ่านอย่างเดียว")
    if (!limiter.check(`write:${clientKey(context)}`, RATE_LIMITS.write)) {
      return apiError(context, 429, "rate_limited", "เขียนถี่เกิน limit (60/min)")
    }
    return null
  }

  const currentEtag = async (id: string): Promise<CurrentDoc | null> => {
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

  const checkPrecondition = async (context: Context, id: string): Promise<PreconditionResult> => {
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

  return {
    deps,
    fs,
    writable,
    media,
    limiter,
    clientKey,
    touch,
    exists,
    guardWrite,
    currentEtag,
    saveRevision,
    saveRevisions,
    checkPrecondition,
    docsUnder,
  }
}
