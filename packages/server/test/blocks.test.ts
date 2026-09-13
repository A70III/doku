import { describe, expect, test } from "bun:test"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { EditorState } from "@codemirror/state"
import {
  type BlockInfo,
  blockAt,
  blockText,
  computeBlocks,
  deleteBlock,
  directiveTitle,
  duplicateBlock,
  indentBlock,
  moveBlock,
  moveBlockTo,
  outdentBlock,
  percentAttr,
  statTiles,
  turnIntoBlock,
} from "../src/web/editor/blocks.ts"

/**
 * M3.2 Track C — block model (docs/09 §3.2 · docs/08 ข้อ 64)
 * block = line range คำนวณสดจาก Lezer + fence scan · operation ทั้งหมดเขียนกลับเป็น markdown
 */

function blocks(md: string): BlockInfo[] {
  const state = EditorState.create({
    doc: md,
    extensions: [markdown({ base: markdownLanguage })],
  })
  return computeBlocks(state, 0, md.length)
}

const MD = [
  "# หัวเรื่อง",
  "",
  "ย่อหน้าแรก",
  "ต่อเนื่อง",
  "",
  "- ข้อหนึ่ง",
  "  - ข้อซ้อน",
  "- ข้อสอง",
  "",
  "> อ้าง",
  "",
  "```ts",
  "const a = 1",
  "```",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "---",
  "",
  ':::note{title="x"}',
  "ในกล่อง",
  ":::",
  "",
  "![รูป](a.png)",
  "",
].join("\n")

describe("computeBlocks", () => {
  const list = blocks(MD)

  test("รู้จัก kind หลักทั้งหมด", () => {
    const kinds = list.map((b) => b.kind)
    for (const kind of [
      "heading",
      "paragraph",
      "listItem",
      "code",
      "table",
      "directive",
      "hr",
      "image",
      "blockquote",
    ] as const) {
      expect(kinds).toContain(kind)
    }
  })

  test("paragraph รวมบรรทัดต่อเนื่องเป็น block เดียว", () => {
    const paragraph = list.find((b) => b.kind === "paragraph")
    expect(paragraph).toBeDefined()
    expect(blockText(MD, paragraph as BlockInfo)).toBe("ย่อหน้าแรก\nต่อเนื่อง")
  })

  test("listItem แยกต่อ item + depth จาก indent", () => {
    const items = list.filter((b) => b.kind === "listItem")
    expect(items.map((b) => b.depth)).toEqual([0, 1, 0])
    expect(items.map((b) => blockText(MD, b))).toEqual([
      "- ข้อหนึ่ง\n  - ข้อซ้อน",
      "  - ข้อซ้อน",
      "- ข้อสอง",
    ])
    expect(blockText(MD, items[1] as BlockInfo)).toBe("  - ข้อซ้อน")
    // item ครอบลูกไว้ (Notion rule: เลือก parent = เลือกลูกทั้งหมด)
    expect(blockText(MD, items[0] as BlockInfo)).toBe("- ข้อหนึ่ง\n  - ข้อซ้อน")
  })

  test("directive = block เดียว (เนื้อหาข้างในไม่เป็น block แยก)", () => {
    const directive = list.find((b) => b.kind === "directive")
    expect(blockText(MD, directive as BlockInfo)).toBe(':::note{title="x"}\nในกล่อง\n:::')
    expect(
      list.filter((b) => b.kind === "paragraph" && blockText(MD, b) === "ในกล่อง"),
    ).toHaveLength(0)
  })

  test("blockAt คืนตัวที่แคบที่สุด (innermost)", () => {
    const nested = list.find((b) => b.kind === "listItem" && b.depth === 1) as BlockInfo
    expect(blockAt(list, nested.from + 3)?.depth).toBe(1)
  })

  test("ไม่เดินทั้งเอกสาร — ช่วงแคบได้ block เฉพาะในช่วง", () => {
    const lines = MD.split("\n")
    const start = MD.indexOf("- ข้อหนึ่ง")
    const end = start + "- ข้อหนึ่ง".length + 1 + "  - ข้อซ้อน".length
    const state = EditorState.create({
      doc: MD,
      extensions: [markdown({ base: markdownLanguage })],
    })
    const scoped = computeBlocks(state, start, end)
    expect(scoped.length).toBeGreaterThan(0)
    expect(scoped.every((b) => b.from <= end)).toBe(true)
    expect(scoped.some((b) => b.kind === "heading")).toBe(false)
    expect(lines.length).toBeGreaterThan(0)
  })
})

describe("block operations (md → md)", () => {
  test("moveBlock ขึ้น/ลง สลับกับ block ข้างเคียง", () => {
    const list = blocks(MD)
    const second = list.filter((b) => b.kind === "listItem")[2] as BlockInfo
    const up = moveBlock(MD, second, list, -1)
    expect(up?.split("\n").slice(5, 9)).toEqual(["- ข้อสอง", "- ข้อหนึ่ง", "  - ข้อซ้อน", ""])
    const first = list.filter((b) => b.kind === "listItem")[0] as BlockInfo
    const down = moveBlock(MD, first, list, 1)
    const lines = down?.split("\n") as string[]
    // ย้ายทั้งก้อน (parent + ลูก) ลงหลัง "- ข้อสอง"
    expect(lines.slice(5, 9)).toEqual(["- ข้อสอง", "- ข้อหนึ่ง", "  - ข้อซ้อน", ""])
  })

  test("moveBlock บนสุด/ล่างสุด = ไม่ขยับ (คืน null)", () => {
    const list = blocks(MD)
    const heading = list.find((b) => b.kind === "heading") as BlockInfo
    expect(moveBlock(MD, heading, list, -1)).toBeNull()
  })

  test("duplicateBlock แทรกสำเนาถัดจากของเดิม", () => {
    const list = blocks(MD)
    const paragraph = list.find((b) => b.kind === "paragraph") as BlockInfo
    const next = duplicateBlock(MD, paragraph, list)
    expect(next.split("\n").slice(2, 7)).toEqual(["ย่อหน้าแรก", "ต่อเนื่อง", "ย่อหน้าแรก", "ต่อเนื่อง", ""])
  })

  test("deleteBlock ลบทั้ง block + ไม่เหลือบรรทัดว่างซ้อน", () => {
    const list = blocks(MD)
    const paragraph = list.find((b) => b.kind === "paragraph") as BlockInfo
    const next = deleteBlock(MD, paragraph, list)
    expect(next).not.toContain("ย่อหน้าแรก")
    expect(next).not.toContain("\n\n\n")
  })

  test("indent/outdent — list เติม 2 เคาะ · ย่อหน้าแปลงเป็น list (nest ตาม block model)", () => {
    const list = blocks(MD)
    const item = list.filter((b) => b.kind === "listItem")[0] as BlockInfo
    const indented = indentBlock(MD, item)
    // ลูก (list ที่ซ้อน) ถูก indent ตาม parent ด้วย — 2 → 4 เคาะ
    expect(indented.split("\n").slice(5, 8)).toEqual(["  - ข้อหนึ่ง", "    - ข้อซ้อน", "- ข้อสอง"])
    const paragraph = list.find((b) => b.kind === "paragraph") as BlockInfo
    expect(indentBlock(MD, paragraph).split("\n")[2]).toBe("  - ย่อหน้าแรก")
    const indentedItem = blocks(indented).filter((b) => b.kind === "listItem")[0] as BlockInfo
    expect(outdentBlock(indented, indentedItem)).toBe(MD)
  })

  test("moveBlockTo — drag & drop ย้ายพร้อมลูก + ตั้ง depth จากตำแหน่งแนวนอน", () => {
    const list = blocks(MD)
    const first = list.find((b) => b.kind === "paragraph") as BlockInfo
    // ย้ายย่อหน้าแรกไปล่างสุด (ก่อนบรรทัดสุดท้าย)
    const lines = MD.split("\n")
    const targetLine = lines.length - 1
    const moved = moveBlockTo(MD, first, list, targetLine, 0)
    expect(moved).not.toBeNull()
    const after = (moved as string).split("\n")
    // ไฟล์ลงท้ายด้วยบรรทัดว่าง — ย่อหน้าถูกวางก่อนบรรทัดสุดท้าย
    expect(after[after.length - 2]).toBe("ต่อเนื่อง")
    expect(after[after.length - 3]).toBe("ย่อหน้าแรก")
    // ต้นฉบับต้องไม่มีสำเนาค้าง (ย้าย ไม่ใช่คัดลอก)
    expect((moved as string).split("ย่อหน้าแรก").length - 1).toBe(1)

    // depth 1 → list item ที่ย้ายไปได้ indent 2 เคาะ
    const item = list.filter((b) => b.kind === "listItem")[2] as BlockInfo // "- ข้อสอง"
    const movedItem = moveBlockTo(MD, item, list, 5, 1)
    expect(movedItem?.split("\n")[5]).toBe("  - ข้อสอง")
  })

  test("moveBlockTo — วางที่เดิม/ในตัวเอง = ไม่ทำอะไร (คืน null)", () => {
    const list = blocks(MD)
    const item = list.filter((b) => b.kind === "listItem")[0] as BlockInfo
    expect(moveBlockTo(MD, item, list, item.headLine - 1, 0)).toBeNull()
  })

  test("turnIntoBlock — เขียนกลับเป็น markdown ทุกชนิด (ไม่มี state ซ่อน)", () => {
    const list = blocks(MD)
    const paragraph = list.find((b) => b.kind === "paragraph") as BlockInfo
    expect(turnIntoBlock(MD, paragraph, "h2").split("\n")[2]).toBe("## ย่อหน้าแรก")
    expect(turnIntoBlock(MD, paragraph, "todo").split("\n")[2]).toBe("- [ ] ย่อหน้าแรก")
    expect(turnIntoBlock(MD, paragraph, "quote").split("\n")[2]).toBe("> ย่อหน้าแรก")
    const item = list.filter((b) => b.kind === "listItem")[0] as BlockInfo
    expect(turnIntoBlock(MD, item, "paragraph").split("\n")[5]).toBe("ข้อหนึ่ง")
    const list2 = blocks(turnIntoBlock(MD, paragraph, "code"))
    const code = list2.find(
      (b) =>
        b.kind === "code" &&
        blockText(turnIntoBlock(MD, paragraph, "code"), b).includes("ย่อหน้าแรก"),
    )
    expect(code).toBeDefined()
  })
})

/**
 * Regression — หัว block ใน editor แสดงชื่อ block กลาง ๆ แทนข้อความของผู้ใช้
 *
 * อาการ (รายงานจากผู้ใช้): `:::progress{label="อาหารเป็นพิษ"}` ใน editor เห็นหัวเป็น
 * "แถบความคืบหน้า" เฉย ๆ — ไม่มีวี่แววของ label/value ที่ตัวเองเขียน
 *
 * root cause: `BlockHeadWidget` รับชื่อจาก `block.attrs.title` อย่างเดียว → block ที่
 * ตั้งชื่อด้วย attribute อื่น (`label` ของ progress/stat · `caption` ของ figure) ได้ค่าว่าง
 * ต่างจาก callout (note/tip) ที่ใช้ `title` จึงเห็นข้อความตามปกติ
 *
 * อ้างอิง: docs/08 ข้อ 79
 */
describe("directiveTitle — หัว block ต้องสื่อข้อความของผู้ใช้", () => {
  test("ใช้ attribute ตัวแรกที่มีค่า: title → label → caption", () => {
    expect(directiveTitle({ title: "เกร็ด" })).toBe("เกร็ด")
    expect(directiveTitle({ label: "อาหารเป็นพิษ" })).toBe("อาหารเป็นพิษ")
    expect(directiveTitle({ caption: "Fig 1 — render pipeline" })).toBe("Fig 1 — render pipeline")
    expect(directiveTitle({ title: "", label: "M2 — blocks" })).toBe("M2 — blocks")
    expect(directiveTitle({ title: "", label: "", caption: "B — poster" })).toBe("B — poster")
  })

  test("ไม่มี attribute ที่ใช้ตั้งชื่อ → ค่าว่าง (client ตกไปใช้ชื่อ block)", () => {
    expect(directiveTitle({})).toBe("")
    expect(directiveTitle(undefined)).toBe("")
    expect(directiveTitle({ value: "70" })).toBe("")
    expect(directiveTitle({ label: "   " })).toBe("")
  })
})

/**
 * Regression — editor แสดง custom block ของ Doku ไม่ครบ (อ่านว่า "block พังในหน้าอ่าน")
 *
 * อาการ: เปิดเอกสารที่มี `:::progress`/`:::figure`/`:::video`/`:::stats` → server render
 * หน้าอ่านให้เห็น block จริงชั่วขณะ แล้ว CM6 mount ทับด้วย decoration ที่เหลือแค่ "หัว block"
 * (ชื่อชนิด + tint) → block ที่มีเนื้อหาอยู่ใน attribute ล้วนหายไปทั้งก้อน
 *
 * root cause: Track B ทำ read-parity แค่ "หัว block + tint" ไม่ได้ render เนื้อของ block
 * ที่ข้อมูลอยู่ใน attribute (`progress` value/label · `figure` src/caption · `video` src ·
 * `stats` tile ในบรรทัด) → `BlockPreviewWidget` ต้องประกอบ markup ชุดเดียวกับ renderer จริง
 *
 * อ้างอิง: docs/08 ข้อ 81 · docs/09 §5 Track B
 */
describe("ค่า attribute ของ block preview — ตรงกับ renderer จริง", () => {
  test("percentAttr — 0–100, รับ `70%`, ปัดเศษทิ้ง, นอกช่วง = null", () => {
    expect(percentAttr("70")).toBe(70)
    expect(percentAttr("70%")).toBe(70)
    expect(percentAttr(" 5 ")).toBe(5)
    expect(percentAttr("0")).toBe(0)
    expect(percentAttr("100")).toBe(100)
    expect(percentAttr("101")).toBeNull()
    expect(percentAttr("-1")).toBeNull()
    expect(percentAttr("abc")).toBeNull()
    expect(percentAttr(undefined)).toBeNull()
  })

  test("statTiles — รับทั้ง `:stat[…]` (text) และ `::stat[…]` (leaf) ที่ใช้ใน design.md", () => {
    const body = ':stat[42]{label="เอกสาร"}\n::stat[18]{label="แท็ก" color=blue}\n\nข้อความอื่น\n'
    expect(statTiles(body)).toEqual([
      { value: "42", label: "เอกสาร" },
      { value: "18", label: "แท็ก", color: "blue" },
    ])
  })

  test("statTiles — บรรทัดที่ไม่ใช่ tile / ค่าว่าง = ไม่สร้าง tile", () => {
    expect(statTiles("ไม่มี tile เลย\n")).toEqual([])
    expect(statTiles(":stat[]")).toEqual([])
    expect(statTiles(':stat[9]{label="x"}')).toEqual([{ value: "9", label: "x" }])
  })
})
