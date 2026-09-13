/**
 * สัญญาของ token (docs/08 ข้อ 50 · docs/03 §1.4)
 *
 * ทำไมต้องมี: `app.css` เคยอ้าง `var(--d-space-5)` ที่ไม่ถูก define →
 * CSS ทิ้ง declaration ทั้งก้อนเงียบ ๆ → **rail และ panel ทุกตัว `padding: 0`**
 *
 * test นี้จึงเดินทุก source ของ content CSS แล้วยืนยันว่า `var(--…)` ที่อ้าง
 * มี definition จริงในชุดเดียวกัน — และสเกลระยะไม่มี step ที่ขาด/แปลกปลอม
 */

import { describe, expect, test } from "bun:test"
import { BLOCKS_CSS } from "./blocks.ts"
import { PROSE_CSS } from "./prose.ts"
import { TOKENS_CSS } from "./tokens.ts"

const SOURCES: Record<string, string> = {
  tokens: TOKENS_CSS,
  prose: PROSE_CSS,
  blocks: BLOCKS_CSS,
}

const DECLARATION = /(--[a-z0-9-]+)\s*:\s*[^;]+;/gi
const REFERENCE = /var\(\s*(--[a-z0-9-]+)/gi

/** custom property ที่ถูกตั้งจาก *นอก* content CSS — ไม่ต้องมี definition ที่นี่
 *  `--doc-accent` ตั้งโดย server จาก meta.theme.accent (docs/03 §1.2)
 *  `--shiki-*` ตั้งโดย Shiki ผ่าน inline style ของ dual theme (docs/03 §Code block) */
const EXTERNAL = new Set(["--doc-accent", "--shiki-dark", "--shiki-dark-bg"])

function definitions(): Set<string> {
  const found = new Set<string>()
  for (const css of Object.values(SOURCES)) {
    for (const match of css.matchAll(DECLARATION)) found.add(match[1] as string)
  }
  return found
}

function references(): Map<string, string[]> {
  const found = new Map<string, string[]>()
  for (const [name, css] of Object.entries(SOURCES)) {
    for (const match of css.matchAll(REFERENCE)) {
      const token = match[1] as string
      const where = found.get(token) ?? []
      if (!where.includes(name)) where.push(name)
      found.set(token, where)
    }
  }
  return found
}

describe("tokens — สัญญาที่ต้องถือ", () => {
  test("ทุก var() ที่อ้างใน content CSS ถูก define จริง (ไม่มีการทิ้ง declaration เงียบ ๆ)", () => {
    const defined = definitions()
    const missing = [...references()]
      .filter(([token]) => !defined.has(token) && !EXTERNAL.has(token))
      .map(([token, where]) => `${token} (อ้างใน ${where.join(", ")})`)
    expect(missing).toEqual([])
  })

  test("reduced-motion ปิด animation/transition ทั้งหมดของ block (docs/03 §1.5)", () => {
    // quality lock ของ M3.2 Track E: ผู้ใช้ที่ขอ reduced motion ต้องไม่เห็น animation ใด ๆ
    // (shot.ts ตรวจ DOM จริงซ้ำอีกชั้นในโหมด reduce)
    expect(TOKENS_CSS).toContain("@media (prefers-reduced-motion: reduce)")
    expect(TOKENS_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{[^}]*animation: none !important;[^}]*transition: none !important;/,
    )
  })

  test("สเกลระยะมี step ที่ใช้จริงครบ (1–24) ไม่ขาดตัว", () => {
    const defined = definitions()
    const expected = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24]
    const missing = expected.filter((step) => !defined.has(`--d-space-${step}`))
    expect(missing).toEqual([])
  })

  test("ทุก step ของระยะเป็น rem ล้วน (ไม่มี px/em หลุดเข้ามา)", () => {
    const bad: string[] = []
    for (const match of TOKENS_CSS.matchAll(/(--d-space-[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      const value = (match[2] as string).trim()
      if (!/^[\d.]+rem$/.test(value)) bad.push(`${match[1]} = ${value}`)
    }
    expect(bad).toEqual([])
  })

  test("rhythm token derive จากสเกลระยะ (ไม่มีเลขลอย)", () => {
    const rhythm = [
      "--d-flow",
      "--d-flow-loose",
      "--d-rhythm-h2",
      "--d-rhythm-h3",
      "--d-rhythm-h4",
      "--d-rhythm-after",
      "--d-gutter",
    ]
    const bad: string[] = []
    for (const name of rhythm) {
      const match = TOKENS_CSS.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
      const value = (match?.[1] as string | undefined)?.trim()
      if (!value?.startsWith("var(--d-space-")) bad.push(`${name} = ${value ?? "(ไม่พบ)"}`)
    }
    expect(bad).toEqual([])
  })

  test("ทุก hue ของ palette มีคู่ -ink และ semantic (ข้อ 47)", () => {
    const defined = definitions()
    const hues = ["red", "orange", "amber", "yellow", "green", "teal", "blue", "purple"]
    const missing: string[] = []
    for (const hue of hues) {
      for (const suffix of ["", "-ink"]) {
        const token = `--k-${hue}${suffix}`
        if (!defined.has(token)) missing.push(token)
      }
    }
    expect(missing).toEqual([])
  })

  test("weight ที่ใช้ได้คือ 400/600 เท่านั้น (docs/08 ข้อ 48)", () => {
    const offenders = [...`${PROSE_CSS}\n${BLOCKS_CSS}`.matchAll(/font-weight:\s*(\d+)/g)]
      .map((match) => match[1] as string)
      .filter((weight) => weight !== "400" && weight !== "600" && weight !== "bolder")
    expect(offenders).toEqual([])
  })

  test("prose ไม่ใช้ font-size นอกสเกล (rem/clamp/em/token เท่านั้น)", () => {
    const offenders = [...PROSE_CSS.matchAll(/font-size:\s*([^;]+);/g)]
      .map((match) => (match[1] as string).trim())
      .filter((value) => !/^(var\(--|clamp\(|[\d.]+(rem|em|%)|0$)/.test(value))
    expect(offenders).toEqual([])
  })

  test("mark เป็นพื้นเต็มจางสี ไม่ใช่ brush underline (แทนที่ UA background-color + clone ตอนพับบรรทัด)", () => {
    // docs/08 ข้อ 6 — เดิมเป็น brush underline แต่วัดจากการใช้จริงแล้วสีไม่เต็มข้อความจนดูพลาดพาด
    const rule = PROSE_CSS.match(/\.doku-prose \[data-block='mark'\]\s*\{([^}]*)\}/)
    expect(rule?.[1]).toContain("background-color: var(--dk-mapped-bg, var(--d-accent-weak))")
    expect(rule?.[1]).not.toContain("background-image")
    expect(rule?.[1]).toContain("box-decoration-break: clone")
  })

  test("prose ไม่มี hex สีดิบ (ทุกสีมาจาก token)", () => {
    const raw = PROSE_CSS.replace(/--shiki-dark[a-z-]*/g, (m) => m)
    const offenders = [...raw.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0])
    expect(offenders).toEqual([])
  })

  test("block ที่โชว์ข้อความบน tint ใช้ -ink (ไม่ใช้สีอิ่ม)", () => {
    // สีอิ่ม (--dk-color / --dk-mapped-color) สงวนไว้กับ rule · icon · underline · stat-line
    const textParts = [
      "callout-title",
      "stat-value",
      "badge",
      "details-summary",
      "tab-label",
      "step-title",
      "timeline-title",
      "kv-key",
    ]
    const offenders: string[] = []
    for (const part of textParts) {
      const rule = new RegExp(
        `\\[data-part='${part}'\\][^{]*\\{[^}]*color:\\s*var\\(--dk-(?!mapped-ink|ink)\\)`,
      )
      if (rule.test(BLOCKS_CSS)) offenders.push(part)
    }
    expect(offenders).toEqual([])
  })
})
