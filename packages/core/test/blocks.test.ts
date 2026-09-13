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

/** render + เก็บ warning (รูปแบบเดียวกับ render.test.ts) */
async function renderWithWarnings(md: string, docId: string) {
  const warnings: Warning[] = []
  const result = await renderMarkdown(md, { docId, highlight: false, warnings })
  return { ...result, warnings }
}

describe("regression: block ต้องไม่ทำเนื้อหาผู้เขียนหาย (M3.1)", () => {
  test("::::tabs — element ที่ไม่ใช่ :::tab ต้องไม่แย่ง panel และไม่ถูกทิ้ง", async () => {
    const { html, warnings } = await renderWithWarnings(
      '::::tabs\n:::tab{label="A"}\nAAA\n:::\n\nข้อความกลาง\n\n:::tab{label="B"}\nBBB\n:::\n::::\n',
      "doc",
    )
    expect(html).toContain("AAA")
    expect(html).toContain("BBB") // เดิมหายทั้งก้อน
    expect(html).toContain("ข้อความกลาง") // เดิมกลายเป็น panel ของ tab B
    const panelB = html.split('aria-label="B"')[1] ?? ""
    expect(panelB).toContain("BBB")
    expect(html.match(/data-part="tab-button"/g)?.length).toBe(2)
    expect(warnings.some((item) => item.code === "block_stray_child")).toBe(true)
  })

  test("::::tabs — ข้อความหลัง tab สุดท้ายต้องไม่หาย", async () => {
    const { html, warnings } = await renderWithWarnings(
      '::::tabs\n:::tab{label="A"}\nAAA\n:::\n\nfooter\n::::\n',
      "doc",
    )
    expect(html).toContain("AAA")
    expect(html).toContain("footer")
    expect(warnings.some((item) => item.code === "block_stray_child")).toBe(true)
  })

  test("::::tabs — ปกติ (มีแต่ :::tab) ต้องไม่มี warning", async () => {
    const { warnings } = await renderWithWarnings(
      '::::tabs\n:::tab{label="A"}\nAAA\n:::\n:::tab{label="B"}\nBBB\n:::\n::::\n',
      "doc",
    )
    expect(warnings.filter((item) => item.code === "block_stray_child")).toEqual([])
  })

  test(":::card href — `.md#anchor` ต้อง resolve relative เหมือนลิงก์ md", async () => {
    const { html } = await renderWithWarnings(
      ':::card{href="design.md#top"}\nbody\n:::\n',
      "sub/page",
    )
    expect(html).toContain('href="/d/sub/design#top"') // เดิมได้ /d/design.md#top (ผิดเอกสาร)
    // path id / ลิงก์ในเว็บ ยังเหมือนเดิม
    const idForm = await renderWithWarnings(
      ':::card{href="projects/doku/design"}\n:::\n',
      "sub/page",
    )
    expect(idForm.html).toContain('href="/d/projects/doku/design"')
    const webForm = await renderWithWarnings(':::card{href="/d/other"}\n:::\n', "sub/page")
    expect(webForm.html).toContain('href="/d/other"')
  })

  test(":::motion once — ใช้ semantics flag กลาง (ไม่ระบุ = true)", async () => {
    const once = async (attrs: string) =>
      (await renderWithWarnings(`:::motion${attrs}\nbody\n:::\n`, "doc")).html.match(
        /data-once="([^"]*)"/,
      )?.[1]
    expect(await once("")).toBe("true")
    expect(await once("{once=true}")).toBe("true")
    expect(await once("{once=1}")).toBe("true")
    expect(await once("{once=false}")).toBe("false")
    expect(await once("{once=0}")).toBe("false") // เดิมได้ "true"
    expect(await once("{once=no}")).toBe("false") // เดิมได้ "true"
  })
})
