/**
 * Rhythm guard — ระยะแนวตั้งของ prose (docs/03 §1.4 · docs/08 ข้อ 69)
 *
 * ทำไมต้องมี: ตั้งแต่ M1 ระยะระหว่าง block ในเอกสาร **ไม่เคยถูกใช้เลย**
 * `.doku-prose > * + * { margin-top: var(--d-flow) }` มี specificity (0,1,0)
 * (`*` ไม่เพิ่ม specificity) จึงแพ้ `.doku-prose p { margin: 0 }` (0,1,1)
 * และ `margin: 0` เป็น shorthand ที่ reset `margin-top` ไปด้วย →
 * **ย่อหน้าทุกตัว margin-top: 0** (ย่อหน้าติดกันเป็นพืด ไม่มีย่อหน้า)
 * อาการเดียวกันกับ `pre` · `blockquote` · `kv` · `callout` · `figure` · `timeline` · `margin-note`
 *
 * test นี้จึงบังคับ 2 สัญญา:
 * 1. **flow rule เป็นเจ้าของระยะแนวตั้งเพียงตัวเดียว** — rule ที่ตั้ง margin-top: 0
 *    ต้องมี specificity น้อยกว่า flow rule เสมอ (หรือหนีด้วย `:first-child`/`:where()`)
 * 2. prose ตั้งระยะแนวตั้งได้เฉพาะ `0` หรือ token (`var(--d-…)`) — ห้ามเลขลอย
 */

import { describe, expect, test } from "bun:test"
import { BLOCKS_CSS } from "./blocks.ts"
import { PROSE_CSS } from "./prose.ts"

const CONTENT_CSS = `${PROSE_CSS}\n${BLOCKS_CSS}`

type Specificity = [number, number, number]

interface Rule {
  selector: string
  body: string
  /** at-rule ที่ครอบอยู่ เช่น `@media (min-width: 1400px)` */
  at: string
}

const MARK = { id: "\uE000", cls: "\uE001", type: "\uE002" }

/** แยกด้วย separator ที่ระดับบนสุด (ไม่ยุ่งกับที่อยู่ในวงเล็บ) */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of text) {
    if (char === "(") depth += 1
    if (char === ")") depth -= 1
    if (char === separator && depth === 0) {
      parts.push(current.trim())
      current = ""
      continue
    }
    current += char
  }
  parts.push(current.trim())
  return parts.filter(Boolean)
}

/** แทน `:fn(…)` ด้วยค่าที่ map คืน (จัดการวงเล็บซ้อนให้) */
function replaceFunctional(selector: string, fn: string, map: (body: string) => string): string {
  let out = ""
  let index = 0
  while (index < selector.length) {
    const at = selector.indexOf(`${fn}(`, index)
    if (at === -1) {
      out += selector.slice(index)
      break
    }
    let depth = 0
    let end = at + fn.length
    for (; end < selector.length; end += 1) {
      if (selector[end] === "(") depth += 1
      else if (selector[end] === ")") {
        depth -= 1
        if (depth === 0) break
      }
    }
    out += selector.slice(index, at) + map(selector.slice(at + fn.length + 1, end))
    index = end + 1
  }
  return out
}

const maxOf = (list: Specificity[]): Specificity =>
  list.reduce((acc, value) => (compare(value, acc) > 0 ? value : acc), spec(0, 0, 0))

const compare = (a: Specificity, b: Specificity): number =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

const spec = (ids: number, classes: number, types: number): Specificity => [ids, classes, types]

/** specificity ตาม CSS Selectors Level 4 — `:where()` = 0 · `:is()`/`:not()` = ตัวที่มากสุดใน args */
function specificity(selector: string): Specificity {
  const withoutQuoted = selector.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
  let text = replaceFunctional(withoutQuoted, ":where", () => "")
  for (const fn of [":is", ":not", ":has"]) {
    text = replaceFunctional(text, fn, (body) => {
      // spec: ใช้ specificity ของ argument ที่มากสุด (เทียบแบบ lexicographic ไม่ใช่ elementwise)
      const best = maxOf(splitTopLevel(body, ",").map((part) => specificity(part)))
      return ` ${MARK.id.repeat(best[0])}${MARK.cls.repeat(best[1])}${MARK.type.repeat(best[2])} `
    })
  }
  const pseudoElements = text.match(/::[\w-]+/g) ?? []
  const rest = text.replace(/::[\w-]+/g, "")
  const ids = (rest.match(/\uE000/g) ?? []).length + (rest.match(/#[\w-]+/g) ?? []).length
  const classes =
    (rest.match(/\uE001/g) ?? []).length +
    (rest.match(/\.[\w-]+/g) ?? []).length +
    (rest.match(/\[[^\]]*\]/g) ?? []).length +
    (rest.match(/:(?!:)[\w-]+(\([^()]*\))?/g) ?? []).length
  const types =
    (rest.match(/\uE002/g) ?? []).length +
    pseudoElements.length +
    (rest.match(/(?:^|[\s>+~,])([a-z][\w-]*)/g) ?? []).length
  return spec(ids, classes, types)
}

/** เดิน CSS ออกมาเป็น rule (แบน at-rule ให้ด้วย เพื่อรู้ว่า rule อยู่ใน media ไหน) */
function parseRules(source: string, at = "", out: Rule[] = []): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "")
  let index = 0
  let start = 0
  while (index < css.length) {
    if (css[index] === ";") {
      start = index + 1
      index += 1
      continue
    }
    if (css[index] !== "{") {
      index += 1
      continue
    }
    const prelude = css.slice(start, index).trim()
    let depth = 1
    let end = index + 1
    while (end < css.length && depth > 0) {
      if (css[end] === "{") depth += 1
      else if (css[end] === "}") depth -= 1
      end += 1
    }
    const inner = css.slice(index + 1, end - 1)
    if (prelude.startsWith("@")) {
      parseRules(inner, at ? `${at} ${prelude}` : prelude, out)
    } else {
      out.push({ selector: prelude, body: inner, at })
    }
    index = end
    start = end
  }
  return out
}

const RULES = parseRules(CONTENT_CSS)
const RULE_SELECTORS = (rule: Rule): string[] => splitTopLevel(rule.selector, ",")

/** rule ที่ให้ระยะแนวตั้งจาก rhythm token (`--d-flow` / `--dk-flow` override) */
const isRhythmRule = (rule: Rule): boolean =>
  /margin(-block-start|-top|-block)?\s*:\s*[^;]*var\(--(d|dk)-flow/.test(rule.body)

const FLOW_RULES = RULES.filter(isRhythmRule)

/** rhythm ของ "ลูกโดยตรงของ `.doku-prose`" — เจ้าของระยะระดับเอกสาร (ต้องแรงสุด) */
const TOP_LEVEL_RHYTHM = FLOW_RULES.filter((rule) =>
  RULE_SELECTORS(rule).some((selector) => selector.startsWith(".doku-prose >")),
)

/** specificity ต่ำสุดในบรรดา flow rule — rule อื่นที่ตั้ง margin-top: 0 ต้องน้อยกว่านี้ */
const FLOW_BASELINE = FLOW_RULES.flatMap(RULE_SELECTORS).reduce<Specificity>(
  (acc, selector) => {
    const value = specificity(selector)
    return compare(value, acc) < 0 ? value : acc
  },
  spec(99, 99, 99),
)

const format = (value: Specificity): string => `(${value.join(",")})`

describe("rhythm — สัญญาที่ต้องถือ (docs/08 ข้อ 69)", () => {
  test("ตัวคำนวณ specificity ตรงกับ Selectors Level 4", () => {
    expect(specificity(".doku-prose > * + *")).toEqual(spec(0, 1, 0))
    expect(specificity(".doku-prose p")).toEqual(spec(0, 1, 1))
    expect(specificity(".doku-prose :where(p, div)")).toEqual(spec(0, 1, 0))
    expect(specificity(".doku-prose :is(section, [data-block='col'])")).toEqual(spec(0, 2, 0))
    expect(specificity(".doku-prose [data-block='kv']")).toEqual(spec(0, 2, 0))
    expect(specificity(".doku-prose > :not(:first-child):not(:is(h1, h2, hr))")).toEqual(
      spec(0, 2, 1),
    )
    expect(specificity("#a .b c:hover::before")).toEqual(spec(1, 2, 2))
    expect(specificity(".doku-prose li > :not(:first-child):not(:is(ul, ol))")).toEqual(
      spec(0, 2, 2),
    )
  })

  test("มี flow rule ครอบทุก container ที่เป็นเจ้าของ rhythm", () => {
    const selectors = FLOW_RULES.flatMap(RULE_SELECTORS)
    expect(selectors.some((s) => s.startsWith(".doku-prose > "))).toBe(true)
    expect(selectors.some((s) => s.includes(":is(section, blockquote,"))).toBe(true)
    expect(selectors.some((s) => s.includes("[data-part='card-body']"))).toBe(true)
    expect(selectors.some((s) => s.startsWith(".doku-prose li > "))).toBe(true)
  })

  test("block หนักใช้ `--d-flow-loose` จริง (docs/03 §1.4 — เดิม define ไว้แต่ไม่ถูกใช้)", () => {
    expect(FLOW_RULES.some((rule) => rule.body.includes("var(--d-flow-loose)"))).toBe(true)
    for (const heavy of ["pre", "table", "figure", "[data-block='gallery']"]) {
      const match = FLOW_RULES.filter(
        (rule) => rule.body.includes("--d-flow-loose") && rule.selector.includes(heavy),
      )
      expect(match.length, `${heavy} ต้องได้ --d-flow-loose`).toBeGreaterThan(0)
    }
  })

  test("top-level rhythm ต้องแรงพอที่จะชนะ margin reset ของ element (≥ 0,2,1)", () => {
    // กับดักเดิม: `.doku-prose > * + *` = (0,1,0) → แพ้ `.doku-prose p { margin: 0 }` (0,1,1)
    expect(TOP_LEVEL_RHYTHM.length).toBeGreaterThan(0)
    const weakest = TOP_LEVEL_RHYTHM.flatMap(RULE_SELECTORS).reduce<Specificity>(
      (acc, selector) => {
        const value = specificity(selector)
        return compare(value, acc) < 0 ? value : acc
      },
      spec(99, 99, 99),
    )
    expect(compare(weakest, spec(0, 2, 1))).toBeGreaterThanOrEqual(0)
  })

  test("rhythm ใช้ `:not(:first-child)` ไม่ใช่ `* + *` (`*` ไม่เพิ่ม specificity)", () => {
    const selectors = TOP_LEVEL_RHYTHM.flatMap(RULE_SELECTORS)
    expect(selectors.every((selector) => selector.includes(":not(:first-child)"))).toBe(true)
  })

  test("block ที่ตามหลัง heading ไม่รับ flow (ระยะหลัง heading มาจาก `--d-rhythm-after`)", () => {
    // ไม่งั้น margin ของมัน collapse กับ margin-bottom 12px ของ heading → ห่าง 24px
    // (อ่านเหมือนเว้นบรรทัดเกิน — เจอจากการใช้งานจริง)
    const selectors = FLOW_RULES.flatMap(RULE_SELECTORS)
    expect(selectors.every((selector) => selector.includes("+ *)"))).toBe(true)
    expect(selectors.every((selector) => selector.includes("h1"))).toBe(true)
  })

  test("ไม่มี rule ไหนตั้ง margin-top: 0 ที่ specificity เท่าหรือชนะ flow rule", () => {
    const zeroTop = /margin(-block-start|-top|-block)?\s*:\s*(0|0px)\s*(?=[;\s}]|$)/
    const offenders: string[] = []
    for (const rule of RULES) {
      if (!zeroTop.test(rule.body)) continue
      for (const selector of RULE_SELECTORS(rule)) {
        if (!selector.includes(".doku-prose")) continue
        // `:first-child` ไม่มีทาง match flow child (flow เป็น `:not(:first-child)`)
        // `:where()` มี specificity 0 → เทียบก็ผ่านอยู่แล้ว
        if (selector.includes(":first-child") || selector.includes(":where(")) continue
        if (compare(specificity(selector), FLOW_BASELINE) >= 0) {
          offenders.push(
            `${selector} ${format(specificity(selector))} ≥ flow ${format(FLOW_BASELINE)}`,
          )
        }
      }
    }
    expect(offenders).toEqual([])
  })

  test("prose ตั้งระยะแนวตั้งด้วย token เท่านั้น (ห้ามเลขลอย — docs/03 §1.4)", () => {
    const vertical =
      /(?:^|[\s;])(margin-top|margin-block-start|margin-block|margin)\s*:\s*([^;]+);/g
    const offenders: string[] = []
    for (const rule of RULES) {
      if (!RULE_SELECTORS(rule).some((selector) => selector.includes(".doku-prose"))) continue
      for (const match of rule.body.matchAll(vertical)) {
        const value = (match[2] as string).trim()
        const first = value.split(/\s+/)[0] as string
        if (first === "0" || first === "0px" || /^var\(--(d|dk)-/.test(first)) continue
        offenders.push(`${rule.selector} → ${match[1]}: ${value}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
