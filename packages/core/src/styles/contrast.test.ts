/**
 * Lock คู่สีทั้งหมดด้วย WCAG contrast (docs/08 ข้อ 47)
 *
 * ทำไมต้องมี: ตอน audit M3.1 เจอ 4 คลาสที่ "ผ่านตา" แต่ตก AA จริง
 * — เส้นขอบคอนโทรล 1.35:1 · ข้อความบน tint 4.14–4.47 · semantic บน panel 3.87–4.48
 *   · text-subtle บน bg-muted 4.33
 *
 * test นี้ **อ่านค่าจาก tokens.ts ตรง ๆ** (ไม่ copy ตัวเลข) และจำลอง
 * `color-mix()` ตาม CSS Color 5 — เพิ่ม/แก้สีโดยไม่ผ่านคู่ที่กำหนด = แดง
 */

import { describe, expect, test } from "bun:test"
import { TOKENS_CSS } from "./tokens.ts"

type Rgb = [number, number, number]
interface Color {
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
const mixSrgb = (a: Color, b: Color, p: number): Color => mixColors(a, b, p, 1 - p, "srgb")

/** composite สีที่มี alpha ทับ backdrop */
const over = (fg: Color, bg: Color): Color => ({
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

function resolve(name: string, map: Map<string, string>, seen: string[] = []): Color {
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

/* ── ชุดค่าที่จะตรวจ ─────────────────────────────────────────────────── */

const SURFACES = ["--k-bg", "--k-app-bg", "--d-bg-subtle", "--d-bg-muted"] as const
const HUES = ["red", "orange", "amber", "yellow", "green", "teal", "blue", "purple"] as const
const TEXT_LEVELS = ["--k-text", "--d-text-muted", "--d-text-subtle"] as const
const SEMANTIC = ["success", "warning", "danger", "info", "tip"] as const

const AA_TEXT = 4.5
const AA_UI = 3

for (const [mode, map] of [
  ["light", LIGHT],
  ["dark", DARK],
] as const) {
  const at = (name: string): Color => resolve(name, map)
  const pairs = SURFACES.map((s) => ({ name: s, color: at(s) }))

  describe(`tokens (${mode}) — คู่สีผ่าน WCAG`, () => {
    test("ตัวอักษรทุกชั้นผ่าน AA บนพื้นทุกชั้น (รวม bg-muted)", () => {
      const failures: string[] = []
      for (const text of TEXT_LEVELS) {
        for (const surface of pairs) {
          const ratio = contrast(at(text), surface.color)
          if (ratio < AA_TEXT) failures.push(`${text} on ${surface.name} = ${ratio.toFixed(2)}`)
        }
      }
      expect(failures).toEqual([])
    })

    test("accent ผ่าน AA เป็นข้อความ และ 3:1 เป็น focus ring", () => {
      const failures: string[] = []
      for (const surface of pairs) {
        const ratio = contrast(at("--d-accent"), surface.color)
        if (ratio < AA_TEXT) failures.push(`accent on ${surface.name} = ${ratio.toFixed(2)}`)
        if (ratio < AA_UI) failures.push(`accent ring on ${surface.name} = ${ratio.toFixed(2)}`)
      }
      expect(failures).toEqual([])
    })

    test("ทุก hue ผ่าน AA บนพื้นทุกชั้น และบน tint ของตัวเอง 12%", () => {
      const failures: string[] = []
      for (const hue of HUES) {
        const color = at(`--k-${hue}`)
        for (const surface of pairs) {
          const ratio = contrast(color, surface.color)
          if (ratio < AA_TEXT) failures.push(`--k-${hue} on ${surface.name} = ${ratio.toFixed(2)}`)
        }
        const tint = mixSrgb(color, at("--k-bg"), 0.12)
        const onTint = contrast(color, tint)
        if (onTint < AA_TEXT) failures.push(`--k-${hue} on own 12% tint = ${onTint.toFixed(2)}`)
      }
      expect(failures).toEqual([])
    })

    test("hue-ink ผ่าน AA บนพื้นทุกชั้น + tint 9% และ 12%", () => {
      const failures: string[] = []
      for (const hue of HUES) {
        const ink = at(`--k-${hue}-ink`)
        for (const surface of pairs) {
          const ratio = contrast(ink, surface.color)
          if (ratio < AA_TEXT)
            failures.push(`--k-${hue}-ink on ${surface.name} = ${ratio.toFixed(2)}`)
        }
        for (const pct of [0.09, 0.12]) {
          const tint = mixSrgb(at(`--k-${hue}`), at("--k-bg"), pct)
          const ratio = contrast(ink, tint)
          if (ratio < AA_TEXT)
            failures.push(`--k-${hue}-ink on ${pct * 100}% tint = ${ratio.toFixed(2)}`)
        }
      }
      expect(failures).toEqual([])
    })

    test("semantic เป็น alias ของ palette (ไม่ใช่สีชุดที่สอง)", () => {
      const aliases: Record<string, string> = {
        success: "green",
        warning: "amber",
        danger: "red",
        info: "blue",
        tip: "purple",
      }
      for (const key of SEMANTIC) {
        const alias = map.get(`--k-${key}`) as string
        expect(alias).toBe(`var(--k-${aliases[key]})`)
      }
      expect(contrast(at("--k-quote"), at("--k-bg"))).toBeGreaterThanOrEqual(AA_TEXT)
    })

    test("ข้อความบน accent / scrim ผ่าน AA", () => {
      expect(contrast(at("--k-on-accent"), at("--d-accent"))).toBeGreaterThanOrEqual(AA_TEXT)
      for (const surface of pairs) {
        const scrim = over(at("--k-scrim"), surface.color)
        expect(contrast(at("--k-on-scrim"), scrim)).toBeGreaterThanOrEqual(AA_TEXT)
      }
    })

    test("::selection — ink อ่านออก และเห็นขอบเขตการเลือก", () => {
      const selection = at("--d-selection")
      for (const surface of pairs) {
        const painted = over(selection, surface.color)
        expect(contrast(at("--k-text"), painted)).toBeGreaterThanOrEqual(AA_TEXT)
      }
    })

    test("เส้นขอบคอนโทรลผ่าน WCAG 1.4.11 (3:1)", () => {
      const failures: string[] = []
      for (const surface of ["--k-bg", "--d-bg-subtle"] as const) {
        const ratio = contrast(at("--d-border-control"), at(surface))
        if (ratio < AA_UI) failures.push(`--d-border-control on ${surface} = ${ratio.toFixed(2)}`)
      }
      expect(failures).toEqual([])
    })

    test("hue-ink ประกาศด้วยสูตรจาก --k-text (ไม่ hardcode hex)", () => {
      for (const hue of HUES) {
        expect(map.get(`--k-${hue}-ink`)).toBe(
          `color-mix(in oklab, var(--k-${hue}) 78%, var(--k-text))`,
        )
      }
      const selectionPct = mode === "light" ? 24 : 30
      expect(map.get("--d-selection")).toBe(
        `color-mix(in srgb, var(--d-accent) ${selectionPct}%, transparent)`,
      )
    })
  })
}

describe("tokens — สัญญาระหว่างธีม", () => {
  test("token สีทุกตัวถูก define ทั้ง light และ dark", () => {
    const derived = [
      "--d-accent-weak",
      "--d-accent-tint",
      "--d-selection",
      "--k-success",
      "--k-warning",
      "--k-danger",
      "--k-info",
      "--k-tip",
      "--k-quote",
    ]
    const missing: string[] = []
    for (const [name, value] of LIGHT) {
      if (!/^#[0-9a-f]{6}$/i.test(value)) continue // non-color token — ไม่ต้องมีใน dark
      if (derived.includes(name) || name.endsWith("-ink")) continue
      if (!DARK.has(name)) missing.push(name)
      else if (!/^#[0-9a-f]{6}$/i.test(DARK.get(name) as string)) {
        missing.push(`${name} (dark ไม่ใช่ hex)`)
      }
    }
    expect(missing).toEqual([])
  })

  test("dark theme emit ทั้ง selector และ prefers-color-scheme (โหมด auto)", () => {
    expect(TOKENS_CSS).toContain("[data-theme='dark']")
    expect(TOKENS_CSS).toContain("@media (prefers-color-scheme: dark)")
    expect(TOKENS_CSS).toContain("[data-theme='auto']")
  })
})
