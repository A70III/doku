/**
 * rehype-sanitize allowlist ของ Kairn
 *
 * หลักการ (docs/06):
 * - raw HTML ไม่ผ่านตั้งแต่ remark-rehype (ไม่เปิด allowDangerousHtml) → นี่คือชั้นที่ 2
 * - ไม่ให้ `style` (AI-risk สูง) — block ที่เราคุมใช้ `data-*` + class
 * - `href`/`src` จำกัด protocol; `javascript:` ถูกตัด
 * - ปิด clobberPrefix เพื่อให้ id ของ heading (rehype-slug) ใช้เป็น anchor ได้ตรง ๆ
 *
 * หมายเหตุลำดับ pipeline: sanitize ทำงาน "ก่อน" plugin ที่เราเชื่อถือได้ (KaTeX/Shiki/asset rewrite)
 * เพราะ plugin เหล่านั้นเป็น deterministic function ของ tree ที่ sanitize แล้ว และต้องใช้ `style`
 * — เนื้อหาที่ AI เขียน (raw HTML/directive attr/href) ถูกกรองครบก่อนถึงจุดนั้น
 */

import type { Options as SanitizeOptions } from "rehype-sanitize"
import { defaultSchema } from "rehype-sanitize"

const K = /^kairn-/

/** รูปแบบ attribute entry ของ hast-util-sanitize: `"id"` = อะไรก็ได้ · `["className", ...allowed]` */
type AttrList = NonNullable<NonNullable<SanitizeOptions["attributes"]>[string]>
type AttrEntry = AttrList[number]

function entryName(entry: AttrEntry): string {
  return typeof entry === "string" ? entry : entry[0]
}

/** รวม entry ชื่อเดียวกัน — "ค่าอะไรก็ได้" (string) ชนะ tuple เสมอ */
function mergeEntries(name: string, a: AttrEntry, b: AttrEntry): AttrEntry {
  if (typeof a === "string" || typeof b === "string") return typeof a === "string" ? a : b
  return [name, ...a.slice(1), ...b.slice(1)]
}

function byName(list: AttrList): Map<string, AttrEntry> {
  const map = new Map<string, AttrEntry>()
  for (const entry of list) {
    const name = entryName(entry)
    const existing = map.get(name)
    map.set(name, existing === undefined ? entry : mergeEntries(name, existing, entry))
  }
  return map
}

/**
 * ต่อ attribute allowlist ของ tag โดยรวม entry ชื่อซ้ำให้เป็นตัวเดียว
 * (ถ้าไม่รวม `className` ตัว default จะชนะและคลาสของเราถูกตัดทิ้ง)
 */
function attrs(tag: keyof NonNullable<SanitizeOptions["attributes"]>, extra: AttrList): AttrList {
  const current = (defaultSchema.attributes?.[tag] ?? []) as AttrList
  const merged = byName(current)
  for (const [name, entry] of byName(extra)) {
    const existing = merged.get(name)
    merged.set(name, existing === undefined ? entry : mergeEntries(name, existing, entry))
  }
  return [...merged.values()]
}

const GLOBAL_EXTRA: AttrList = [
  "dir",
  "lang",
  "data*",
  "role",
  "ariaHidden",
  "ariaLabel",
  "ariaLabelledBy",
  "ariaDescribedBy",
  "ariaExpanded",
  "ariaControls",
]

export const kairnSanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  // id ที่ rehype-slug สร้างเป็นของเรา (ไม่มี raw HTML ที่แอบตั้ง id ได้) → ไม่ต้อง prefix
  clobber: [],
  clobberPrefix: "",
  tagNames: [
    ...new Set([
      ...(defaultSchema.tagNames ?? []),
      "aside",
      "mark",
      "figure",
      "figcaption",
      "video",
      "audio",
      "button",
      "label",
      "hr",
      "sup",
      "sub",
      "del",
    ]),
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": attrs("*", GLOBAL_EXTRA),
    a: attrs("a", [["className", K], "target", "rel"]),
    img: attrs("img", ["loading", "decoding"]),
    video: attrs("video", [
      ["className", K],
      "src",
      "poster",
      "controls",
      "loop",
      "muted",
      "preload",
      "playsInline",
      "data*",
    ]),
    audio: attrs("audio", [
      ["className", K],
      "src",
      "controls",
      "loop",
      "muted",
      "preload",
      "data*",
    ]),
    source: attrs("source", ["src", "type", "media", "srcSet"]),
    li: attrs("li", [["className", "task-list-item", K]]),
    span: attrs("span", [["className", K, "math-inline", "math-display", "katex"]]),
    div: attrs("div", [["className", K, "math-display", "katex-display"]]),
    code: attrs("code", [["className", K]]),
    pre: attrs("pre", [["className", K, "shiki"]]),
    h1: attrs("h1", [["className", K], "id"]),
    h2: attrs("h2", [["className", K], "id"]),
    h3: attrs("h3", [["className", K], "id"]),
    h4: attrs("h4", [["className", K], "id"]),
    h5: attrs("h5", [["className", K], "id"]),
    h6: attrs("h6", [["className", K], "id"]),
    figure: attrs("figure", [["className", K], "data*"]),
    figcaption: attrs("figcaption", [["className", K]]),
    aside: attrs("aside", [["className", K], "data*"]),
    section: attrs("section", [["className", K], "data*"]),
    details: attrs("details", [["className", K]]),
    summary: attrs("summary", [["className", K]]),
    button: attrs("button", [["className", K], "type", "data*"]),
    label: attrs("label", [["className", K]]),
    mark: attrs("mark", [
      ["className", K, "red", "orange", "amber", "yellow", "green", "teal", "blue", "purple"],
    ]),
    table: attrs("table", [["className", K]]),
    td: attrs("td", ["align"]),
    th: attrs("th", ["align", "scope"]),
    input: attrs("input", ["checked", "disabled"]),
  },
  protocols: {
    ...defaultSchema.protocols,
    // docs/06: http(s) + relative + `/` + `#` เท่านั้น (ตัด irc/xmpp ของ default ออก)
    href: ["http", "https"],
    src: ["http", "https"],
  },
}
