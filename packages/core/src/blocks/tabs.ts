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
    // ⚠️ ห้ามจับคู่ด้วย index ของ mdast กับ ctx.children: remark-rehype ทิ้ง html/definition node
    // → index เลื่อน → tab หายเงียบ. จับคู่ "เฉพาะ tab" เรียงตามลำดับทั้งสองฝั่งแทน
    const tabNodes = mdast.filter((child) => child?.type === "dokuBlock" && child.name === "tab")
    const elements = ctx.children.filter((child): child is Element => child.type === "element")
    // และต้องกรองฝั่ง hast ด้วย `data-block="tab"` เท่านั้น — element อื่น (ย่อหน้า/block อื่น)
    // ไม่ใช่ panel ถ้าเอามาเข้าคิว จับคู่จะเลื่อนทั้งแถว: tab หาย + panel ติด label ผิด
    const isTab = (child: Element): boolean => child.properties?.dataBlock === "tab"
    const tabElements = elements.filter(isTab)
    const pairs = tabNodes
      .map((child, index) => ({ child, hast: tabElements[index] }))
      .filter((pair): pair is { child: TabLike; hast: Element } => Boolean(pair.hast))

    if (pairs.length === 0) return blockElement("div", "tabs", {}, ctx.children)

    // เนื้อหาที่ไม่ใช่ :::tab — ย้ายไปท้ายบล็อก (ห้ามทิ้ง: "ไฟล์คือความจริง" · docs/08 ข้อ 60/61)
    const stray = elements.filter((child) => !isTab(child))
    if (stray.length > 0) {
      ctx.warn(
        "block_stray_child",
        `เนื้อหาใน ::::tabs ที่ไม่ใช่ :::tab ถูกย้ายไปท้ายบล็อก (${stray.length} ก้อน)`,
        "warning",
      )
    }

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
      ...stray,
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
