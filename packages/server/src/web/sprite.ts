/**
 * SVG sprite ของ chrome — ไอคอนที่ซ้ำหลายสิบครั้งต่อหน้า (เมนูแถว · โฟลเดอร์ · ปุ่ม)
 * เรนเดอร์ `<symbol>` ครั้งเดียวต่อหน้า แล้วทุกที่อ้างด้วย `<use href="#ic-name">`
 *
 * เดิม: sidebar 42+ แถวฝัง `<svg>` เต็ม ๆ ต่อแถว → HTML บวม ~31KB และ DOM +250 โหนด
 */

import { LUCIDE_ICONS, type LucideIconName } from "@doku/core"

export const SPRITE_ICONS = [
  "more-horizontal",
  "folder",
  "file-text",
  "search",
  "file-plus-2",
  "folder-plus",
  "trash-2",
  "x",
  "chevron-down",
  "chevron-right",
  "list",
  "list-checks",
  "tag",
  "pin",
  "save",
  "undo-2",
  "sun",
  "moon",
  "maximize-2",
  "panel-left",
  "octagon-alert",
  "arrow-right",
  "palette",
  "command",
  "house",
  "pencil",
  "info",
] as const satisfies readonly LucideIconName[]

const IN_SPRITE = new Set<string>(SPRITE_ICONS)

export function inSprite(name: string): boolean {
  return IN_SPRITE.has(name)
}

/** markup ของ sprite ทั้งก้อน — ฝังครั้งเดียวใน <body> */
export const SPRITE_HTML =
  `<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ` +
  `style="position:absolute;width:0;height:0;overflow:hidden">` +
  SPRITE_ICONS.map(
    (name) =>
      `<symbol id="ic-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
      `stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${LUCIDE_ICONS[name]}</symbol>`,
  ).join("") +
  `</svg>`
