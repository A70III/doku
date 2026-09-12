/**
 * `:::gallery{cols}` — grid รูปหลายใบ (docs/03)
 * markup: `<div data-block="gallery" data-cols="3">` ครอบ `:::figure` หลายตัว
 */

import { type BlockDefinition, blockElement } from "./types.ts"

export const galleryDefinition: BlockDefinition = {
  name: "gallery",
  kind: "container",
  implemented: true,
  attributes: ["cols", "gap"],
  values: { cols: ["2", "3", "4"], gap: ["sm", "md", "lg"] },
  example:
    '::::gallery{cols=3}\n:::figure{src="/assets/a.png" caption="A"}\n:::\n:::figure{src="/assets/b.png" caption="B"}\n:::\n::::',
  render(ctx) {
    const properties: Record<string, unknown> = { dataCols: ctx.attrs.cols ?? "3" }
    if (ctx.attrs.gap) properties.dataGap = ctx.attrs.gap
    return blockElement("div", "gallery", properties, ctx.children)
  },
}
