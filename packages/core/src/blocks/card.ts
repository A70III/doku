/**
 * `:::card{title href badge icon}` — การ์ดลิงก์ ใช้ประกอบใน `:::grid` (docs/03)
 * `href` รับได้ทั้ง path ในเว็บ (`/d/…`), relative (`./a.md`) และ path id ตรง ๆ (`projects/doku/design`)
 */

import { hasIcon } from "../icons/index.ts"
import { type BlockDefinition, blockElement, h, t } from "./types.ts"

const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i

function normalizeHref(href: string | undefined): string | undefined {
  if (!href) return undefined
  if (URL_LIKE.test(href)) return href
  if (href.endsWith(".md")) return href // ให้ rewrite แปลงเป็น /d/<path>
  return `/d/${href.replace(/^\.?\//, "")}`
}

export const cardDefinition: BlockDefinition = {
  name: "card",
  kind: "container",
  implemented: true,
  attributes: ["title", "href", "badge", "icon"],
  values: {},
  example:
    ':::card{title="Doku Design" href="projects/doku/design" badge=BETA}\nสรุปสั้นของเอกสาร\n:::',
  render(ctx) {
    const properties: Record<string, unknown> = {}
    const href = normalizeHref(ctx.attrs.href)
    if (href) properties.href = href
    if (ctx.attrs.icon) {
      if (hasIcon(ctx.attrs.icon)) properties.dataIcon = ctx.attrs.icon
      else ctx.warn("icon_unknown", `ไม่รู้จักไอคอน: ${ctx.attrs.icon} — ไม่แสดง`)
    }

    const head = []
    if (ctx.attrs.badge) {
      head.push(
        h("span", { dataBlock: "badge", dataPart: "card-badge", dataColor: "blue" }, [
          t(ctx.attrs.badge),
        ]),
      )
    }
    head.push(h("span", { dataPart: "card-title" }, [t(ctx.attrs.title ?? "")]))

    const children = [h("div", { dataPart: "card-head" }, head)]
    if (ctx.children.length > 0) {
      children.push(h("div", { dataPart: "card-body" }, ctx.children))
    }
    return blockElement("a", "card", properties, children)
  },
}
