import { describe, expect, test } from "bun:test"
import { BLOCKS } from "../src/blocks/registry.ts"
import { renderMarkdown } from "../src/render.ts"
import type { Warning } from "../src/types.ts"

/** ทุก block เรียงตาม registry — ใช้เป็นชุดตัวอย่างของ golden test (docs/03 §9) */
const ALL_BLOCKS_MD = BLOCKS.map((block) => `## ${block.name}\n\n${block.example}\n`).join("\n")

describe("blocks registry (M2)", () => {
  test("ทุก block implement แล้ว + มี syntax ตัวอย่าง", () => {
    expect(BLOCKS.length).toBeGreaterThan(0)
    for (const block of BLOCKS) {
      expect(block.implemented).toBe(true)
      expect(block.example.length).toBeGreaterThan(0)
    }
  })

  test("block name ไม่ซ้ำ", () => {
    const names = BLOCKS.map((block) => block.name)
    expect(new Set(names).size).toBe(names.length)
  })

  test("ทุก example render ได้โดยไม่มี block_unknown / block_unimplemented", async () => {
    for (const block of BLOCKS) {
      const warnings: Warning[] = []
      await renderMarkdown(block.example, {
        docId: "styleguide",
        highlight: false,
        warnings,
      })
      const unexpected = warnings.filter(
        (item) => item.code === "block_unknown" || item.code === "block_unimplemented",
      )
      expect(unexpected).toEqual([])
    }
  })

  test("golden snapshot: HTML ของ block ทั้งชุด (highlight off)", async () => {
    const { html, warnings } = await renderMarkdown(ALL_BLOCKS_MD, {
      docId: "golden",
      highlight: false,
    })
    expect(warnings.filter((item) => item.code === "block_unknown")).toEqual([])
    expect(html).toMatchSnapshot()
  })
})
