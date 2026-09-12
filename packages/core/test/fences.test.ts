import { describe, expect, test } from "bun:test"
import { analyzeDirectiveFences } from "../src/blocks/fences.ts"

const kinds = (source: string) => analyzeDirectiveFences(source).map((p) => p.kind)

describe("analyzeDirectiveFences", () => {
  test("block ที่ปิดครบ → ไม่มีปัญหา", () => {
    expect(kinds(":::warning{title=x}\nเนื้อหา\n:::\n")).toEqual([])
    expect(kinds(":::figure{src=a.png}:::\n")).toEqual([])
    expect(kinds(":badge[BETA]{color=green}\n")).toEqual([])
  })

  test("เปิดแล้วไม่ปิด (จบเอกสาร) → unclosed", () => {
    const problems = analyzeDirectiveFences(":::warning{title=x}\nยังไม่ปิด\n")
    expect(problems[0]?.kind).toBe("unclosed")
    expect(problems[0]?.name).toBe("warning")
    expect(problems[0]?.line).toBe(1)
  })

  test("`:::` ที่ไม่มีอะไรให้ปิด → stray", () => {
    const problems = analyzeDirectiveFences("เนื้อหา\n\n:::\n")
    expect(problems).toHaveLength(1)
    expect(problems[0]?.kind).toBe("stray")
    expect(problems[0]?.line).toBe(3)
  })

  test("ซ้อนด้วย `:::` ยาวเท่ากัน → ambiguous-nesting + stray (ตรงกับพฤติกรรม micromark)", () => {
    const source = ':::tabs\n:::tab{label="a"}\nAAAA\n:::\n:::tab{label="b"}\nBBBB\n:::\n:::\n'
    const problems = analyzeDirectiveFences(source)
    expect(problems.map((problem) => problem.kind)).toEqual(["ambiguous-nesting", "stray"])
    expect(problems[0]?.parent).toBe("tabs")
    expect(problems[0]?.name).toBe("tab")
  })

  test("ซ้อนด้วย `:::` ชั้นนอกยาวกว่า → ผ่าน", () => {
    const source = '::::tabs\n:::tab{label="a"}\nAAAA\n:::\n:::tab{label="b"}\nBBBB\n:::\n::::\n'
    expect(kinds(source)).toEqual([])
  })

  test("`:::` ใน code fence ไม่ถูกนับ", () => {
    const source = "```md\n:::warning{x}\n```\n\n:::note\ny\n:::\n"
    expect(kinds(source)).toEqual([])
  })

  test("ซ้อน 3 ชั้นด้วย fence ยาวขึ้นทีละขั้น → ผ่าน", () => {
    const source = ":::::outer\n::::mid\n:::inner\nx\n:::\n::::\n:::::\n"
    expect(kinds(source)).toEqual([])
  })
})
