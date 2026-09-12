/**
 * ชุด CSS ของเนื้อหาเอกสาร (design system) — ใช้ร่วม CLI preview + server
 * ลำดับสำคัญ: tokens → prose → blocks (block อ้าง token และ prose)
 */

import { BLOCKS_CSS } from "./blocks.ts"
import { PROSE_CSS } from "./prose.ts"
import { TOKENS_CSS } from "./tokens.ts"

export const CONTENT_CSS = `${TOKENS_CSS}\n${PROSE_CSS}\n${BLOCKS_CSS}`

export { BLOCKS_CSS, PROSE_CSS, TOKENS_CSS }
