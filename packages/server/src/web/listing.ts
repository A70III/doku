/**
 * Listing helpers — pure, server-side (M3.5 · plan 3.5.3 date grouping + 3.5.4 sort)
 *
 * ใช้ทั้งหน้าแรก (S2) และ FolderPage (S3): รับ `?sort=` จาก URL ผ่าน `parseSort`
 * แล้วเรียก `sortDocs` + `groupDocsByDate` ก่อน render (SSR-first — URL แชร์ได้)
 *
 * ไม่แตะ DOM · ไม่พึ่ง dependency ใหม่ — pure function ล้วน ทดสอบได้เต็มที่
 */

/** คีย์ sort จาก `?sort=` — whitelist เท่านั้น (ค่าอื่น/ไม่ส่ง → `mtime`) */
export type SortKey = "mtime" | "name" | "size"

type DateGroupKey = "today" | "yesterday" | "week" | "month" | "older"

const DAY_MS = 24 * 60 * 60 * 1000

/** ลำดับ group จากใหม่ไปเก่า — ใช้ตอนเรียงผลของ groupDocsByDate */
const DATE_GROUP_ORDER: readonly DateGroupKey[] = ["today", "yesterday", "week", "month", "older"]

/** อ่าน `?sort=` — นอก whitelist (รวม undefined/null/empty/ตัวพิมพ์ผิด) = `mtime` (newest first) */
export function parseSort(q: string | undefined | null): SortKey {
  if (q === "mtime" || q === "name" || q === "size") return q
  return "mtime"
}

/** label ภาษาไทยของแต่ละ date group */
export const DATE_GROUP_LABELS: Record<DateGroupKey, string> = {
  today: "วันนี้",
  yesterday: "เมื่อวานนี้",
  week: "สัปดาห์ที่ผ่านมา",
  month: "เดือนที่ผ่านมา",
  older: "เก่ากว่า",
}

/**
 * จัด `mtimeMs` เป็น group ตามอายุ — `today` = ปฏิทินวันเดียวกัน (เวลาท้องถิ่น) ·
 * `yesterday` = 1 วันปฏิทิน · `week` ≤ 7 วัน · `month` ≤ 30 วัน · มากกว่านั้น = `older`
 * (mtime จากอนาคต = ถือว่าวันนี้ — clock skew ไม่โยนลง group แปลก ๆ)
 */
export function dateGroupKey(mtimeMs: number, nowMs: number = Date.now()): DateGroupKey {
  const calendarDays = Math.round((startOfLocalDay(nowMs) - startOfLocalDay(mtimeMs)) / DAY_MS)
  if (calendarDays <= 0) return "today"
  if (calendarDays === 1) return "yesterday"
  const ageMs = nowMs - mtimeMs
  if (ageMs <= 7 * DAY_MS) return "week"
  if (ageMs <= 30 * DAY_MS) return "month"
  return "older"
}

/**
 * จัดกลุ่มตาม `dateGroupKey` — คืน array ใหม่เรียงจากใหม่ไปเก่า (today → older) ·
 * group ว่างไม่ถูกคืน · label มาจาก `DATE_GROUP_LABELS` · ลำดับในกลุ่ม = ลำดับ input เดิม
 */
export function groupDocsByDate<T extends { mtimeMs: number }>(
  docs: T[],
  nowMs?: number,
): { key: DateGroupKey; label: string; docs: T[] }[] {
  const now = nowMs ?? Date.now()
  const buckets = new Map<DateGroupKey, T[]>()
  for (const doc of docs) {
    const key = dateGroupKey(doc.mtimeMs, now)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = []
      buckets.set(key, bucket)
    }
    bucket.push(doc)
  }
  const groups: { key: DateGroupKey; label: string; docs: T[] }[] = []
  for (const key of DATE_GROUP_ORDER) {
    const bucket = buckets.get(key)
    if (bucket) groups.push({ key, label: DATE_GROUP_LABELS[key], docs: bucket })
  }
  return groups
}

/**
 * sort รายการ — `mtime` = ใหม่ก่อน (default) · `name` = `title.localeCompare("th")` ·
 * `size` = มากก่อน (bytes) — คืน array ใหม่ ไม่ mutate ของเดิม
 *
 * `name` sort บน `title` เพราะ title = ชื่อที่โชว์ในแถวเอกสาร
 * (ไม่มี meta ใน sidecar → title = ชื่อไฟล์อยู่แล้ว — path = id)
 */
export function sortDocs<T extends { mtimeMs: number; bytes: number; title: string }>(
  docs: T[],
  key: SortKey,
): T[] {
  if (key === "name") return [...docs].sort((a, b) => a.title.localeCompare(b.title, "th"))
  if (key === "size") return [...docs].sort((a, b) => b.bytes - a.bytes)
  return [...docs].sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/** midnight ของวันที่ `ms` ในเวลาท้องถิ่น (คืนเป็น epoch ms) */
function startOfLocalDay(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}
