/**
 * Asset resolution — vault path → URL พร้อม cache-bust hash (docs/01 data flow ขั้น 5)
 * `?h=<hash>` = sha256 ของ bytes (ตัด 12 ตัว)
 */

import type { VaultFs } from "./fs.ts"
import { shortHash } from "./hash.ts"
import { assetUrl } from "./paths.ts"

export interface ResolvedAsset {
  url: string
  exists: boolean
}

/** ไฟล์วิดีโอ — poster หาเองข้าง ๆ ได้ (docs/08 ข้อ 65) */
export const VIDEO_ASSET = /\.(mp4|webm|mov|m4v|ogv)$/i
/** นามสกุลของ poster ที่ยอมรับ (หาไฟล์ชื่อเดียวกันในโฟลเดอร์เดียวกับวิดีโอ) */
export const POSTER_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "avif"] as const

/**
 * MIME allowlist ของ asset (docs/06) — ต้องตรงกับ route serve `/assets/*` เสมอ (ห้ามกว้างกว่า)
 * upload (`POST /api/docs/*path/assets`) ใช้ตัวนี้ตรวจก่อนเขียนลง vault
 */
const ASSET_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  json: "application/json",
  pdf: "application/pdf",
}

/**
 * ชื่อไฟล์ → mime จาก allowlist — `null` = ไม่อนุญาต
 * extension ต้องมาจาก basename และต้องมี `.` จริง (ไฟล์ชื่อ `png` ไม่กลายเป็น `image/png` — docs/08 ข้อ 46)
 */
export function assetMimeOf(filename: string): string | null {
  const dot = filename.lastIndexOf(".")
  if (dot <= 0) return null
  return ASSET_MIME[filename.slice(dot + 1).toLowerCase()] ?? null
}

/** path ของ poster ที่ renderer จะหาให้เองจาก `src` — คืน [] เมื่อไม่ใช่ไฟล์วิดีโอ */
export function posterCandidates(path: string): string[] {
  if (!VIDEO_ASSET.test(path)) return []
  const base = path.replace(/\.[a-z0-9]+$/i, "")
  return POSTER_EXTENSIONS.map((extension) => `${base}.${extension}`)
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
