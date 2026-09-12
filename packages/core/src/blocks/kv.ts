/**
 * `:::kv` — ตาราง key–value 2 คอลัมน์ (docs/03)
 * แต่ละบรรทัดใน body เป็น `key: value` (แยกที่ `:` ตัวแรก) — ใช้ข้อความล้วนเพื่อความคาดเดาได้
 */

import type { ElementContent } from "hast"
import { type BlockDefinition, blockElement, h, mdastText, t } from "./types.ts"

interface ParagraphLike {
  type: string
  children?: unknown[]
}

export const kvDefinition: BlockDefinition = {
  name: "kv",
  kind: "container",
  implemented: true,
  attributes: [],
  values: {},
  example: ":::kv\nruntime: Bun\nhttp: Hono\ndb: bun:sqlite\n:::",
  render(ctx) {
    const rows: ElementContent[] = []
    for (const child of (ctx.node.children ?? []) as ParagraphLike[]) {
      if (child.type !== "paragraph") continue
      // remark ยุบหลายบรรทัดในย่อหน้าเป็น paragraph เดียว → แยกด้วย \n อีกชั้น
      for (const line of mdastText(child).split("\n")) {
        const colon = line.indexOf(":")
        if (colon <= 0) continue
        const key = line.slice(0, colon).trim()
        if (!key) continue
        rows.push(
          h("div", { dataPart: "kv-row" }, [
            h("dt", { dataPart: "kv-key" }, [t(key)]),
            h("dd", { dataPart: "kv-value" }, [t(line.slice(colon + 1).trim())]),
          ]),
        )
      }
    }
    if (rows.length === 0) return blockElement("dl", "kv", {}, ctx.children)
    return blockElement("dl", "kv", {}, rows)
  },
}
