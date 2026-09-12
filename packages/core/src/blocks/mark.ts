/**
 * `==ข้อความ=={.amber}` — highlight แบบ brush underline (docs/03, docs/08 ข้อ 6)
 *
 * node นี้ถูกสร้างโดย `remarkMark` (ไม่ใช่ `:::` directive) แต่ใช้ renderer เดียวกัน
 */

import { BLOCK_COLORS, type BlockDefinition, blockElement } from "./types.ts"

export const markDefinition: BlockDefinition = {
  name: "mark",
  kind: "text",
  implemented: true,
  attributes: ["color"],
  values: { color: BLOCK_COLORS },
  example: "==คำสำคัญ=={.amber}",
  render(ctx) {
    const properties: Record<string, unknown> = {}
    if (ctx.attrs.color) properties.dataColor = ctx.attrs.color
    return blockElement("mark", "mark", properties, ctx.children)
  },
}
