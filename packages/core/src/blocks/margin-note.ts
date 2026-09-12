/**
 * `:::margin-note{side}` — โน้ตข้าง (docs/03)
 * desktop วางข้าง content · mobile ย่อเป็น inline
 */

import { type BlockDefinition, blockElement } from "./types.ts"

export const marginNoteDefinition: BlockDefinition = {
  name: "margin-note",
  kind: "container",
  implemented: true,
  attributes: ["side"],
  values: { side: ["left", "right"] },
  example: ":::margin-note{side=right}\nโน้ตข้าง — desktop วางข้าง, mobile ย่อเป็น inline\n:::",
  render(ctx) {
    return blockElement(
      "aside",
      "margin-note",
      { dataSide: ctx.attrs.side ?? "right" },
      ctx.children,
    )
  },
}
