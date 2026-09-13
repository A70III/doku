/**
 * คณิตศาสตร์สีของ design token — **single source** ที่ทดสอบและหน้า /styleguide ใช้ร่วมกัน
 *
 * ทำไมอยู่ใน core (prod): หน้า `/styleguide` ต้องโชว์ "คู่สีที่ lock ไว้" พร้อมค่าจริง
 * ถ้าให้เป็นตัวเลขคงที่ในเทมเพลต มันจะ drift จาก token ทันทีที่แก้สี
 * → ที่นี่คำนวณจาก `TOKENS_CSS` จริง (รวม `color-mix()` ตามสเปก CSS Color 5)
 *
 * ใช้โดย: `contrast.test.ts` (ล็อกทุกคู่) และ `server/src/web/styleguide.ts` (โชว์ให้ตาเห็น)
 */

import { TOKENS_CSS } from "./tokens.ts"

export type Rgb = [number, number, number]
export interface Color {
  rgb: Rgb
  alpha: number
}

/* ── parse token ─────────────────────────────────────────────────────── */

const [LIGHT_PART, ...DARK_PARTS] = TOKENS_CSS.split("[data-theme='dark']")

function grabTokens(css: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const name = match[1] as string
    const value = (match[2] as string).trim()
    if (!map.has(name)) map.set(name, value)
  }
  return map
}

const LIGHT = grabTokens(LIGHT_PART ?? "")
/** dark = :root แล้ว override ด้วย DARK_TOKENS (จำลอง cascade จริง — token ที่ derive อยู่ที่ :root) */
const DARK = new Map([...LIGHT, ...grabTokens(DARK_PARTS.join(""))])

/* ── สี: sRGB ↔ OKLab (สเปกเดียวกับ CSS color-mix) ───────────────────── */

const srgbToLinear = (c: number): number => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const linearToSrgb = (v: number): number => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, c)) * 255)
}

function toOklab([r, g, b]: Rgb): Rgb {
  const [lr, lg, lb] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function fromOklab([L, A, B]: Rgb): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

const luminance = ({ rgb }: Color): number =>
  0.2126 * srgbToLinear(rgb[0]) + 0.7152 * srgbToLinear(rgb[1]) + 0.0722 * srgbToLinear(rgb[2])

/** WCAG 2.x contrast ratio */
export function contrast(a: Color, b: Color): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** color-mix ตาม CSS Color 5 — interpolate แบบ premultiplied alpha
 *  (`color-mix(in srgb, X 24%, transparent)` = X ที่ alpha .24 ไม่ใช่ X ผสมดำ 24%) */
function mixColors(a: Color, b: Color, pa: number, pb: number, space: "srgb" | "oklab"): Color {
  const sum = pa + pb || 1
  const alpha = (pa * a.alpha + pb * b.alpha) / sum
  const wA = (pa * a.alpha) / sum
  const wB = (pb * b.alpha) / sum
  const denom = alpha || 1
  const [ca, cb] = [a.rgb, b.rgb]
  const blended =
    space === "oklab"
      ? (() => {
          const [x, y] = [toOklab(ca), toOklab(cb)]
          return fromOklab(
            [0, 1, 2].map((i) => (x[i] as number) * wA + (y[i] as number) * wB) as Rgb,
          )
        })()
      : ([0, 1, 2].map((i) => (ca[i] as number) * wA + (cb[i] as number) * wB) as Rgb)
  return {
    rgb: [0, 1, 2].map((i) => Math.round((blended[i] as number) / denom)) as Rgb,
    alpha,
  }
}

/** color-mix(in srgb, a p%, b) — ทั้งคู่ opaque */
export const mixSrgb = (a: Color, b: Color, p: number): Color => mixColors(a, b, p, 1 - p, "srgb")

/** composite สีที่มี alpha ทับ backdrop */
export const over = (fg: Color, bg: Color): Color => ({
  rgb: [0, 1, 2].map((i) =>
    Math.round((fg.rgb[i] as number) * fg.alpha + (bg.rgb[i] as number) * (1 - fg.alpha)),
  ) as Rgb,
  alpha: 1,
})

/* ── resolve token → สีจริง (ตามประกาศใน tokens.ts) ─────────────────── */

function parseHex(value: string): Color {
  const hex = value.slice(1)
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex
  return {
    rgb: [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as Rgb,
    alpha: 1,
  }
}

export function resolve(name: string, map: Map<string, string>, seen: string[] = []): Color {
  if (seen.includes(name)) throw new Error(`token วนซ้ำ: ${[...seen, name].join(" → ")}`)
  const raw = map.get(name)
  if (!raw) throw new Error(`ไม่พบ token ${name}`)

  if (raw.startsWith("#")) return parseHex(raw)

  if (raw.startsWith("rgb(")) {
    const inner = raw.slice(4, -1)
    const [values, alphaPart] = inner.split("/")
    const rgb = (values as string).trim().split(/\s+/).map(Number) as Rgb
    return { rgb, alpha: alphaPart ? Number(alphaPart) : 1 }
  }

  if (raw.startsWith("var(")) {
    return resolve(raw.slice(4, -1).trim(), map, [...seen, name])
  }

  if (raw.startsWith("color-mix(")) {
    // color-mix(in <space>, <color> <pct>%, <color> [<pct>%])
    const inner = raw.slice("color-mix(".length, raw.lastIndexOf(")"))
    const comma = inner.indexOf(",")
    const space = inner.slice("in ".length, comma).trim()
    const [partA, partB] = inner.slice(comma + 1).split(",")
    const parseSide = (side: string): { color: Color; pct: number | null } => {
      const text = side.trim()
      const match = text.match(/^(.*?)\s+([\d.]+)%$/)
      const value = match ? (match[1] as string) : text
      const pct = match ? Number(match[2]) / 100 : null
      const color = value.startsWith("var(")
        ? resolve(value.slice(4, -1).trim(), map, [...seen, name])
        : value === "transparent"
          ? ({ rgb: [0, 0, 0], alpha: 0 } as Color)
          : parseHex(value)
      return { color, pct }
    }
    const a = parseSide(partA as string)
    const b = parseSide(partB as string)
    const pa = a.pct ?? 1 - (b.pct ?? 0)
    const pb = b.pct ?? 1 - pa
    return mixColors(a.color, b.color, pa, pb, space === "oklab" ? "oklab" : "srgb")
  }

  // clamp()/rem — ไม่ใช้กับสีในเทสต์นี้
  throw new Error(`อ่านสีจาก token ไม่ได้: ${name} = ${raw}`)
}

/** token ทั้งสองธีม — dark = :root แล้ว override ด้วย DARK_TOKENS (จำลอง cascade) */
export function readTokens(): { light: Map<string, string>; dark: Map<string, string> } {
  return { light: LIGHT, dark: DARK }
}

/** hue ทั้ง 8 ของ palette (ชื่อที่ใช้เป็น token) */
export const PALETTE_HUES = [
  "red",
  "orange",
  "amber",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
] as const

export interface PairReport {
  label: string
  fg: string
  bg: string
  ratio: number
  /** เกณฑ์ที่คู่สีนี้ต้องผ่าน (4.5 = ข้อความ AA · 3 = UI/1.4.11) */
  need: number
}

export interface PaletteSwatch {
  token: string
  name: string
  color: string
  ink: string
}

export interface ThemeReport {
  mode: "light" | "dark"
  swatches: PaletteSwatch[]
  pairs: PairReport[]
}

function cssColor(color: Color): string {
  const [r, g, b] = color.rgb
  return color.alpha < 1
    ? `rgba(${r}, ${g}, ${b}, ${color.alpha.toFixed(2)})`
    : `rgb(${r}, ${g}, ${b})`
}

/**
 * รายงานคู่สีสำหรับหน้า styleguide — ใช้เกณฑ์เดียวกับ contrast.test.ts
 * (ข้อความ AA 4.5 · เส้นขอบคอนโทรล/โฟกัส 3.0)
 */
export function paletteReport(): ThemeReport[] {
  const { light, dark } = readTokens()
  const modes: Array<{ mode: "light" | "dark"; map: Map<string, string> }> = [
    { mode: "light", map: light },
    { mode: "dark", map: dark },
  ]

  return modes.map(({ mode, map }) => {
    const at = (name: string): Color => resolve(name, map)
    const bg = at("--k-bg")
    const surfaces: Array<[string, Color]> = [
      ["--k-bg", bg],
      ["--k-app-bg", at("--k-app-bg")],
      ["--d-bg-subtle", at("--d-bg-subtle")],
      ["--d-bg-muted", at("--d-bg-muted")],
    ]

    const swatches: PaletteSwatch[] = PALETTE_HUES.map((hue) => {
      const token = `--k-${hue}`
      return {
        token,
        name: hue,
        color: cssColor(at(token)),
        ink: cssColor(at(`${token}-ink`)),
      }
    })

    const pairs: PairReport[] = []
    const push = (label: string, fg: Color, background: Color, need: number): void => {
      pairs.push({
        label,
        fg: cssColor(fg),
        bg: cssColor(background),
        ratio: Number(contrast(fg, background).toFixed(2)),
        need,
      })
    }

    for (const [name, surface] of surfaces) {
      push("--k-text บน " + name, at("--k-text"), surface, 4.5)
      push("--d-text-subtle บน " + name, at("--d-text-subtle"), surface, 4.5)
      push("--d-accent บน " + name, at("--d-accent"), surface, 4.5)
    }
    push("--d-border-control บน --k-bg", at("--d-border-control"), bg, 3)
    push("--k-on-accent บน --d-accent", at("--k-on-accent"), at("--d-accent"), 4.5)
    for (const hue of PALETTE_HUES) {
      const tint = mixSrgb(at(`--k-${hue}`), bg, 0.12)
      push(`--k-${hue}-ink บน tint 12% ของตัวเอง`, at(`--k-${hue}-ink`), tint, 4.5)
    }
    return { mode, swatches, pairs }
  })
}
