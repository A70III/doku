/**
 * Media store — ไฟล์ content-addressed ใน `.media/` (docs/08 ข้อ 88)
 *
 * ทำไมต้องมี interface: `.media` เป็น dotfolder ซึ่ง `isSafeVaultPath` ปฏิเสธ (กัน dotfile หลุด vault)
 * → adapter แต่ละตัวเปิดช่องทางแคบ ๆ ของตัวเอง: ชื่อต้องเป็น `<sha256>.<ext>` เท่านั้น
 * (ไม่มี path ให้ traverse, ไม่มีชื่อที่ผู้ใช้ตั้ง) · tree/watcher/index ข้าม dotfolder อยู่แล้ว
 *
 * ไฟล์ไม่ผูกกับเอกสาร: ลบโน้ตแล้วรูปไม่หาย และรูปเดียวกันเก็บครั้งเดียว (key = sha256 ของ bytes)
 */

import type { VaultFs } from "./fs.ts"

/** โฟลเดอร์เก็บ media ที่ root ของ vault (dotfolder — tree/watcher/index ข้าม) */
export const MEDIA_DIR = ".media"

/** ชื่อไฟล์ที่ยอมรับ: sha256 เต็ม 64 hex + นามสกุลสั้น ๆ จาก allowlist */
export const MEDIA_NAME = /^[a-f0-9]{64}\.[a-z0-9]{2,5}$/

export interface MediaStore {
  /** คืน null ถ้าไม่มีไฟล์/ชื่อไม่ถูกต้อง */
  read(name: string): Promise<Uint8Array | null>
  has(name: string): Promise<boolean>
  /** เขียนทับได้ (content-addressed → เนื้อหาเดิมอยู่แล้วไม่ต้องเขียน) */
  write(name: string, bytes: Uint8Array): Promise<void>
}

/** ชื่อไฟล์จาก hash + นามสกุล (lowercase) */
export function mediaName(hash: string, extension: string): string {
  return `${hash}.${extension.toLowerCase()}`
}

/** URL ของ media — route `/media/:name` (cache immutable ได้เพราะชื่อ = hash) */
export function mediaUrl(name: string): string {
  return `/media/${name}`
}

/**
 * ดึง media store จาก adapter (node/memory มีให้; adapter อื่นอาจไม่มี)
 * ใช้ type guard เพื่อไม่ผูก `VaultFs` กับ implementation
 */
export function mediaStoreOf(fs: VaultFs): MediaStore | null {
  const candidate = fs as VaultFs & { mediaStore?: () => MediaStore }
  if (typeof candidate.mediaStore !== "function") return null
  return candidate.mediaStore()
}
