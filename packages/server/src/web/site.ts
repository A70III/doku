/** ชื่อแบรนด์ที่แสดงบนหัว sidebar + ชื่อแท็บ — ตั้งด้วย `DOKU_NAME`, ค่าเริ่มต้น "doku" */

const FALLBACK = "doku"

let siteName = FALLBACK

export const setSiteName = (name: string | undefined): void => {
  siteName = name?.trim() || FALLBACK
}

export const getSiteName = (): string => siteName
