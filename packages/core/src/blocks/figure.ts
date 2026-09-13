/**
 * `:::figure{src caption alt width align zoom}` — รูปที่มี caption/จัดวาง (docs/03, docs/08 ข้อ 15)
 *
 * `align`: `left` `center` `right` `full` (แทนคำว่า bleed) · `width` เป็นเปอร์เซ็นต์ 5–100 (สเต็ป 5)
 * ไม่มี `src` = placeholder (ไม่ใช่รูปแตก) · asset จริงถูก rewrite เป็น `/assets/…` ทีหลัง sanitize
 */

import type { ElementContent } from "hast"
import { type BlockDefinition, blockElement, flag, h, intAttr, strayChildren, t } from "./types.ts"

const ALIGN = ["left", "center", "right", "full"] as const

export const figureDefinition: BlockDefinition = {
  name: "figure",
  kind: "container",
  implemented: true,
  attributes: ["src", "caption", "alt", "width", "align", "zoom"],
  values: { align: ALIGN },
  example:
    ':::figure{src="/assets/projects/doku/assets/diagram.svg" caption="Fig 1 — pipeline" width=70 align=center zoom=true}\n:::',
  render(ctx) {
    const { src, caption, alt, width } = ctx.attrs
    if (!src) {
      ctx.warn("block_attribute_unknown", "figure ต้องมี src — แสดง placeholder แทน")
      return blockElement("figure", "figure", { dataAlign: "center", dataMissing: "true" }, [
        h("figcaption", { dataPart: "figure-caption" }, [t("asset not found: (ไม่มี src)")]),
        ...strayChildren(ctx),
      ])
    }
    const properties: Record<string, unknown> = {
      dataAlign: ctx.attrs.align ?? "center",
    }
    if (width !== undefined) {
      // รับทั้ง `70` และ `70%` (docs/03 เขียน `width=70%`)
      const value = intAttr(width.replace(/%$/, "").trim(), 5, 100)
      if (value !== null && value % 5 === 0) properties.dataWidth = String(value)
      else ctx.warn("block_attribute_unknown", `figure width ต้องเป็น 5–100 (สเต็ป 5): ${width}`)
    }
    if (flag(ctx.attrs, "zoom")) properties.dataZoom = "true"

    const image = h("img", { src, alt: alt ?? caption ?? "", loading: "lazy", decoding: "async" })
    const children: ElementContent[] = [image]
    if (caption) children.push(h("figcaption", { dataPart: "figure-caption" }, [t(caption)]))
    // เนื้อในเป็นของ caption/รูป ไม่ใช่ block — ไม่ใช้ก็ต้องไม่หาย (docs/08 ข้อ 68)
    children.push(...strayChildren(ctx))
    return blockElement("figure", "figure", properties, children)
  },
}
