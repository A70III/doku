/**
 * KaTeX CSS สำหรับหน้าเว็บ — serve ที่ `/static/katex.css` (browser cache ได้)
 * เนื้อหาเดียวกับ preview ของ CLI (wรอง woff2 เป็น data URI — docs/08 ข้อ 23)
 * หมายเหตุ: โค้ดนี้ซ้ำกับ packages/cli ตั้งใจ — core ห้ามรู้จัก fs/node path และ
 * cli/server ห้าม import กันเอง (ทิศทาง dependency) · M2 ยุบเป็นชุดเดียวได้ถ้าจำเป็น
 */

import { readFile } from "node:fs/promises"
import { dirname } from "node:path"

let cached: string | null = null

export async function loadKatexCss(): Promise<string> {
  if (cached) return cached

  const entry = Bun.resolveSync("katex", import.meta.dir)
  const distDir = dirname(entry)
  const css = await readFile(`${distDir}/katex.min.css`, "utf8")

  const names = new Set(
    [...css.matchAll(/url\(fonts\/([^)]+\.woff2)\)/g)].map((match) => match[1] as string),
  )

  let inlined = css
  for (const name of names) {
    const bytes = await readFile(`${distDir}/fonts/${name}`)
    inlined = inlined.replaceAll(
      `url(fonts/${name})`,
      `url(data:font/woff2;base64,${bytes.toString("base64")})`,
    )
  }

  // ตัด fallback ที่ไฟล์ไม่ได้ฝัง (woff/ttf) — ที่ฝังแล้วคือ woff2
  inlined = inlined.replace(
    /,\s*url\(fonts\/[^)]+\.(?:woff|ttf)\)\s*format\((?:'|")[^)]*(?:'|")\)/g,
    "",
  )

  cached = inlined
  return inlined
}
