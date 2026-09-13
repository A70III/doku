/**
 * inline layer ของ editor (M3.2 Track D — แยกจาก `editor.ts`)
 *
 * ทางการ: `inline.ts` = ตรรกะ pure md → md · ที่นี่ = ตัวเชื่อมกับ view
 * (dispatch change ที่เล็กที่สุด · composition guard · รายงาน selection ให้ client)
 */

import type { EditorView } from "@codemirror/view"
import { blockSelectionField } from "./block-layer.ts"
import {
  applyLink,
  detectMarks,
  type InlineMark,
  linkAt,
  minimalChange,
  type TextEdit,
  toggleInlineMark,
} from "./inline.ts"

export interface InlineSelection {
  from: number
  to: number
  /** พิกัดบนจอ (viewport) ของช่วงที่เลือก — ไม่รวม scroll */
  rect: { left: number; right: number; top: number; bottom: number }
  /** mark ที่ selection อยู่ในช่วงของมัน — client ตั้ง aria-pressed */
  marks: InlineMark[]
  /** ลิงก์ที่カー/selection อยู่ (null = ยังไม่มี) — popover แก้/ลบได้ */
  link: { label: string; url: string } | null
}

/* ── inline layer (M3.2 Track D — docs/09 §5 Track D) ────────────────────
   ทุก action เขียนกลับเป็น markdown เสมอ (ไฟล์คือความจริง — docs/08 ข้อ 63)
   · change ที่เล็กที่สุด (minimalChange) → カーไม่กระโดด/undo ละเอียด
   · ห้ามแตะระหว่าง IME composition (docs/08 ข้อ 69) */

/** dispatch edit ที่ได้จาก inline.ts — ยิง change/selection ชุดเดียว (userEvent สำหรับ undo) */
export function applyTextEdit(view: EditorView, edit: TextEdit, event: string): boolean {
  if (!edit.changed) return false
  const change = minimalChange(view.state.doc.toString(), edit.text)
  if (!change) return false
  view.dispatch({
    changes: change,
    selection: { anchor: edit.from, head: edit.to },
    userEvent: event,
    scrollIntoView: true,
  })
  return true
}

/** ครอบ/ถอด mark ที่ selection ปัจจุบัน (คีย์ลัด + bubble) */
export function toggleMarkAt(
  view: EditorView,
  kind: InlineMark,
  color: string | null = null,
): boolean {
  const { from, to } = view.state.selection.main
  return applyTextEdit(
    view,
    toggleInlineMark(view.state.doc.toString(), from, to, kind, color),
    "doku.inline.mark",
  )
}

/** ลิงก์ที่カー/selection สัมผัสอยู่ (ใช้ทั้ง popover และ setLink) */
function linkAround(
  view: EditorView,
): { from: number; to: number; label: string; url: string } | null {
  const { from, to } = view.state.selection.main
  const text = view.state.doc.toString()
  const hit = linkAt(text, from) ?? linkAt(text, to)
  if (!hit) return null
  return { from: hit.from, to: hit.to, label: hit.label, url: hit.url }
}

/** ใส่/แก้/ลบลิงก์ที่ selection (url ว่าง = ถอดลิงก์) */
export function setLinkAt(view: EditorView, url: string): boolean {
  const { from, to } = view.state.selection.main
  const existing = linkAround(view)
  const target = existing ?? { from, to }
  return applyTextEdit(
    view,
    applyLink(view.state.doc.toString(), target.from, target.to, url, target.from),
    "doku.inline.link",
  )
}

/** พิกัดบนจอของช่วงที่เลือก (สำหรับ bubble toolbar) */
function selectionRect(view: EditorView, from: number, to: number): InlineSelection["rect"] | null {
  const start = view.coordsAtPos(from, 1)
  const end = view.coordsAtPos(Math.max(from, to - 1), -1)
  if (!start || !end) return null
  return {
    left: Math.min(start.left, end.left),
    right: Math.max(start.left, end.left, start.right, end.right),
    top: Math.min(start.top, end.top),
    bottom: Math.max(start.bottom, end.bottom),
  }
}

/** ข้อมูล inline ของ selection — null = ไม่มีอะไรให้ bubble ทำ */
export function selectionInfo(view: EditorView): InlineSelection | null {
  const { from, to } = view.state.selection.main
  // block selection คือการเลือก "block" ไม่ใช่ข้อความ — bubble ต้องไม่โผล่ (docs/09 §4)
  if (view.state.field(blockSelectionField, false)) return null
  const existing = linkAround(view)
  if (from === to) {
    // カーในลิงก์ = ยังต้องมี popover (แก้/ลบ URL) แต่ไม่มี bubble จัดรูปแบบ
    if (!existing) return null
  }
  const rect = selectionRect(view, from, to)
  if (!rect) return null
  const text = view.state.doc.toString()
  return {
    from,
    to,
    rect,
    marks: from === to ? [] : detectMarks(text, from, to),
    link: existing ? { label: existing.label, url: existing.url } : null,
  }
}
