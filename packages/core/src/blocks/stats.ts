/**
 * `:::stats` + `:stat[42]{label="เอกสาร"}` — แถวตัวเลขใหญ่ (docs/03)
 * `:stat` ยืนเดี่ยวได้ (inline) และใช้ข้างใน `:::stats` เป็น tile
 */

import type { ElementContent } from "hast"
import { BLOCK_COLORS, type BlockDefinition, blockElement, h, mdastText, t } from "./types.ts"

interface StatLike {
  type: string
  name?: string
  attributes?: Record<string, string>
  children?: unknown[]
}

function statTile(value: ElementContent[], label: string | undefined, color: string | undefined) {
  const children: ElementContent[] = [h("span", { dataPart: "stat-value" }, value)]
  if (label) children.push(h("span", { dataPart: "stat-label" }, [t(label)]))
  return h(
    "div",
    { dataBlock: "stat", dataVariant: "tile", ...(color ? { dataColor: color } : {}) },
    children,
  )
}

function collectStats(node: StatLike): Array<{ value: string; label?: string; color?: string }> {
  if (node.type === "dokuInline" && node.name === "stat") {
    return [
      {
        value: mdastText(node).trim(),
        label: node.attributes?.label,
        color: node.attributes?.color,
      },
    ]
  }
  if (Array.isArray(node.children))
    return node.children.flatMap((child) => collectStats(child as StatLike))
  return []
}

export const statsDefinition: BlockDefinition = {
  name: "stats",
  kind: "container",
  implemented: true,
  attributes: [],
  values: {},
  example: ':::stats\n:stat[42]{label="เอกสาร"}\n:stat[18]{label="แท็ก"}\n:::',
  render(ctx) {
    const tiles = collectStats(ctx.node as unknown as StatLike).map((stat) =>
      statTile([t(stat.value)], stat.label, stat.color),
    )
    if (tiles.length === 0) return blockElement("div", "stats", {}, ctx.children)
    return blockElement("div", "stats", {}, tiles)
  },
}

export const statDefinition: BlockDefinition = {
  name: "stat",
  kind: "text",
  implemented: true,
  attributes: ["label", "color"],
  values: { color: BLOCK_COLORS },
  example: ':stat[42]{label="เอกสาร"}',
  render(ctx) {
    const children: ElementContent[] = [h("span", { dataPart: "stat-value" }, ctx.children)]
    if (ctx.attrs.label) {
      children.push(h("span", { dataPart: "stat-label" }, [t(ctx.attrs.label)]))
    }
    return blockElement(
      "span",
      "stat",
      { dataVariant: "inline", ...(ctx.attrs.color ? { dataColor: ctx.attrs.color } : {}) },
      children,
    )
  },
}
