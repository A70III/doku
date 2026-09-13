import { readFileSync } from "node:fs"

/**
 * ซอร์สของ "ชั้น editor" รวมทุกโมดูล — ใช้กับการทดสอบเชิงสัญญา (source-level contract)
 *
 * `editor.ts` ถูกแยกเป็น `editor/{blocks,inline,decorations}.ts` (M3.2 Track E) →
 * เทสต์ที่ตรวจว่า "โค้ด editor ทำอะไร" ต้องอ่าน **ทั้งชุด** ไม่ใช่ไฟล์เดียว
 * (ไม่งั้น refactor ที่ย้ายโค้ดจะทำให้เทสต์พังทั้งที่สัญญายังจริง)
 */

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8")
}

export const EDITOR_SOURCE = [
  read("../src/web/editor.ts"),
  read("../src/web/editor/decorations.ts"),
  read("../src/web/editor/block-layer.ts"),
  read("../src/web/editor/inline-layer.ts"),
  read("../src/web/editor/keymap.ts"),
  read("../src/web/editor/blocks.ts"),
  read("../src/web/editor/inline.ts"),
].join("\n")

/** เฉพาะ `editor.ts` — สำหรับสัญญาที่ต้องอยู่ที่ชั้นประกอบ (create/extensions/keymap) */
export const EDITOR_ENTRY = read("../src/web/editor.ts")

export const EDITOR_CSS = read("../src/web/styles/app.css")
