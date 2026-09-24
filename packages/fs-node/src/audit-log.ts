/**
 * audit log — append-only JSONL ที่ `var/audit.log` (docs/06 "Audit log")
 *
 * อยู่ที่ `@doku/fs-node` (var-side store แบบ `revisions`/`search-index`) เพื่อให้ **ทุก write
 * channel ใช้ที่เดียวกัน**: REST (server เรียก `auditLog` ที่ `server/src/audit.ts` ซึ่งห่อ
 * ตัวนี้ด้วย actor/ip จาก request) · MCP (actor `mcp`) · CLI (actor `cli`) — ทิศทาง dependency:
 * cli/server/mcp → fs-node เท่านั้น
 *
 * - **append เท่านั้น** — ไม่มี export ที่ truncate/purge/rotate (ลบ/ล้าง = คนจัดการไฟล์เองข้างนอก)
 * - var root = `DOKU_VAR ?? "var"` (หรือส่ง `varDir` มากดทับ ให้ตรงกับ `--var` ของ CLI) —
 *   ตำแหน่งเดียวกับ `var/revisions` และ `var/index.db`
 * - best-effort ทั้งก้อน: ล้มเหลว = stderr note แล้วเมิน — **ห้าม throw เข้า request path**
 *   (audit พังต้องไม่ทำให้ write พัง)
 */

import { appendFileSync, mkdirSync } from "node:fs"
import { dirname, resolve as resolvePath } from "node:path"

/** record 1 บรรทัด — รูปทรงตาม docs/06: `ts` `actor` `action` `path` + optional `etag`/`ip`/`to` */
export interface AuditRecord {
  /** ไม่ส่ง = เติมเวลาตอนเรียก (ISO) */
  ts?: string
  /** ค่าที่รู้ได้จริงจาก channel — server = `web`/หัว UA/`lan` · MCP = `mcp` · CLI = `cli` (ไม่แต่ง identity) */
  actor: string
  action: string
  path: string
  /** ETag หลังเขียน (มีเฉพาะ doc create/update — ค่าเดียวกับที่ response คืน) */
  etag?: string
  /** มาจริงจาก proxy header เท่านั้น (server เท่านั้น) — ไม่มี = ไม่ใส่ */
  ip?: string
  /** ปลายทางของ move */
  to?: string
}

/** ตำแหน่งไฟล์ — var root เดียวกับ `var/revisions` (`DOKU_VAR ?? "var"` · ฝั่ง CLI มี `--var`) */
export function auditLogPath(varDir = process.env.DOKU_VAR ?? "var"): string {
  return resolvePath(varDir, "audit.log")
}

/** dir ที่เตรียมแล้ว — key = path เต็ม (กัน mkdir ทุกครั้ง และรองรับ varDir ที่เปลี่ยนระหว่าง test) */
const preparedDirs = new Set<string>()

/**
 * append 1 บรรทัด — ทั้งฟังก์ชันเป็น best-effort: ล้มเหลว = stderr note แล้วคืน ห้าม throw ออกมา
 * `varDir` ไม่ส่ง = ใช้ `DOKU_VAR ?? "var"` (ตรงกับที่ server/CLI เปิด)
 */
export function logAudit(record: AuditRecord, varDir = process.env.DOKU_VAR ?? "var"): void {
  const file = auditLogPath(varDir)
  try {
    if (!preparedDirs.has(file)) {
      mkdirSync(dirname(file), { recursive: true })
      preparedDirs.add(file)
    }
    // appendFileSync = เขียนต่อท้าย + flush ก่อนคืน + newline ปิดท้ายเสมอ → บรรทัดไม่ขาดกลางตอนอ่าน
    const entry = record.ts ? record : { ts: new Date().toISOString(), ...record }
    appendFileSync(file, `${JSON.stringify(entry)}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`audit: append ไม่สำเร็จ (ข้ามต่อ — write ไม่กระทบ): ${file}: ${message}\n`)
  }
}
