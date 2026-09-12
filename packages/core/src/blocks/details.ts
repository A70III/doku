/**
 * `:::details{summary open}` — ยุบ/ขยาย (docs/03)
 * ใช้ `<details>`/`<summary>` เนทีฟ → keyboard + a11y ได้ฟรี
 */

import { type BlockDefinition, blockElement, flag, h, t } from "./types.ts"

export const detailsDefinition: BlockDefinition = {
  name: "details",
  kind: "container",
  implemented: true,
  attributes: ["summary", "open"],
  values: {},
  example: ':::details{summary="กดเพื่อดูรายละเอียด" open=false}\nเนื้อหาที่ซ่อน\n:::',
  render(ctx) {
    const properties: Record<string, unknown> = {}
    if (flag(ctx.attrs, "open")) properties.open = true
    return blockElement("details", "details", properties, [
      h("summary", {}, [t(ctx.attrs.summary ?? "รายละเอียด")]),
      ...ctx.children,
    ])
  },
}
