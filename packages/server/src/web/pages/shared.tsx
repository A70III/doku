/** primitives ที่ใช้ร่วมทุกหน้า (Icon + ตัวจัดรูปแบบ) — แยกจาก pages.tsx (ไม่เปลี่ยนพฤติกรรม) */

import { iconSvg, type LucideIconName } from "@doku/core"
import type { FC } from "hono/jsx"

export const Icon: FC<{ name: LucideIconName; size?: number; className?: string }> = ({
  name,
  size = 16,
  className,
}) => (
  <span
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: iconSvg(name, { size }) }}
    {...(className ? { class: className } : {})}
  />
)

/** วันที่แบบคลังเอกสาร — เก็บเป็น absolute เสมอสำหรับ archive (docs/03 §3) */
export function formatDate(mtimeMs: number): string {
  if (!mtimeMs) return ""
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(mtimeMs))
}

export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
