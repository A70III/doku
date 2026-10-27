/** ชื่อแบรนด์ที่แสดงบนหัว sidebar + ชื่อแท็บ — ตั้งด้วย `DOKU_NAME`, ค่าเริ่มต้น "doku" */

const FALLBACK = "doku"

let siteName = FALLBACK

export const setSiteName = (name: string | undefined): void => {
  siteName = name?.trim() || FALLBACK
}

export const getSiteName = (): string => siteName

/** เวอร์ชันของ static asset — เปลี่ยนเมื่อเนื้อหา CSS/JS เปลี่ยน → URL เปลี่ยน → cache immutable ได้ */
let assetVersion = "dev"

export const setAssetVersion = (version: string): void => {
  assetVersion = version.trim() || "dev"
}

export const getAssetVersion = (): string => assetVersion
