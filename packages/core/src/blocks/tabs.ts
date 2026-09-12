/**
 * `::::tabs` + `:::tab{label}` — แท็บ (docs/03)
 *
 * ไม่มี JS → CSS แสดงทุก panel ซ้อนกัน (อ่านได้) · JS เพิ่ม `data-enhanced` แล้วซ่อน panel ที่ไม่ active
 * จึงไม่ต้องใช้ id/aria-controls (กัน id ชนกันเมื่อมีหลาย tabs block ในหน้าเดียว)
 */

import type { Element, ElementContent } from "hast"
import { type BlockDefinition, blockElement, h, t } from "./types.ts"

interface TabLike {
  type: string
  name?: string
  attributes?: Record<string, string>
}

export const tabsDefinition: BlockDefinition = {
  name: "tabs",
  kind: "container",
  implemented: true,
  attributes: [],
  values: {},
  example:
    '::::tabs\n:::tab{label="macOS"}\nคำสั่งสำหรับ mac\n:::\n:::tab{label="Linux"}\nคำสั่งสำหรับ linux\n:::\n::::',
  render(ctx) {
    const mdast = (ctx.node.children ?? []) as TabLike[]
    const pairs = mdast
      .map((child, index) => ({ child, hast: ctx.children[index] }))
      .filter(
        (pair): pair is { child: TabLike; hast: Element } =>
          pair.child?.type === "dokuBlock" &&
          pair.child.name === "tab" &&
          Boolean(pair.hast) &&
          (pair.hast as Element).type === "element",
      )

    if (pairs.length === 0) return blockElement("div", "tabs", {}, ctx.children)

    const buttons = pairs.map(({ child }, index) =>
      h(
        "button",
        {
          type: "button",
          role: "tab",
          dataPart: "tab-button",
          dataIndex: String(index),
          ariaSelected: index === 0 ? "true" : "false",
        },
        [t(child.attributes?.label ?? `Tab ${index + 1}`)],
      ),
    )

    const panels = pairs.map(({ child, hast }, index) => {
      const label = child.attributes?.label
      return h(
        "div",
        {
          ...hast.properties,
          dataPart: "tab-panel",
          dataIndex: String(index),
          role: "tabpanel",
          ariaLabel: label,
          dataActive: index === 0 ? "true" : undefined,
        },
        hast.children,
      )
    })

    return blockElement("div", "tabs", {}, [
      h("div", { dataPart: "tablist", role: "tablist" }, buttons),
      ...panels,
    ])
  },
}

export const tabDefinition: BlockDefinition = {
  name: "tab",
  kind: "container",
  implemented: true,
  attributes: ["label"],
  values: {},
  example: ':::tab{label="macOS"}\nเนื้อหาแท็บ\n:::',
  render(ctx) {
    return blockElement("div", "tab", { dataLabel: ctx.attrs.label ?? "" }, ctx.children)
  },
}

export type { ElementContent }
