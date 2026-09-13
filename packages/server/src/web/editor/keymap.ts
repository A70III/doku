/**
 * keymap ของ editor (M3.2 Track E — แยกจาก `editor.ts`)
 *
 * **คีย์ล็อกของ Doku มาก่อน `defaultKeymap` เสมอ** (docs/08 ข้อ 54/70/74):
 * `Mod+i` → italic (override `selectParentSyntax`) · `Mod+/` → Turn into (override `toggleComment`)
 * · `Mod+a` → เลือก block แล้วทั้งเอกสาร · `Escape` → บันได 2 จังหวะ (เลือก block → ยกเลิก + ออก)
 * · `Tab`/`Shift-Tab` → nest ตาม block model · `Mod+Shift+↑/↓` `Mod+d` `Shift+Delete` = block ops
 * · `Mod+b/e/k/Shift+s` = inline layer · ไม่มี underline
 */

import { defaultKeymap, historyKeymap } from "@codemirror/commands"
import { markdownKeymap } from "@codemirror/lang-markdown"
import type { KeyBinding } from "@codemirror/view"
import {
  blockSelectionField,
  blocksInView,
  runBlockOp,
  selectBlockAtCursor,
  setBlockSelection,
  setHighlight,
  targetBlock,
} from "./block-layer.ts"
import { type InlineSelection, selectionInfo, toggleMarkAt } from "./inline-layer.ts"

/** เฉพาะ callback ที่คีย์ล็อกต้องใช้ — `DokuEditorOptions` ของ editor.ts เข้ากันได้ */
export interface KeymapOptions {
  onLink?: (info: InlineSelection) => void
  onTurnInto?: (target: { from: number; to: number; x: number; y: number }) => void
  onSave?: (md: string) => void
}

export function dokuKeymap(options: KeymapOptions): KeyBinding[] {
  return [
    // คีย์ล็อกของ Doku มาก่อน defaultKeymap (docs/08 ข้อ 70)
    ...markdownKeymap,
    // inline layer (Track D): Mod+i/Mod+Shift+s/Mod+e/Mod+b/Mod+k — Docs 09 §2.3
    { key: "Mod-b", preventDefault: true, run: (view) => toggleMarkAt(view, "bold") },
    { key: "Mod-i", preventDefault: true, run: (view) => toggleMarkAt(view, "italic") },
    { key: "Mod-Shift-s", preventDefault: true, run: (view) => toggleMarkAt(view, "strike") },
    { key: "Mod-e", preventDefault: true, run: (view) => toggleMarkAt(view, "code") },
    {
      key: "Mod-k",
      preventDefault: true,
      run: (view) => {
        const info = selectionInfo(view)
        if (!info || !options.onLink) return false
        options.onLink(info)
        return true
      },
    },
    {
      // ใช้ `shift:` แบบเดียวกับ indentWithTab ของ CM6 — "Shift-Tab" ตรง ๆ ไม่ถูก match
      key: "Tab",
      preventDefault: true,
      run: (view) => runBlockOp(view, "indent"),
      shift: (view) => runBlockOp(view, "outdent"),
    },
    { key: "Mod-Shift-ArrowUp", preventDefault: true, run: (view) => runBlockOp(view, "moveUp") },
    {
      key: "Mod-Shift-ArrowDown",
      preventDefault: true,
      run: (view) => runBlockOp(view, "moveDown"),
    },
    { key: "Mod-d", preventDefault: true, run: (view) => runBlockOp(view, "duplicate") },
    { key: "Shift-Delete", preventDefault: true, run: (view) => runBlockOp(view, "delete") },
    {
      key: "Mod-Backspace",
      run: (view) =>
        view.state.field(blockSelectionField, false) ? runBlockOp(view, "delete") : false,
    },
    {
      key: "Mod-/",
      preventDefault: true,
      run: (view) => {
        const blocks = blocksInView(view)
        const block = targetBlock(view, blocks)
        if (!block || !options.onTurnInto) return false
        const coords = view.coordsAtPos(block.from)
        options.onTurnInto({
          from: block.from,
          to: block.to,
          x: (coords?.left ?? 0) + 24,
          y: (coords?.bottom ?? 0) + 4,
        })
        return true
      },
    },
    {
      key: "Mod-a",
      run: (view) => {
        // จังหวะ 1 = เลือก block · จังหวะ 2 = ทั้งเอกสาร (defaultKeymap)
        if (view.state.field(blockSelectionField, false)) {
          view.dispatch({ effects: setBlockSelection.of(null) })
          return false
        }
        return selectBlockAtCursor(view)
      },
    },
    {
      key: "Escape",
      // จังหวะ 1 = เลือก block (คง focus) · จังหวะ 2 = ยกเลิกแล้ว **ออกจากเอกสาร**
      // (docs/08 ข้อ 54 "Esc = ออก" + ข้อ 70 "Esc = เลือก block" รวมกันเป็นบันได 2 จังหวะ)
      // stopPropagation: chrome ต้องไม่ blur ระหว่างจังหวะ 1 (ไม่งั้นカーหลุดก่อนเลือก block)
      stopPropagation: true,
      run: (view) => {
        if (view.state.field(blockSelectionField, false)) {
          view.dispatch({ effects: [setBlockSelection.of(null), setHighlight.of(null)] })
          // ออกจากเอกสารด้วยกลไกของ CM เอง — จบวงที่ 2 จังหวะ ไม่มีจังหวะ 3
          view.contentDOM.blur()
          return true
        }
        return selectBlockAtCursor(view)
      },
    },
    ...defaultKeymap,
    ...historyKeymap,
    {
      key: "Mod-s",
      preventDefault: true,
      // กัน client handler ยิง flush ซ้ำ (คีย์นี้เป็นของผิวเอกสาร — docs/08 ข้อ 74)
      stopPropagation: true,
      run: (view) => {
        options.onSave?.(view.state.doc.toString())
        return true
      },
    },
  ]
}
