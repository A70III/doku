/**
 * `@doku/mcp` — vault ที่เปิด + guard ชุดเดียวกับ REST (plan §4 #4)
 *
 * ทุก tool เขียน vault ผ่าน helper พวกนี้เท่านั้น: path ผ่าน `normalizeVaultPath` (+ `safeJoin`
 * ของ adapter) · write atomic (adapter) · เก็บ revision ก่อนทับ/ย้าย/ลบ · ลบ = soft-delete
 * เข้า `.trash/` — **ไม่มีทางลบถาวรจากฝั่ง agent** (docs/06: ลบถาวร = คนเท่านั้น)
 *
 * meta validate ด้วย `MetaSchema` ของ core เสมอ (Zod = single source)
 * · error vocabulary ใช้ codes ของ docs/05 §3 (ไม่แต่ง code ใหม่)
 */

import { basename, resolve as resolvePath } from "node:path"
import {
  DocNotFoundError,
  docEtag,
  loadMeta,
  MAX_MD_BYTES,
  META_KNOWN_KEYS,
  type Meta,
  MetaSchema,
  MoveError,
  normalizeVaultPath,
  PathError,
  type RevisionStore,
  type TrashStore,
  type WritableVaultFs,
} from "@doku/core"
import { createNodeRevisionStore, createNodeVaultFs, type NodeVaultFs } from "@doku/fs-node"

/** codes ตาม docs/05 §3 "Error format" — ห้ามแต่ง code ใหม่ */
export type ToolErrorCode =
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

/** ข้อผิดพลาดของ tool — จับได้กลาง `callTool` แล้วตอบ `{ok:false, error:{code, message}}` */
export class ToolError extends Error {
  readonly code: ToolErrorCode
  readonly fields?: string[]

  constructor(code: ToolErrorCode, message: string, fields?: string[]) {
    super(message)
    this.name = "ToolError"
    this.code = code
    if (fields && fields.length > 0) this.fields = fields
  }
}

/** adapter ที่ mcp ต้องมี: เขียนได้ + มี trash store ของตัวเอง (NodeVaultFs / MemoryVaultFs ผ่านทั้งคู่) */
export type McpVaultFs = WritableVaultFs & { trashStore(): TrashStore }

export interface McpDeps {
  fs: McpVaultFs
  /** ชื่อโฟลเดอร์ vault — ใช้ตัด prefix ตอนผู้ใช้พิมพ์ `vault/x` มา */
  vaultName: string
  revisions: RevisionStore
  /** var root (`DOKU_VAR ?? "var"`) — audit log ของ MCP ใช้ตำแหน่งเดียวกับ server/CLI */
  varDir: string
}

export interface OpenedMcpVault extends McpDeps {
  fs: NodeVaultFs
  /** absolute path ของ vault root */
  root: string
}

/** เปิด vault จาก env — แบบเดียวกับ CLI: `DOKU_VAULT` (default `vault`) · `DOKU_VAR` (default `var`) */
export async function openMcpVault(env: NodeJS.ProcessEnv = process.env): Promise<OpenedMcpVault> {
  const root = resolvePath(env.DOKU_VAULT ?? "vault")
  const varDir = resolvePath(env.DOKU_VAR ?? "var")
  const fs = await createNodeVaultFs(root)
  const revisions = await createNodeRevisionStore(varDir)
  return { fs, vaultName: basename(root), revisions, varDir, root }
}

/* ── argument helpers (flat inputs ตาม docs/05 §4) ────────────────────── */

export function asArguments(args: unknown): Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new ToolError("invalid_json", "`arguments` ต้องเป็น JSON object")
  }
  return args as Record<string, unknown>
}

export function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== "string") {
    throw new ToolError("invalid_body", `ต้องมี field \`${key}\` เป็น string`)
  }
  return value
}

export function requireEnum<T extends string>(
  args: Record<string, unknown>,
  key: string,
  values: readonly T[],
): T {
  const value = requireString(args, key)
  if (!(values as readonly string[]).includes(value)) {
    throw new ToolError("invalid_body", `\`${key}\` ต้องเป็น ${values.join(" | ")}`)
  }
  return value as T
}

/** field ที่ optional — ไม่ส่ง = undefined · ส่งมาผิดชนิด = `invalid_body` */
export function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    throw new ToolError("invalid_body", `\`${key}\` ต้องเป็น string`)
  }
  return value
}

export function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key]
  if (value === undefined) return undefined
  if (typeof value !== "boolean") {
    throw new ToolError("invalid_body", `\`${key}\` ต้องเป็น boolean`)
  }
  return value
}

/** `meta?` — ไม่ส่ง = undefined · ส่ง null/array/primitive = `meta_invalid` (แบบ REST) */
export function optionalMeta(args: Record<string, unknown>): Record<string, unknown> | undefined {
  const value = args.meta
  if (value === undefined) return undefined
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolError("meta_invalid", "`meta` ต้องเป็น object", ["meta"])
  }
  return value as Record<string, unknown>
}

/* ── path + meta guards (mirror `packages/server/src/api.ts`) ──────────── */

/** path จากคน/agent → path id สะอาด — `PathError` ของ core = `path_invalid` */
export function docPath(deps: McpDeps, raw: string, stripSuffix = true): string {
  try {
    return normalizeVaultPath(raw, { vaultName: deps.vaultName, stripSuffix })
  } catch (error) {
    if (error instanceof PathError) throw new ToolError("path_invalid", error.message)
    throw error
  }
}

/** meta ต้องรู้จักทุก key + ผ่าน `MetaSchema` (แบบ `validateMetaInput` ใน api.ts) */
export function validateMeta(value: Record<string, unknown>): void {
  const fields = Object.keys(value).filter((key) => !META_KNOWN_KEYS.has(key))
  const parsed = MetaSchema.safeParse(value)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fields.push(issue.path.join(".") || "(root)")
  }
  if (fields.length > 0) throw new ToolError("meta_invalid", "meta ไม่ผ่าน schema", fields)
}

export function jsonSidecar(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
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

/** deep merge 1 ระดับของ object field ที่รู้จัก — patch ทับเฉพาะ sub-key ที่ส่งมา (แบบ api.ts) */
export function mergeShallowObjects(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...existing, ...patch }
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

/* ── etag + revision (ก่อนทับทุกครั้ง — docs/05 agent policy) ──────────── */

export async function currentEtag(
  deps: McpDeps,
  id: string,
): Promise<{ md: string; meta: Meta; etag: string } | null> {
  const md = await deps.fs.readText(`${id}.md`)
  if (md === null) return null
  const { meta } = await loadMeta(deps.fs, id, null)
  return { md, meta, etag: await docEtag(md, meta) }
}

export async function saveRevision(deps: McpDeps, id: string): Promise<void> {
  const md = await deps.fs.readText(`${id}.md`)
  const meta = await deps.fs.readText(`${id}.meta.json`)
  if (md === null && meta === null) return
  await deps.revisions.save(id, { md, meta })
}

/** ก่อน move — ส่งเป็น `beforeMove` hook ให้ core (plan §4 #4) */
export async function saveRevisions(deps: McpDeps, ids: readonly string[]): Promise<void> {
  for (const id of ids) await saveRevision(deps, id)
}

/** md เกิน limit 5 MB (docs/05) = เขียนไม่ได้ */
export function ensureMdSize(md: string): void {
  const bytes = new TextEncoder().encode(md).byteLength
  if (bytes > MAX_MD_BYTES) {
    throw new ToolError("too_large", `md ใหญ่กว่า limit ${MAX_MD_BYTES} bytes`)
  }
}

/**
 * error ที่หลุดจาก tool → `ToolError`
 * - `DocNotFoundError`/`PathError`/`MoveError` ของ core map ตามความหมายเดียวกับ REST
 * - ข้อความเรื่อง path safety ของ adapter (`safeJoin`/realpath) = `path_invalid`
 * - ที่เหลือ = `internal_error` (รายละเอียดจริง goes to stderr เท่านั้น)
 */
export function toToolError(error: unknown): ToolError {
  if (error instanceof ToolError) return error
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof DocNotFoundError) return new ToolError("not_found", message)
  if (error instanceof PathError) return new ToolError("path_invalid", message)
  if (error instanceof MoveError) {
    const code: ToolErrorCode =
      error.code === "not_found"
        ? "not_found"
        : error.code === "already_exists"
          ? "already_exists"
          : "invalid_body"
    return new ToolError(code, message)
  }
  if (/symlink|ออกนอก vault|ไม่ปลอดภัย|path escapes/i.test(message)) {
    return new ToolError("path_invalid", message)
  }
  return new ToolError("internal_error", message)
}
