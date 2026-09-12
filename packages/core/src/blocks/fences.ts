/**
 * ตรวจ fence ของ directive (`:::`) จาก "source" โดยไม่ใช้ AST
 *
 * ทำไมต้องมี: remark-directive (micromark) ปิด container ด้วยเกณฑ์
 * "fence ปิดยาว >= fence เปิด" แบบรวมทั้ง stack — ถ้าซ้อน container ด้วย `:::` ยาวเท่ากัน
 * ตัวในตัวที่สองจะหลุดออกมาเป็น sibling และเหลือ `:::` เปล่า
 * (ดู docs/08 — directive ที่ซ้อนกัน) ส่วน `position.end` ของ AST ก็ไม่น่าเชื่อถือในเคสนี้
 * → ตรวจจาก source ตรง ๆ แล้วเทียบกับพฤติกรรมจริงของ micromark
 *
 * กฎที่จำลอง:
 * - บรรทัด `:::name{…}` = เปิด container (ชื่อขึ้นต้นด้วยตัวอักษร)
 * - บรรทัด `:::` หรือ `:::{…}` = ปิด container ทุกตัวที่ fence ยาว <= ตัวที่ปิด
 * - บรรทัด `:::name{…}:::` = เปิด+ปิดในบรรทัดเดียว (ไม่ค้าง stack)
 * - บรรทัด `:::` ที่ไม่มีอะไรให้ปิด = stray
 * - ซ้อน container โดย fence ชั้นในยาว >= ชั้นนอก = จะถูกปิดพร้อมกัน (ambiguous)
 * - เนื้อใน code fence (` ``` ` / `~~~`) ไม่นับ
 */

export type FenceProblemKind = "unclosed" | "stray" | "ambiguous-nesting"

export interface FenceProblem {
  kind: FenceProblemKind
  /** ชื่อ directive ที่เกี่ยวข้อง (ถ้ามี) */
  name?: string
  /** เลขบรรทัด (1-based) */
  line: number
  /** ชื่อ container ที่เป็นชั้นนอก ในกรณี ambiguous-nesting */
  parent?: string
}

interface OpenDirective {
  name: string
  length: number
  line: number
}

const CODE_FENCE = /^\s*(`{3,}|~{3,})/
const DIRECTIVE_FENCE = /^\s*(:{3,})\s*(.*)$/

export function analyzeDirectiveFences(source: string): FenceProblem[] {
  const problems: FenceProblem[] = []
  const stack: OpenDirective[] = []
  const lines = source.split("\n")

  let codeFence: { char: string; length: number } | null = null

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    const lineNumber = index + 1

    const code = CODE_FENCE.exec(line)
    if (code) {
      const marker = code[1] ?? ""
      const char = marker[0] ?? "`"
      if (!codeFence) codeFence = { char, length: marker.length }
      else if (codeFence.char === char && marker.length >= codeFence.length) codeFence = null
      continue
    }
    if (codeFence) continue

    const fence = DIRECTIVE_FENCE.exec(line)
    if (!fence) continue

    const length = (fence[1] ?? "").length
    const rest = (fence[2] ?? "").trim()

    // ปิด: `:::` เปล่า หรือมีแต่ attribute
    if (rest === "" || rest.startsWith("{")) {
      let closed = 0
      while (stack.length > 0 && (stack[stack.length - 1]?.length ?? 0) <= length) {
        stack.pop()
        closed += 1
      }
      if (closed === 0) problems.push({ kind: "stray", line: lineNumber })
      continue
    }

    const name = /^[A-Za-z][\w-]*/.exec(rest)?.[0]
    if (!name) continue

    // `:::figure{src=x}:::` = เปิด+ปิดในบรรทัดเดียว
    if (rest.endsWith(":::")) continue

    const parent = stack[stack.length - 1]
    if (parent && length >= parent.length) {
      problems.push({
        kind: "ambiguous-nesting",
        name,
        line: lineNumber,
        parent: parent.name,
      })
    }
    stack.push({ name, length, line: lineNumber })
  }

  for (const open of stack) {
    problems.push({ kind: "unclosed", name: open.name, line: open.line })
  }

  return problems
}

export function describeFenceProblem(problem: FenceProblem): string {
  switch (problem.kind) {
    case "unclosed":
      return `block :::${problem.name} (บรรทัด ${problem.line}) เปิดแล้วไม่ปิด`
    case "stray":
      return `พบ \`:::\` ที่ไม่มี block ให้ปิด (บรรทัด ${problem.line})`
    case "ambiguous-nesting":
      return `block :::${problem.name} (บรรทัด ${problem.line}) ซ้อนใน :::${problem.parent} ด้วย \`:::\` ยาวเท่ากัน/ยาวกว่า — ตัวในตัวที่สองจะหลุดออกจาก :::${problem.parent}; ให้เขียนชั้นนอกด้วย \`:::\` ที่ยาวกว่า (เช่น \`::::${problem.parent}\`)`
  }
}
