/**
 * `:::note|info|tip|success|warning|danger|quote{title color}` — callout (docs/03)
 *
 * 7 type ครบ (docs/08 ข้อ 14) · `color=` override ได้ด้วยสีใน allowlist
 * markup: `<aside data-block="callout" data-variant="warning" [data-color="blue"]>`
 */

import { hasIcon, type LucideIconName } from "../icons/index.ts"
import { BLOCK_COLORS, type BlockDefinition, blockElement, h, t } from "./types.ts"

/** callout type → Lucide icon (docs/08 ข้อ 14/35) — ส่งผ่าน `data-icon` + CSS mask */
const CALLOUT_ICONS: Record<string, LucideIconName> = {
  note: "pencil",
  info: "info",
  tip: "lightbulb",
  success: "circle-check",
  warning: "triangle-alert",
  danger: "octagon-alert",
  quote: "quote",
}

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
      const icon = CALLOUT_ICONS[name]
      if (icon && hasIcon(icon)) properties.dataIcon = icon
      if (ctx.attrs.color) properties.dataColor = ctx.attrs.color
      const children = [...ctx.children]
      if (ctx.attrs.title) {
        children.unshift(h("p", { dataPart: "callout-title" }, [t(ctx.attrs.title)]))
      }
      return blockElement("aside", "callout", properties, children)
    },
  }
}
