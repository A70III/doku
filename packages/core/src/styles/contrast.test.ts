/**
 * Lock คู่สีทั้งหมดด้วย WCAG contrast (docs/08 ข้อ 47)
 *
 * ทำไมต้องมี: ตอน audit M3.1 เจอ 4 คลาสที่ "ผ่านตา" แต่ตก AA จริง
 * — เส้นขอบคอนโทรล 1.35:1 · ข้อความบน tint 4.14–4.47 · semantic บน panel 3.87–4.48
 *   · text-subtle บน bg-muted 4.33
 *
 * test นี้ **อ่านค่าจาก tokens.ts ตรง ๆ** (ผ่าน `contrast.ts` ที่ prod ใช้เหมือนกัน)
 * — เพิ่ม/แก้สีโดยไม่ผ่านคู่ที่กำหนด = แดง
 */

import { describe, expect, test } from "bun:test"
import { type Color, contrast, mixSrgb, over, readTokens, resolve } from "./contrast.ts"
import { TOKENS_CSS } from "./tokens.ts"

const { light: LIGHT, dark: DARK } = readTokens()

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
