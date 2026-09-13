/**
 * `:::progress{value label}` — แถบความคืบหน้า (docs/03)
 * ใช้ `<progress>` เนทีฟ (ไม่ต้อง inline style) + label แยก
 * `value` ผิด (ไม่ใช่ 0–100) = ไม่มีแถบ แต่ **label/เนื้อในยังอยู่** + เตือน (docs/08 ข้อ 68)
 */

import type { ElementContent } from "hast"
import { type BlockDefinition, blockElement, h, intAttr, strayChildren, t } from "./types.ts"

export const progressDefinition: BlockDefinition = {
  name: "progress",
  kind: "container",
  implemented: true,
  attributes: ["value", "label"],
  values: {},
  example: ':::progress{value=70 label="M2 — blocks"}\n:::',
  render(ctx) {
    const value = intAttr(ctx.attrs.value, 0, 100)
    const children: ElementContent[] = []
    if (value === null) {
      ctx.warn(
        "block_attribute_unknown",
        `progress ต้องมี value เป็นตัวเลข 0–100 (ได้: ${ctx.attrs.value ?? "ไม่ระบุ"})`,
      )
    } else {
      children.push(h("progress", { value, max: 100 }))
    }
    if (ctx.attrs.label) {
      children.push(h("span", { dataPart: "progress-label" }, [t(ctx.attrs.label)]))
    } else if (value === null) {
      // ไม่มี label ให้เห็น — ต้องมีอะไรบอกว่า block นี้ผิด ไม่ใช่กล่องเปล่าลอย ๆ
      children.push(
        h("span", { dataPart: "progress-label" }, [t("progress: value ไม่ถูกต้อง (0–100)")]),
      )
    }
    // progress ไม่ใช้เนื้อใน — ถ้าเขียนมา ต้องไม่หาย
    children.push(...strayChildren(ctx))
    return blockElement("div", "progress", value === null ? { dataInvalid: "true" } : {}, children)
  },
}
