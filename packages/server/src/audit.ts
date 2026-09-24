/**
 * audit log (docs/06 "Audit log") — append-only JSONL ที่ `var/audit.log`
 *
 * - **server เป็นคนเขียน**: ทุก write op ใน `api.ts` เรียก `auditLog(...)` 1 ครั้ง = 1 บรรทัด
 *   · `doku audit` (CLI) อ่านอย่างเดียว — **ไม่มี route/flag ตัวไหนตัดหรือล้าง log ได้**
 *   (การลบไฟล์ = คนจัดการเองข้างนอก ไม่ผ่านระบบ)
 * - var root resolve แบบเดียวกับ `var/revisions` ใน `src/index.ts` (`DOKU_VAR ?? "var"`) →
 *   writer (server) กับ reader (`doku audit`) เห็นไฟล์เดียวกันทั้ง dev/serve/test
 * - flush-safe + best-effort: ล้มเหลว = จด note ลง stderr แล้วเมิน — **ห้าม throw เข้า request path**
 *   (audit พังต้องไม่ทำให้ write พัง)
 * - `actor` = ค่าที่รู้ได้จริงจาก request (LAN ไม่มี auth — ห้ามแต่ง token/identity ขึ้นเอง):
 *   browser = `web` · agent/CLI = หัวของ User-Agent (เช่น `curl/8.5.0` → `curl`) · ไม่มี UA = `lan`
 * - `ip` มีเฉพาะเมื่อมาจริงจาก `x-forwarded-for`/`x-real-ip` — ไม่มี header = ไม่ใส่ field (ไม่เดา)
 */
import { appendFileSync, mkdirSync } from "node:fs"
import { dirname, resolve as resolvePath } from "node:path"
import type { Context } from "hono"

/** action ที่ log ได้ — ครอบคลุมทุก write op ของ `api.ts` (docs/06: doc/folder/asset) */
export type AuditAction =
  | "doc.create"
  | "doc.update"
  | "doc.delete"
  | "doc.move"
  | "doc.restore"
  | "folder.create"
  | "folder.update"
  | "folder.move"
  | "folder.delete"
  | "folder.restore"
  | "asset.upload"
  | "asset.delete"
  | "asset.restore"

/** entry 1 บรรทัด — รูปทรงตาม docs/06: `ts` `actor` `action` `path` + optional `etag`/`ip`/`to` */
export interface AuditEntry {
  ts: string
  actor: string
  action: AuditAction
  path: string
  /** ETag หลังเขียน (มีเฉพาะ doc create/update — ค่าเดียวกับที่ response คืน) */
  etag?: string
  /** มาจริงจาก proxy header เท่านั้น — ไม่มี = ไม่ใส่ (ไม่เดา address) */
  ip?: string
  /** ปลายทางของ move (มีเฉพาะ action ที่เป็น move) */
  to?: string
}

/** ตำแหน่งไฟล์ — var root เดียวกับ `var/revisions` (`DOKU_VAR ?? "var"` · ฝั่ง CLI มี `--var`) */
export function auditLogPath(varDir = process.env.DOKU_VAR ?? "var"): string {
  return resolvePath(varDir, "audit.log")
}

/** dir ที่เตรียมแล้ว — key = path เต็ม (กัน mkdir ทุก write และรองรับ DOKU_VAR ที่เปลี่ยนระหว่าง test) */
const preparedDirs = new Set<string>()

/** append 1 บรรทัด — ทั้งฟังก์ชันเป็น best-effort: ล้มเหลว = stderr note แล้วคืน ห้าม throw ออกมา */
function appendLine(entry: AuditEntry): void {
  const file = auditLogPath()
  try {
    if (!preparedDirs.has(file)) {
      mkdirSync(dirname(file), { recursive: true })
      preparedDirs.add(file)
    }
    // appendFileSync = เขียนต่อท้าย + flush ก่อนคืน + newline ปิดท้ายเสมอ → บรรทัดไม่ขาดกลางตอนอ่าน
    appendFileSync(file, `${JSON.stringify(entry)}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`audit: append ไม่สำเร็จ (ข้ามต่อ — write ไม่กระทบ): ${file}: ${message}\n`)
  }
}

/** ip ที่มาจริงจาก proxy header เท่านั้น — ไม่มี header = ไม่ใส่ field */
function ipOf(context: Context): string | undefined {
  const forwarded = context.req.header("x-forwarded-for")?.split(",")[0]?.trim()
  const real = context.req.header("x-real-ip")?.trim()
  const ip = forwarded || real
  return ip ? ip.slice(0, 64) : undefined
}

/**
 * actor ที่รู้ได้จริงจาก request — LAN ไม่มี auth จึงไม่มี identity ให้คิดขึ้นเอง:
 * browser (UA เริ่ม `Mozilla/`) = `web` · agent/CLI = หัว UA (`curl/8.5.0` → `curl`) · ไม่มี UA = `lan`
 */
function actorOf(context: Context): string {
  const ua = context.req.header("user-agent")?.trim()
  if (!ua) return "lan"
  if (ua.startsWith("Mozilla/")) return "web"
  const head = ua.split(/[\s/]/)[0]
  return head ? head.slice(0, 64) : "lan"
}

/**
 * เรียกจาก handler ใน `api.ts` **หลังเขียนสำเร็จ** — 1 call = 1 บรรทัดใน `var/audit.log`
 * `extra.etag` = ค่าหลังเขียน (doc create/update เท่านั้นที่มี) · `extra.to` = ปลายทางของ move
 */
export function auditLog(
  context: Context,
  action: AuditAction,
  path: string,
  extra: { etag?: string; to?: string } = {},
): void {
  const entry: AuditEntry = {
    ts: new Date().toISOString(),
    actor: actorOf(context),
    action,
    path,
  }
  if (extra.etag) entry.etag = extra.etag
  if (extra.to) entry.to = extra.to
  const ip = ipOf(context)
  if (ip) entry.ip = ip
  appendLine(entry)
}
