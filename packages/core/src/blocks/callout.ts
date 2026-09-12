/**
 * `:::note|info|tip|success|warning|danger|quote{title color}` — callout (docs/03)
 *
 * 7 type ครบ (docs/08 ข้อ 14) · `color=` override ได้ด้วยสีใน allowlist
 * markup: `<aside data-block="callout" data-variant="warning" [data-color="blue"]>`
 */

import { BLOCK_COLORS, type BlockDefinition, blockElement, h, t } from "./types.ts"

export function calloutDefinition(name: string): BlockDefinition {
  return {
    name,
    kind: "container",
    implemented: true,
    attributes: ["title", "color"],
    values: { color: BLOCK_COLORS },
    example: `:::${name}{title="หัวข้อ"}\nเนื้อหาของ callout\n:::`,
    render(ctx) {
      const properties: Record<string, unknown> = { dataVariant: name }
      if (ctx.attrs.color) properties.dataColor = ctx.attrs.color
      const children = [...ctx.children]
      if (ctx.attrs.title) {
        children.unshift(h("p", { dataPart: "callout-title" }, [t(ctx.attrs.title)]))
      }
      return blockElement("aside", "callout", properties, children)
    },
  }
}
