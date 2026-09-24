/**
 * Move engine — ย้ายเอกสาร/โฟลเดอร์ + อัปเดตลิงก์ทั้ง vault (docs/05 §3 "Move + links")
 *
 * สกัดออกจาก `packages/server/src/api.ts` (M4 slice S1) ให้ logic อยู่ที่เดียวใน `core`
 * — CLI `doku mv` และ MCP `doc_move` เรียกใช้ร่วมกันผ่าน adapter เดียวกัน
 *
 * isomorphic: รับ `WritableVaultFs` adapter — ไม่รู้จัก HTTP / ไม่ผูก `node:fs`
 * · guards ของ server (ETag/`If-Match`, rate limit, `safeJoin`, revision ก่อนเขียน)
 * ยังอยู่ฝั่งผู้เรียก — ส่งผ่านเข้ามาทาง `beforeMove` hook (เรียกหลัง check ผ่าน ก่อนเขียนจริง)
 *
 * พฤติกรรมล็อกโดย test คู่ก่อน refactor: `packages/core/test/move.test.ts`
 */

import type { WritableVaultFs } from "./fs.ts"
import { type MovePlan, planMove, rewriteMarkdownLinks } from "./links.ts"
import { buildDocIndex, walkVault } from "./vault-walk.ts"

export type MoveErrorCode = "not_found" | "already_exists" | "invalid_target"

/** ข้อผิดพลาดที่ move จงใจปฏิเสธ — ผู้เรียก map `code` → status เอง (server: 404/409/400) */
export class MoveError extends Error {
  readonly code: MoveErrorCode
  constructor(code: MoveErrorCode, message: string) {
    super(message)
    this.name = "MoveError"
    this.code = code
  }
}

export interface MoveResult {
  from: string
  to: string
  /** จำนวนไฟล์ที่ถูกเขียนทับเพราะลิงก์ถูกอัปเดต (0 เมื่อ `updateLinks: false`) */
  updated_links: number
}

export interface MoveOptions {
  /** อัปเดตลิงก์ที่ชี้มายัง path ที่ย้าย (default `true` — docs/05 §3) */
  updateLinks?: boolean
  /** เรียกหลัง check ผ่านทุกอย่าง ก่อนเขียนจริง — server ใช้เก็บ revision ตรงนี้ */
  beforeMove?: (targets: readonly string[]) => void | Promise<void>
}

/**
 * ย้ายเอกสาร 1 ตัว (`from`/`to` = path id) พร้อมอัปเดตลิงก์ + เขียน `moved_from`
 * เมตาดาต้าจะย้ายตาม (ไม่มี meta = สร้าง sidecar ใหม่ให้มีแค่ `relations.moved_from`)
 */
export async function moveDoc(
  fs: WritableVaultFs,
  from: string,
  to: string,
  options: MoveOptions = {},
): Promise<MoveResult> {
  if (to === from) throw new MoveError("invalid_target", "ปลายทางเหมือนต้นทาง")
  if (!(await fs.exists(`${from}.md`))) {
    throw new MoveError("not_found", `ไม่พบเอกสาร: ${from}`)
  }
  if (
    (await fs.exists(`${to}.md`)) ||
    (await fs.exists(`${to}.meta.json`)) ||
    (await fs.exists(to))
  ) {
    throw new MoveError("already_exists", `ปลายทางมีอยู่แล้ว: ${to}`)
  }

  const listing = await walkVault(fs)
  const plan = planMove(`${from}.md`, `${to}.md`, listing)

  await options.beforeMove?.([from])

  await fs.move(`${from}.md`, `${to}.md`)
  if (await fs.exists(`${from}.meta.json`)) {
    await fs.move(`${from}.meta.json`, `${to}.meta.json`)
    await appendMovedFrom(fs, to, from)
  } else {
    await fs.writeText(`${to}.meta.json`, jsonSidecar({ relations: { moved_from: [from] } }))
  }

  const updatedLinks = options.updateLinks === false ? 0 : await applyLinkUpdates(fs, plan)
  return { from, to, updated_links: updatedLinks }
}

/**
 * ย้ายโฟลเดอร์ทั้งกิ่ง (`from`/`to` = vault path) — ทุกเอกสารใต้โฟลเดอร์ได้ `moved_from`
 * และลิงก์ทั้ง vault (รวมลิงก์ข้างในเอกสารที่ถูกย้าย) ถูก rebase ตามแผน
 */
export async function moveFolder(
  fs: WritableVaultFs,
  from: string,
  to: string,
  options: MoveOptions = {},
): Promise<MoveResult> {
  if (to === from || to.startsWith(`${from}/`)) {
    throw new MoveError("invalid_target", "ปลายทางไม่ถูกต้อง")
  }
  if (!(await fs.exists(from))) {
    throw new MoveError("not_found", `ไม่พบโฟลเดอร์: ${from}`)
  }
  if ((await fs.exists(to)) || (await fs.exists(`${to}.md`))) {
    throw new MoveError("already_exists", `ปลายทางมีอยู่แล้ว: ${to}`)
  }

  const listing = await walkVault(fs)
  const plan = planMove(from, to, listing)
  const under = listing.docs.filter((id) => id.startsWith(`${from}/`))

  await options.beforeMove?.(under)

  await fs.move(from, to)
  for (const [oldId, newId] of plan.docs) await appendMovedFrom(fs, newId, oldId)

  const updatedLinks = options.updateLinks === false ? 0 : await applyLinkUpdates(fs, plan)
  return { from, to, updated_links: updatedLinks }
}

/** rewrite ลิงก์ใน vault ทั้งหมดตามแผนการย้าย — คืนจำนวนไฟล์ที่แก้ */
async function applyLinkUpdates(fs: WritableVaultFs, plan: MovePlan): Promise<number> {
  const listing = await walkVault(fs)
  const index = buildDocIndex(listing.docs)
  const reverse = new Map([...plan.docs].map(([oldId, newId]) => [newId, oldId]))
  let changed = 0
  for (const newId of listing.docs) {
    const body = await fs.readText(`${newId}.md`)
    if (body === null) continue
    const oldId = reverse.get(newId) ?? newId
    const next = rewriteMarkdownLinks(body, oldId, plan, index, { newDocId: newId })
    if (next !== body) {
      await fs.writeText(`${newId}.md`, next)
      changed += 1
    }
  }
  return changed
}

/** เขียน `relations.moved_from` ลง meta ของเอกสารที่ย้าย (มี meta = ต่อท้าย · ไม่มี = สร้างใหม่) */
async function appendMovedFrom(fs: WritableVaultFs, id: string, from: string): Promise<void> {
  const existing = parseJsonObject(await fs.readText(`${id}.meta.json`))
  const relations = (existing.relations ?? {}) as Record<string, unknown>
  const list = Array.isArray(relations.moved_from) ? (relations.moved_from as string[]) : []
  if (list.includes(from)) return
  await fs.writeText(
    `${id}.meta.json`,
    jsonSidecar({ ...existing, relations: { ...relations, moved_from: [...list, from] } }),
  )
}

function jsonSidecar(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`
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
