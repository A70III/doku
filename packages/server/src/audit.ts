/**
 * audit hook ฝั่ง server (docs/06 "Audit log") — ห่อ `logAudit` ของ `@doku/fs-node` ด้วย
 * actor/ip ที่รู้ได้จริงจาก request · writer ตัวจริงอยู่ที่ `packages/fs-node/src/audit-log.ts`
 * ซึ่งทุก channel ใช้ร่วมกัน: REST (ที่นี่) · MCP (actor `mcp`) · CLI (actor `cli`) —
 * **append เท่านั้น ไม่มี route/flag ที่ truncate/purge ได้** (ลบ = คนจัดการไฟล์เองข้างนอก)
 *
 * - `actor` = ค่าที่รู้ได้จริงจาก request (LAN ไม่มี auth — ห้ามแต่ง token/identity ขึ้นเอง):
 *   browser = `web` · agent = หัวของ User-Agent (เช่น `curl/8.5.0` → `curl`) · ไม่มี UA = `lan`
 * - `ip` มีเฉพาะเมื่อมาจริงจาก `x-forwarded-for`/`x-real-ip` — ไม่มี header = ไม่ใส่ field (ไม่เดา)
 * - ทุก call = 1 บรรทัด **หลังเขียนสำเร็จ** · log ล้มเหลว = stderr note (best-effort) —
 *   audit พังต้องไม่ทำให้ write พัง
 */
import { auditLogPath, logAudit } from "@doku/fs-node"
import type { Context } from "hono"

export { auditLogPath }

/** action ของ REST hooks — ครบทุก write op ใน `api.ts` (docs/06: doc/folder/asset/trash) */
export type AuditAction =
  | "doc.create"
  | "doc.update"
  | "doc.delete"
  | "doc.move"
  | "doc.restore"
  | "doc.revision_restore"
  | "doc.purge"
  | "folder.create"
  | "folder.update"
  | "folder.move"
  | "folder.delete"
  | "folder.restore"
  | "folder.purge"
  | "asset.upload"
  | "asset.delete"
  | "asset.restore"
  | "asset.purge"

/** ip ที่มาจริงจาก proxy header เท่านั้น — ไม่มี header = ไม่ใส่ field */
function ipOf(context: Context): string | undefined {
  const forwarded = context.req.header("x-forwarded-for")?.split(",")[0]?.trim()
  const real = context.req.header("x-real-ip")?.trim()
  const ip = forwarded || real
  return ip ? ip.slice(0, 64) : undefined
}

/**
 * actor ที่รู้ได้จริงจาก request — LAN ไม่มี auth จึงไม่มี identity ให้คิดขึ้นเอง:
 * browser (UA เริ่ม `Mozilla/`) = `web` · agent = หัว UA (`curl/8.5.0` → `curl`) · ไม่มี UA = `lan`
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
  const ip = ipOf(context)
  logAudit({
    actor: actorOf(context),
    action,
    path,
    etag: extra.etag,
    to: extra.to,
    ip,
  })
}
