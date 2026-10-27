/**
 * ประกอบ client JS จากส่วนย่อย — เรียงตามลำดับการทำงานเดิมทุก byte
 *
 * ทุกส่วนอยู่IIFE เดียวกัน (ต่อกันก่อนรัน) → ตัวแปร/ฟังก์ชันใช้ร่วมกันได้เหมือนเดิม
 * ไม่มีการเปลี่ยนพฤติกรรม: มีเทสเทียบว่าข้อความที่ต่อออกมาเท่าเดิม
 */

import { ACTIONS_JS } from "./actions.ts"
import { BLOCK_STRIP_JS } from "./block-strip.ts"
import { CORE_JS } from "./core.ts"
import { HELPERS_JS } from "./helpers.ts"
import { MARK_STRIP_JS } from "./mark-strip.ts"
import { MISC_JS } from "./misc.ts"
import { PALETTE_JS } from "./palette.ts"
import { UI_JS } from "./ui.ts"
import { WRITING_ANCHOR_JS } from "./writing-anchor.ts"
import { WRITING_ENTER_JS } from "./writing-enter.ts"
import { WRITING_SURFACE_JS } from "./writing-surface.ts"

export const CLIENT_JS =
  CORE_JS +
  HELPERS_JS +
  UI_JS +
  ACTIONS_JS +
  WRITING_SURFACE_JS +
  WRITING_ANCHOR_JS +
  BLOCK_STRIP_JS +
  WRITING_ENTER_JS +
  MARK_STRIP_JS +
  PALETTE_JS +
  MISC_JS
