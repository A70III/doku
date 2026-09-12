/**
 * `:::section{type=hero|divider}` — primitive จัดหน้า (docs/03)
 * `hero` = เปิดเรื่อง · `divider` = เส้นคั่น (render เป็น `<hr>`)
 */

import { type BlockDefinition, blockElement, h } from "./types.ts"

export const sectionDefinition: BlockDefinition = {
  name: "section",
  kind: "container",
  implemented: true,
  attributes: ["type"],
  values: { type: ["hero", "divider"] },
  example: ":::section{type=hero}\n# หัวเรื่องใหญ่\n:::",
  render(ctx) {
    const type = ctx.attrs.type ?? "hero"
    if (type === "divider") {
      return h("hr", { dataBlock: "section", dataVariant: "divider" })
    }
    return blockElement("section", "section", { dataVariant: "hero" }, ctx.children)
  },
}
