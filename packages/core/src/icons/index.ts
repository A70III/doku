/**
 * Icon subsystem — docs/08 ข้อ 34–35
 *
 * - **chrome (TSX)** = inline `<svg>` จาก `iconSvg()` (stroke `currentColor` → รับสีจาก token)
 * - **เนื้อหาเอกสาร (block)** = CSS `mask-image` จาก `iconMaskDataUri()` + `background-color: currentColor`
 *   (ห้าม inline `<svg>` เข้า HTML ที่ผ่าน sanitize — allowlist ไม่มี `svg`/`path`)
 *
 * subset ที่ vendor อยู่ใน `lucide.ts` (generate) · ไม่มี dependency ตอน runtime
 */

import { LUCIDE_ICONS, LUCIDE_VERSION, type LucideIconName } from "./lucide.ts"

export { LUCIDE_ICONS, LUCIDE_VERSION, type LucideIconName }

export const ICON_NAMES = Object.keys(LUCIDE_ICONS) as LucideIconName[]

export function hasIcon(name: string | undefined | null): name is LucideIconName {
  return typeof name === "string" && name in LUCIDE_ICONS
}

export interface IconOptions {
  /** ขนาด (px) — default 16 (chrome) */
  size?: number
  /** ความหนาเส้น — default 1.75 (docs/08 ข้อ 34: 1.5–2) */
  stroke?: number
  /** class เพิ่มเติมบน `<svg>` */
  className?: string
}

/** inline `<svg>` สำหรับ chrome — `stroke="currentColor"` รับสีจาก token */
export function iconSvg(name: LucideIconName, options: IconOptions = {}): string {
  const { size = 16, stroke = 1.75, className } = options
  const classAttr = className ? ` class="${className}"` : ""
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true" focusable="false"${classAttr}>` +
    `${LUCIDE_ICONS[name]}</svg>`
  )
}

const MASK_CACHE = new Map<LucideIconName, string>()

/** data URI สำหรับ CSS `mask-image` — stroke ทึบ (สีมาจาก `background-color: currentColor`) */
export function iconMaskDataUri(name: LucideIconName): string {
  const cached = MASK_CACHE.get(name)
  if (cached) return cached
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' ` +
    `stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${LUCIDE_ICONS[name]}</svg>`
  const uri = `url("data:image/svg+xml,${encodeURIComponent(svg).replaceAll("'", "%27")}")`
  MASK_CACHE.set(name, uri)
  return uri
}

/**
 * CSS ที่ผูก `data-icon="<name>"` เข้ากับ mask — ใช้ทั้ง block และ chrome แบบ mask
 * generate จาก subset เอง (ไม่ต้องมี JS ตอน runtime)
 */
export const ICON_MASK_CSS = ICON_NAMES.map(
  (name) => `[data-icon='${name}']{--dk-icon-mask:${iconMaskDataUri(name)};}`,
).join("\n")
