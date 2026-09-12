/**
 * Block registry — จุดเดียวที่นิยาม custom block ทั้งหมด (docs/03 syntax reference)
 *
 * สถานะ M0: ลงทะเบียน "ชื่อที่รู้จัก" ครบแล้ว แต่ยังไม่ implement renderer
 *   → render เป็น code block + warning `block_unimplemented` (ตาม docs/01 error handling)
 *   → M2 จะเติม `render`/`validate` แล้วปิด warning พร้อมทำ `/styleguide`
 * ชื่อที่ไม่อยู่ใน registry เลย = `block_unknown` (พิมพ์ผิด) ซึ่งจะกลายเป็น error ที่ `kairn check`
 */

export type DirectiveKind = "container" | "leaf" | "text"

export interface BlockDefinition {
  name: string
  kind: DirectiveKind
  /** M0 = ยังไม่ implement, M2 = มี renderer จริง */
  stage: "M2" | "M0"
  implemented: boolean
  /** ตัวอย่าง syntax สั้น ๆ — ป้อน `/api/schema` + `/styleguide` ที่ M2/M4 */
  syntax?: string
}

function container(name: string, syntax: string): BlockDefinition {
  return { name, kind: "container", stage: "M2", implemented: false, syntax }
}

function text(name: string, syntax: string): BlockDefinition {
  return { name, kind: "text", stage: "M2", implemented: false, syntax }
}

export const BLOCKS: readonly BlockDefinition[] = [
  // Callout — 7 type (docs/08 ข้อ 14)
  ...["note", "info", "tip", "success", "warning", "danger", "quote"].map((name) =>
    container(name, `:::${name}{title="…"}`),
  ),
  // Media
  container("figure", ':::figure{src=assets/x.svg caption="…" width=70% align=center}'),
  container("gallery", ":::gallery{cols=3}"),
  container("video", ":::video{src=assets/demo.mp4 poster=assets/cover.png}"),
  // Primitive
  container("card", ':::card{title="…" href="/d/…" badge=BETA}'),
  container("section", ":::section{type=hero}"),
  container("grid", ":::grid{cols=2 gap=md}"),
  container("col", ":::col"),
  // Data
  container("kv", ":::kv"),
  container("stats", ":::stats"),
  container("progress", ':::progress{value=70 label="M2 — blocks"}'),
  container("steps", ":::steps"),
  container("timeline", ":::timeline"),
  // Annotation
  container("margin-note", ":::margin-note{side=right}"),
  container("motion", ":::motion{effect=fade-up delay=200ms duration=400ms once=true}"),
  // Interactive
  container("details", ':::details{summary="…" open=false}'),
  container("tabs", ":::tabs"),
  container("tab", ':::tab{label="macOS"}'),
  // Inline (leaf/text directive)
  text("badge", ":badge[BETA]{color=green}"),
  text("stat", ':stat[42]{label="เอกสาร"}'),
]

const BLOCK_INDEX = new Map(BLOCKS.map((block) => [block.name, block]))

export function findBlock(name: string): BlockDefinition | undefined {
  return BLOCK_INDEX.get(name)
}

/** ชื่อ block ที่รู้จักทั้งหมด — ให้ agent ตรวจก่อนเขียน (ใช้ที่ /api/schema) */
export function blockNames(): string[] {
  return BLOCKS.map((block) => block.name)
}
