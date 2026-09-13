/**
 * block layer ของ editor (M3.2 Track C — แยกจาก `editor.ts`)
 *
 * `BlockInfo`/operation ทั้งหมดเป็น pure md → md อยู่ที่ `blocks.ts` · ที่นี่คือ "state ของ view":
 * hover · block selection · highlight + operation ที่เขียนกลับผ่าน change ที่เล็กที่สุด
 * (docs/08 ข้อ 64/66/70 · ทุก op มีคีย์ลัดเทียบเท่า)
 */

import { EditorSelection, type EditorState, StateEffect, StateField } from "@codemirror/state"
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view"
import {
  type BlockInfo,
  type BlockKind,
  blockAtCursor,
  computeBlocks,
  deleteBlock,
  duplicateBlock,
  indentBlock,
  moveBlock,
  outdentBlock,
} from "./blocks.ts"

/* ── block layer (M3.2 Track C — docs/09 §3.2 · docs/08 ข้อ 64/66/70) ─────
   block = line range จาก `computeBlocks` (Lezer + fence scan ต่อ visible range)
   · state ทั้งหมดของ "block layer" เป็น StateField (มีผลต่อ decoration)
   · ทุก operation เขียนกลับเป็น markdown ผ่าน `editor/blocks.ts` (ไม่มี state ซ่อน) */

/** ข้อมูล block ที่ส่งให้ client (gutter/menu/drag ใช้ร่วมกัน) */
export interface BlockHit {
  from: number
  to: number
  kind: BlockKind
  depth: number
  headLine: number
  childCount: number
}

export type BlockOp = "moveUp" | "moveDown" | "duplicate" | "delete" | "indent" | "outdent"

export function toHit(block: BlockInfo): BlockHit {
  return {
    from: block.from,
    to: block.to,
    kind: block.kind,
    depth: block.depth,
    headLine: block.headLine,
    childCount: block.childCount,
  }
}

export const setHighlight = StateEffect.define<{ from: number; to: number } | null>()
export const setBlockSelection = StateEffect.define<{ from: number; to: number } | null>()

/** สร้าง line decorations สำหรับช่วง [from, to] ด้วยคลาสเดียว */
function rangeLines(
  doc: EditorState["doc"],
  range: { from: number; to: number },
  cls: string,
): DecorationSet {
  const out: Array<{ from: number; to: number; value: Decoration }> = []
  const first = doc.lineAt(Math.max(0, Math.min(range.from, doc.length)))
  const last = doc.lineAt(Math.max(0, Math.min(range.to, doc.length)))
  for (let n = first.number; n <= last.number; n += 1) {
    const line = doc.line(n)
    out.push({ from: line.from, to: line.from, value: Decoration.line({ class: cls }) })
  }
  return Decoration.set(
    out.map((entry) => entry.value.range(entry.from, entry.to)),
    true,
  )
}

/** hover = decoration ล้วน (ไม่ต้อง query ตำแหน่ง) */
export const hoverBlockField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const item of tr.effects) {
      if (item.is(setHighlight)) {
        return item.value
          ? rangeLines(tr.state.doc, item.value, "cm-doku-block-hover")
          : Decoration.none
      }
    }
    return value.map(tr.changes)
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** block selection เก็บ "ช่วง" ไว้ด้วย (keymap/Backspace ต้องรู้) */
export const blockSelectionField = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(value, tr) {
    for (const item of tr.effects) {
      if (item.is(setBlockSelection)) return item.value
    }
    if (tr.docChanged && value) {
      return { from: tr.changes.mapPos(value.from, -1), to: tr.changes.mapPos(value.to, 1) }
    }
    return value
  },
})

export const selectedDecoField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    const range = tr.state.field(blockSelectionField)
    const changed = tr.docChanged || tr.effects.some((item) => item.is(setBlockSelection))
    if (!changed) return value.map(tr.changes)
    return range ? rangeLines(tr.state.doc, range, "cm-doku-block-selected") : Decoration.none
  },
  provide: (field) => EditorView.decorations.from(field),
})

/** block ทั้งหมดในช่วงที่มองเห็น */
export function blocksInView(view: EditorView): BlockInfo[] {
  return computeBlocks(view.state, view.viewport.from, view.viewport.to)
}

/** block ที่ operation จะทำงานด้วย — block selection มาก่อน แล้วจึง block ที่カーอยู่ */
export function targetBlock(view: EditorView, blocks: readonly BlockInfo[]): BlockInfo | null {
  const selected = view.state.field(blockSelectionField, false)
  if (selected) {
    const block =
      blocks.find((item) => item.from === selected.from) ??
      computeBlocks(view.state, selected.from, selected.to).find(
        (item) => item.from === selected.from,
      )
    if (block) return block
  }
  return blockAtCursor(view.state, blocks)
}

/** เขียน md ใหม่ด้วย **change ที่เล็กที่สุด** (prefix/suffix ร่วม)
 *  - เล็กกว่า = undo ละเอียดกว่า และカーไม่กระโดด (replacing ทั้งเอกสารทำให้カーไปที่ 0) */
export function replaceDocument(view: EditorView, md: string, event: string): void {
  const oldText = view.state.doc.toString()
  if (oldText === md) return
  const max = Math.min(oldText.length, md.length)
  let start = 0
  while (start < max && oldText[start] === md[start]) start += 1
  let endOld = oldText.length
  let endNew = md.length
  while (endOld > start && endNew > start && oldText[endOld - 1] === md[endNew - 1]) {
    endOld -= 1
    endNew -= 1
  }
  view.dispatch({
    changes: { from: start, to: endOld, insert: md.slice(start, endNew) },
    userEvent: event,
  })
}

export function runBlockOp(
  view: EditorView,
  op: BlockOp,
  range?: { from: number; to: number } | null,
): boolean {
  const blocks = blocksInView(view)
  const block = range
    ? (blocks.find((item) => item.from === range.from && item.to === range.to) ??
      computeBlocks(view.state, range.from, range.to).find((item) => item.from === range.from))
    : targetBlock(view, blocks)
  if (!block) return false
  const md = view.state.doc.toString()
  const next =
    op === "moveUp"
      ? moveBlock(md, block, blocks, -1)
      : op === "moveDown"
        ? moveBlock(md, block, blocks, 1)
        : op === "duplicate"
          ? duplicateBlock(md, block, blocks)
          : op === "delete"
            ? deleteBlock(md, block, blocks)
            : op === "indent"
              ? indentBlock(md, block)
              : outdentBlock(md, block)
  if (next === null || next === md) return false
  replaceDocument(view, next, `doku.block.${op}`)
  view.dispatch({ effects: [setBlockSelection.of(null), setHighlight.of(null)] })
  return true
}

/** เลือก block ที่カーอยู่ (ใช้ Esc / Mod-a) */
export function selectBlockAtCursor(view: EditorView): boolean {
  const blocks = blocksInView(view)
  const block = blockAtCursor(view.state, blocks)
  if (!block) return false
  view.dispatch({
    selection: EditorSelection.range(block.from, block.to),
    effects: setBlockSelection.of({ from: block.from, to: block.to }),
  })
  return true
}
