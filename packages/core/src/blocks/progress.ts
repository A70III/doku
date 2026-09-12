/**
 * `:::progress{value label}` — แถบความคืบหน้า (docs/03)
 * ใช้ `<progress>` เนทีฟ (ไม่ต้อง inline style) + label แยก
 */

import { type BlockDefinition, blockElement, h, intAttr, t } from "./types.ts"

export const progressDefinition: BlockDefinition = {
  name: "progress",
  kind: "container",
  implemented: true,
  attributes: ["value", "label"],
  values: {},
  example: ':::progress{value=70 label="M2 — blocks"}\n:::',
  render(ctx) {
    const value = intAttr(ctx.attrs.value, 0, 100)
    if (value === null) {
      ctx.warn("block_attribute_unknown", "progress ต้องมี value เป็นตัวเลข 0–100")
      return null
    }
    const children = [h("progress", { value, max: 100 })]
    if (ctx.attrs.label) {
      children.push(h("span", { dataPart: "progress-label" }, [t(ctx.attrs.label)]))
    }
    return blockElement("div", "progress", {}, children)
  },
}
