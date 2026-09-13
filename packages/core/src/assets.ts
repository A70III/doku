/**
 * Asset resolution — vault path → URL พร้อม cache-bust hash (docs/01 data flow ขั้น 5)
 * `?h=<hash>` = sha256 ของ bytes (ตัด 12 ตัว)
 *
 * + charset ของ "ชื่อไฟล์" asset (docs/06 · docs/08 ข้อ 72) — validator ตัวเดียวที่ใช้
 *   ร่วมกันทั้ง `doku check` · route `/assets/*path` · render · (M4) upload API
 */

import type { VaultFs } from "./fs.ts"
import { shortHash } from "./hash.ts"
import { assetUrl, basenameOf } from "./paths.ts"

/** charset ที่อนุญาตในชื่อไฟล์ asset — a-z A-Z 0-9 `.` `_` `-` ช่องว่าง และอักษรไทย */
const ASSET_NAME_CHARS = /^[a-zA-Z0-9._\-\u0E00-\u0E7F ]+$/

/** คำอธิบาย charset สำหรับ warning/message (ที่เดียว — ไม่ให้ข้อความในแต่ละที่เพี้ยนจากกัน) */
export const ASSET_NAME_RULE = "a-z A-Z 0-9 . _ - ช่องว่าง และอักษรไทย (ต้องมีนามสกุล)"

/**
 * ชื่อไฟล์ asset ปลอดภัยไหม — เช็คเฉพาะ **basename** (โฟลเดอร์ใช้กฎของ vault path)
 *
 * กัน: ตัวอักษรนอก charset · ขึ้นต้น/ลงท้ายด้วย `.` (dotfile) · ไม่มีนามสกุล · ยาวเกิน 255
 * เหตุผล (docs/06): ชื่อไฟล์ต้อง encode เข้า URL ได้ทุก environment โดยไม่ต้องเดา
 * และต้องไม่ชนกับ dotfile/dotfolder ที่ระบบข้ามอยู่แล้ว
 */
export function isSafeAssetName(name: string): boolean {
  if (!name || name.length > 255) return false
  if (!ASSET_NAME_CHARS.test(name)) return false
  if (name.startsWith(".") || name.endsWith(".") || name.endsWith(" ")) return false
  const dot = name.lastIndexOf(".")
  return dot > 0 && dot < name.length - 1
}

/** asset ทั้ง path — vault path ปลอดภัย **และ** ชื่อไฟล์ผ่าน charset */
export function isSafeAssetPath(vaultPath: string): boolean {
  return isSafeAssetName(basenameOf(vaultPath))
}

export interface ResolvedAsset {
  url: string
  exists: boolean
}

export interface AssetResolver {
  resolve(vaultPath: string): Promise<ResolvedAsset>
}

export function createAssetResolver(
  fs: VaultFs,
  cache: Map<string, ResolvedAsset> = new Map(),
): AssetResolver {
  return {
    async resolve(vaultPath: string): Promise<ResolvedAsset> {
      const cached = cache.get(vaultPath)
      if (cached) return cached

      const bytes = await fs.readBytes(vaultPath)
      const resolved: ResolvedAsset = bytes
        ? { url: assetUrl(vaultPath, await shortHash(bytes)), exists: true }
        : { url: assetUrl(vaultPath, "missing"), exists: false }
      cache.set(vaultPath, resolved)
      return resolved
    },
  }
}
