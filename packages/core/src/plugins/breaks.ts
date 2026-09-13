/**
 * remark plugin: soft line break ในย่อหน้า → `<br>`
 *
 * CommonMark มองบรรทัดใหม่เดี่ยวในย่อหน้าเป็น "soft break" แล้วแสดงเป็น **ช่องว่าง**
 * (`กินอะไรดีครับ\nควรจะนอน…` → บรรทัดเดียว) — doku ต้องการให้ตรงกับสิ่งที่ผู้ใช้พิมพ์
 * เพราะโหมดเขียน (CM6 Live Preview) แสดงต้นฉบับเป็นบรรทัด และ vault มาจาก Obsidian
 * ที่อ่านเป็นบรรทัด (docs/08 ข้อ 71)
 *
 * ทำที่ระดับ mdast: แยก `text` node ที่มี `\n` ออกเป็น `text` / `break` — `remark-rehype`
 * map `break` → `<br>` เอง
 *
 * ไม่แตะ: `code` · `inlineCode` · `math`/`inlineMath` · `link`/`image`
 * — สิ่งเหล่านี้เก็บข้อความเป็น `value` ของ node ตัวเอง ไม่ใช่ `text` node
 * (การขึ้นบรรทัดในโค้ด/สมการไม่ควรกลายเป็น `<br>`)
 *
 * ⚠️ `break` node ไม่มี `value` — อะไรที่อ่านข้อความด้วย `mdastText()` (kv · steps ·
 * tabs) ต้องได้ `"\n"` กลับมา ไม่งั้นบรรทัดจะยุบติดกัน (ดู `blocks/types.ts`)
 */

import type { Root } from "mdast"

interface MutableNode {
  type: string
  value?: string
  children?: MutableNode[]
}

/** parent ที่ข้อความข้างในเป็น "โค้ด/ข้อมูลดิบ" ไม่ใช่ prose */
const OPAQUE = new Set(["code", "inlineCode", "math", "inlineMath"])

function split(node: MutableNode): void {
  if (!Array.isArray(node.children)) return
  const next: MutableNode[] = []
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string" && child.value.includes("\n")) {
      const lines = child.value.split("\n")
      lines.forEach((line, index) => {
        if (index > 0) next.push({ type: "break" })
        if (line) next.push({ type: "text", value: line })
      })
      continue
    }
    if (!OPAQUE.has(child.type)) split(child)
    next.push(child)
  }
  node.children = next
}

export function remarkBreaks() {
  return (tree: Root): void => {
    split(tree as unknown as MutableNode)
  }
}
