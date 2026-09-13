/**
 * สร้างเนื้อหาหน้า `/styleguide` จาก block registry (docs/03 §9)
 *
 * ใช้ renderer ตัวจริง (renderMarkdown) → สิ่งที่เห็นคือสิ่งที่ผู้เขียนจะได้จริง
 * memoize ไว้เพราะผลลัพธ์คงที่ต่อ rendererVersion
 */

import { BLOCKS, paletteReport, renderMarkdown, type ThemeReport } from "@doku/core"
import type { StyleGuideSection, StyleGuideThemeReport } from "./pages.tsx"

let cached: Promise<StyleGuideSection[]> | null = null
let cachedPalette: ThemeReport[] | null = null

/** คู่สีที่ lock ไว้ (docs/08 ข้อ 47) — คำนวณจาก token จริง ไม่ใช่ค่าที่ copy มา */
export function buildPalette(): StyleGuideThemeReport[] {
  cachedPalette ??= paletteReport()
  return cachedPalette
}

export function buildStyleguide(): Promise<StyleGuideSection[]> {
  cached ??= Promise.all(
    BLOCKS.map(async (block) => {
      const result = await renderMarkdown(block.example, {
        docId: "styleguide",
        highlight: true,
      })
      return {
        name: block.name,
        kind: block.kind,
        syntax: block.example,
        html: result.html,
      }
    }),
  )
  return cached
}
