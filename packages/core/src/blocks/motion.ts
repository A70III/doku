/**
 * `:::motion{effect delay duration once}` — scroll-reveal (docs/03)
 *
 * - CSS animation ล้วน ไม่มี library · JS (IntersectionObserver ตัวเดียว) เป็นคนใส่ `data-visible`
 * - จำกัด effect/delay/duration เป็น allowlist → กัน CSS injection และคุมดีไซน์
 * - `prefers-reduced-motion` + `render.motion=false` → ปิด (CSS + JS)
 */

import { type BlockDefinition, blockElement, flag } from "./types.ts"

const EFFECTS = [
  "fade",
  "fade-up",
  "fade-down",
  "slide-left",
  "slide-right",
  "scale",
  "blur-in",
] as const

/** `200`, `200ms` → 200 · ค่าอื่น = null */
function ms(value: string | undefined): number | null {
  if (!value) return null
  const match = /^(\d{1,4})(?:ms)?$/.exec(value)
  return match?.[1] ? Number(match[1]) : null
}

/** ปัดเป็นสเต็ป 100ms แล้ว clamp — ทำให้ CSS มีชุดค่าจำกัด */
function quantize(value: number | null, fallback: number, max: number): number {
  if (value === null) return fallback
  return Math.min(max, Math.round(value / 100) * 100)
}

export const motionDefinition: BlockDefinition = {
  name: "motion",
  kind: "container",
  implemented: true,
  attributes: ["effect", "delay", "duration", "once"],
  values: { effect: EFFECTS },
  example: ":::motion{effect=fade-up delay=200ms duration=400ms once=true}\nเนื้อหาที่จะค่อยๆ โผล่\n:::",
  render(ctx) {
    const effect = ctx.attrs.effect ?? "fade-up"
    if (ctx.attrs.delay && ms(ctx.attrs.delay) === null) {
      ctx.warn("block_attribute_unknown", `motion delay ต้องเป็น ms: ${ctx.attrs.delay}`)
    }
    if (ctx.attrs.duration && ms(ctx.attrs.duration) === null) {
      ctx.warn("block_attribute_unknown", `motion duration ต้องเป็น ms: ${ctx.attrs.duration}`)
    }
    // `once` ไม่ระบุ = true (default ของ block) · ถ้าระบุต้องใช้ semantics กลาง (`{once}` `once=1` `once=yes`)
    // — เดิมเทียบ `=== "false"` จึงกลับด้าน: `once=0` / `once=no` กลายเป็น true
    const once = "once" in ctx.attrs ? flag(ctx.attrs, "once") : true
    return blockElement(
      "div",
      "motion",
      {
        dataEffect: effect,
        dataDelay: String(quantize(ms(ctx.attrs.delay), 0, 2000)),
        dataDuration: String(quantize(ms(ctx.attrs.duration), 400, 3000)),
        dataOnce: once ? "true" : "false",
      },
      ctx.children,
    )
  },
}
