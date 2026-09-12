/**
 * `:badge[BETA]{color=green strike}` — ป้ายเล็ก inline (docs/03)
 */

import { BLOCK_COLORS, type BlockDefinition, blockElement, flag } from "./types.ts"

export const badgeDefinition: BlockDefinition = {
  name: "badge",
  kind: "text",
  implemented: true,
  attributes: ["color", "strike"],
  values: { color: BLOCK_COLORS },
  example: ":badge[BETA]{color=green}",
  render(ctx) {
    const properties: Record<string, unknown> = {}
    if (ctx.attrs.color) properties.dataColor = ctx.attrs.color
    if (flag(ctx.attrs, "strike")) properties.dataStrike = "true"
    return blockElement("span", "badge", properties, ctx.children)
  },
}
