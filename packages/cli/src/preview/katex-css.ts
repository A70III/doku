/**
 * KaTeX CSS สำหรับหน้า preview แบบไฟล์เดียว
 *
 * ทำไม inline: `kairn render > out.html` ต้องเปิดได้แบบ offline ไม่พึ่ง CDN
 * (docs/06: ไม่มี CDN ภายนอก) และไม่พึ่งไฟล์ข้าง ๆ
 * → ฝัง woff2 เป็น data URI เฉพาะตัวที่ CSS อ้าง (ตัด woff/ttf fallback ทิ้ง)
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
