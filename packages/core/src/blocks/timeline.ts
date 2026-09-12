/**
 * `:::timeline` — เส้นเวลา (docs/03)
 * format: `- <label> :: <ข้อความ>` เรียงบนลงล่าง
 */

import { type BlockDefinition, blockElement, h, mdastText, t } from "./types.ts"

interface ListLike {
  type: string
  children?: ListLike[]
}

export const timelineDefinition: BlockDefinition = {
  name: "timeline",
  kind: "container",
  implemented: true,
  attributes: [],
  values: {},
  example: ":::timeline\n- 2025-09 :: เริ่มโปรเจกต์\n- 2025-10 :: M0 เสร็จ\n:::",
  render(ctx) {
    const items = collectItems(ctx.node as unknown as ListLike)
    if (items.length === 0) return blockElement("div", "timeline", {}, ctx.children)

    const rows = items.map((item) => {
      const split = item.indexOf("::")
      const label = split === -1 ? "" : item.slice(0, split).trim()
      const body = split === -1 ? item : item.slice(split + 2).trim()
      return h("li", { dataPart: "timeline-item" }, [
        h("span", { dataPart: "timeline-label" }, [t(label)]),
        h("span", { dataPart: "timeline-text" }, [t(body)]),
      ])
    })
    return blockElement("ol", "timeline", {}, rows)
  },
}

function collectItems(node: ListLike): string[] {
  if (node.type === "list" && Array.isArray(node.children)) {
    return node.children.map((item) => mdastText(item).replace(/\n+/g, " ").trim()).filter(Boolean)
  }
  if (Array.isArray(node.children)) return node.children.flatMap((child) => collectItems(child))
  return []
}
