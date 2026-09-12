/**
 * `::::grid{cols gap}` + `:::col` — primitive จัดคอลัมน์ (docs/03)
 * markup: `<div data-block="grid" data-cols="2" data-gap="md">` ครอบ `<div data-block="col">`
 */

import { type BlockDefinition, blockElement } from "./types.ts"

export const gridDefinition: BlockDefinition = {
  name: "grid",
  kind: "container",
  implemented: true,
  attributes: ["cols", "gap"],
  values: { cols: ["2", "3", "4"], gap: ["sm", "md", "lg"] },
  example: "::::grid{cols=2 gap=md}\n:::col\nซ้าย\n:::\n:::col\nขวา\n:::\n::::",
  render(ctx) {
    const properties: Record<string, unknown> = { dataCols: ctx.attrs.cols ?? "2" }
    if (ctx.attrs.gap) properties.dataGap = ctx.attrs.gap
    return blockElement("div", "grid", properties, ctx.children)
  },
}

export const colDefinition: BlockDefinition = {
  name: "col",
  kind: "container",
  implemented: true,
  attributes: [],
  values: {},
  example: ":::col\nเนื้อหาคอลัมน์\n:::",
  render(ctx) {
    return blockElement("div", "col", {}, ctx.children)
  },
}
