import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

/**
 * Regression test — zen mode layout พัง (คอลัมน์อ่านยุบชิดซ้าย ไม่จัดกลาง)
 *
 * อาการ: เข้าโหมด zen (data-zen ซ่อน rail/TOC) แล้วคอลัมน์เนื้อหาไม่ขยาย
 * เต็มหน้าจอ — ยุบรวมไปชิดซ้ายแบบแบน ไม่จัดกลาง อ่านยาก
 *
 * root cause: `.doku-shell` เป็น grid 3 track `248px | minmax(0,1fr) | 208px`
 * (48rem+ เป็น `248px | minmax(0,1fr)`) โดย .doku-rail/.doku-toc-col/.doku-main
 * วางด้วย auto-placement ตามลำดับ แต่กฎ zen แค่ `display: none` ลูกสองตัวแรก —
 * ไม่รีเซ็ต grid-template-columns ของ shell เมื่อ rail/toc-col หายไป
 * `.doku-main` (ลูกเดียวที่เหลือ) จึงถูก auto-place ลง track แรก = track rail
 * ที่ fix ไว้ 248px → คอลัมน์อ่านกว้าง 248px ติดซ้ายของ shell (max-width 90rem,
 * margin auto) ไม่จัดกลาง · article (max-width 74ch, margin-inline auto) ถูก
 * clamp ลงใน container แคบ ๆ นี้
 *
 * อ้างอิง: docs/03 §2 / docs/08 ข้อ 49 — layout invariant "คอลัมน์อ่าน (จัดกลาง)"
 * และ docs/08 ข้อ 8 (zen mode)
 *
 * วิธีทดสอบ: parse app.css จริง → เลียนแบบ cascade (media query + specificity)
 * ภายใต้ html[data-zen] ที่ viewport กว้าง → คอลัมน์ที่ .doku-main ตกอยู่ต้อง
 * ยืดหยุ่น (fr) ไม่ใช่ track px ตายตัว (หรือ .doku-main ต้อง span ครบทุก track)
 */

const APP_CSS = readFileSync(new URL("../src/web/styles/app.css", import.meta.url), "utf8")

type Rule = { sel: string; decls: Map<string, string>; media: string }

/** mini CSS parser — รองรับ comment, @media/@layer/@supports ซ้อน, selector list */
export function parseCss(raw: string): Rule[] {
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, "")
  const rules: Rule[] = []
  let i = 0

  function parseBlock(media: string): void {
    while (i < css.length) {
      // อ่าน header จนเจอ { } หรือ ; (statement เช่น @import จบด้วย ;)
      const start = i
      while (i < css.length && !"{;}".includes(css[i] ?? "")) i += 1
      if (i >= css.length) return
      const stop = css[i]
      const header = css.slice(start, i).trim()
      if (stop === ";") {
        i += 1
        continue
      }
      if (stop === "}") {
        i += 1
        return // จบ block ปัจจุบัน (ปล่อยให้ caller วนต่อ)
      }
      i += 1 // กลืน "{"
      if (/^@(media|layer|supports)\b/.test(header)) {
        let inner = media
        if (header.startsWith("@media")) {
          const cond = header.slice("@media".length).trim()
          inner = media ? `${media} and ${cond}` : cond
        }
        parseBlock(inner)
        continue
      }
      if (header.startsWith("@")) {
        // at-rule อื่น (เช่น @keyframes) — ข้ามทั้ง block
        let depth = 1
        while (i < css.length && depth > 0) {
          if (css[i] === "{") depth += 1
          else if (css[i] === "}") depth -= 1
          i += 1
        }
        continue
      }
      // rule ปกติ — อ่าน declarations จนปิด block (ไม่มี CSS nesting ในไฟล์นี้)
      const bodyStart = i
      let depth = 1
      while (i < css.length) {
        if (css[i] === "{") depth += 1
        else if (css[i] === "}") {
          depth -= 1
          if (depth === 0) break
        }
        i += 1
      }
      const body = css.slice(bodyStart, i)
      i += 1 // กลืน "}"
      const decls = new Map<string, string>()
      for (const d of body.split(";")) {
        const idx = d.indexOf(":")
        if (idx === -1) continue
        decls.set(d.slice(0, idx).trim().toLowerCase(), d.slice(idx + 1).trim())
      }
      for (const s of header.split(",")) rules.push({ sel: s.trim(), decls, media })
    }
  }

  parseBlock("")
  return rules
}

/** viewport กว้าง (1280px ≥ 75rem) — ทุกเงื่อนไข min-width ต้องผ่าน */
function mediaMatches(media: string, viewportPx: number): boolean {
  if (!media) return true
  for (const cond of media.split(" and ")) {
    const min = cond.trim().match(/\(min-width:\s*([\d.]+)(px|rem)\)/)
    if (min) {
      const px = min[2] === "rem" ? Number(min[1]) * 16 : Number(min[1])
      if (viewportPx < px) return false
    }
    const max = cond.trim().match(/\(max-width:\s*([\d.]+)(px|rem)\)/)
    if (max) {
      const px = max[2] === "rem" ? Number(max[1]) * 16 : Number(max[1])
      if (viewportPx > px) return false
    }
    // เช่น (prefers-reduced-motion: no-preference) — ไม่เกี่ยวกับ layout ปล่อยผ่าน
  }
  return true
}

/** specificity แบบง่าย — พอสำหรับเทียบ .doku-shell vs html[data-zen] .doku-shell */
function specificity(sel: string): number {
  let s = 0
  for (const c of sel.split(/[\s>~+]+/).filter(Boolean)) {
    s += 100 * (c.match(/[.[#]/g)?.length ?? 0)
    const rest = c
      .replace(/\[[^\]]*\]/g, "")
      .replace(/[.#][\w-]+/g, "")
      .trim()
    if (/^[a-zA-Z][\w-]*$/.test(rest)) s += 1
  }
  return s
}

/** รวมค่า effective ของ property หนึ่งจากทุก rule ที่ match (specificity สูงชนะ, เสมอกันตัวหลังชนะ) */
function effective(
  rules: Rule[],
  baseSel: string,
  prop: string,
  viewportPx: number,
): string | undefined {
  const matching = rules
    .map((r, order) => ({ r, order }))
    .filter(({ r }) => {
      const isBase = r.sel === baseSel
      const isZenScoped = r.sel.includes("[data-zen]") && r.sel.endsWith(` ${baseSel}`)
      if (!isBase && !isZenScoped) return false
      return mediaMatches(r.media, viewportPx)
    })
  if (matching.length === 0) return undefined
  matching.sort((a, b) => specificity(a.r.sel) - specificity(b.r.sel) || a.order - b.order)
  // ไล่จากท้าย: ตัวแรกที่ประกาศ property นี้คือค่า effective
  for (let k = matching.length - 1; k >= 0; k -= 1) {
    const v = matching[k]?.r.decls.get(prop)
    if (v !== undefined) return v
  }
  return undefined
}

/** แยก track list — track คั่นด้วย whitespace (ไม่ใช่ comma) และไม่ตัดกลาง minmax(...) */
function splitTracks(cols: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of cols) {
    if (ch === "(") depth += 1
    else if (ch === ")") depth -= 1
    if (/\s/.test(ch) && depth === 0) {
      if (cur.trim()) out.push(cur.trim())
      cur = ""
    } else {
      cur += ch
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

const isFlexibleTrack = (track: string) => /\d*\.?\d+fr\b/.test(track)

describe("zen mode layout — คอลัมน์อ่านต้องไม่ตกลง track 248px ของ rail", () => {
  const rules = parseCss(APP_CSS)

  for (const [label, viewportPx] of [
    ["จอ ≥ 48rem (shell = 248px | 1fr)", 800],
    ["จอ ≥ 75rem (shell = 248px | 1fr | 208px)", 1280],
  ] as const) {
    test(`${label}: ภายใต้ data-zen .doku-main ต้องกินพื้นที่เต็มแล้วจัดกลาง`, () => {
      // precondition ของ simulation: zen ต้องซ่อน rail + toc-col จริง
      expect(effective(rules, ".doku-rail", "display", viewportPx)).toBe("none")
      expect(effective(rules, ".doku-toc-col", "display", viewportPx)).toBe("none")

      const cols = effective(rules, ".doku-shell", "grid-template-columns", viewportPx)
      expect(cols).toBeDefined()

      // ทางแก้ที่ถูกต้องได้อีกแบบ: .doku-main span ครบทุก track (grid-column: 1 / -1)
      const mainSpan = effective(rules, ".doku-main", "grid-column", viewportPx)
      if (mainSpan && /\/\s*-1\b|span\s+all/i.test(mainSpan)) return

      // ไม่งั้น main ถูก auto-place ลง track แรก — track นั้นต้องยืดหยุ่น ไม่ใช่ px ตายตัว
      const firstTrack = splitTracks(cols ?? "")[0]
      if (!firstTrack || !isFlexibleTrack(firstTrack)) {
        throw new Error(
          `zen mode คอลัมน์อ่าน (.doku-main) ตกลง track แรก "${firstTrack}" ของ ` +
            `.doku-shell (grid-template-columns: "${cols}") — rail/TOC ถูก display:none ` +
            `ไปแล้วแต่ track 248px ยังอยู่ ทำให้เนื้อหายุบชิดซ้าย ไม่จัดกลาง (docs/08 ข้อ 49)`,
        )
      }

      // จัดกลาง: article ต้องคง margin-inline: auto ภายใน main ที่กว้างเต็ม
      const articleMargin = effective(rules, ".doku-article", "margin-inline", viewportPx)
      expect(articleMargin).toContain("auto")
    })
  }
})
