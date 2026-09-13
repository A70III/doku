/**
 * `:::section{type=hero|divider}` — primitive จัดหน้า (docs/03)
 * `hero` = เปิดเรื่อง · `divider` = เส้นคั่น (`div[data-block='section'][data-variant='divider'] > hr`)
 */

import { type BlockDefinition, blockElement, h, strayChildren } from "./types.ts"

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
      // `hr` ต้องมีตัวห่อเพราะ renderer คืนได้ element เดียว — เนื้อในไม่ใช่ส่วนของเส้นคั่น
      // แต่ต้องไม่หาย: แสดงต่อท้ายเส้น (docs/08 ข้อ 68)
      return blockElement("div", "section", { dataVariant: "divider" }, [
        h("hr"),
        ...strayChildren(ctx),
      ])
    }
    return blockElement("section", "section", { dataVariant: "hero" }, ctx.children)
  },
}
