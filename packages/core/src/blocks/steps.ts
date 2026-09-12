/**
 * `:::steps` — ordered list ที่ render พิเศษ (เลขกลม) (docs/03)
 * body เป็น ordered list ธรรมดา → CSS ใส่ตัวเลขให้
 */

import { type BlockDefinition, blockElement } from "./types.ts"

export const stepsDefinition: BlockDefinition = {
  name: "steps",
  kind: "container",
  implemented: true,
  attributes: [],
  values: {},
  example: ":::steps\n1. ติดตั้ง workspace\n2. เขียน core\n3. รัน server\n:::",
  render(ctx) {
    return blockElement("div", "steps", {}, ctx.children)
  },
}
