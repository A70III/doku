import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { CLIENT_JS } from "../src/web/client.ts"

/**
 * M3.2 Track C — block layer (docs/09 §3.2–3.3 · docs/08 ข้อ 64/66/67/70/71)
 *
 * ตรวจสัญญาที่เป็น "สถาปัตยกรรม": คีย์ล็อกมาก่อน defaultKeymap · gutter เป็น overlay
 * ของ client · ทุก operation ผ่าน editor/blocks.ts (md → md) · touch = long-press
 */

const EDITOR_SOURCE = readFileSync(new URL("../src/web/editor.ts", import.meta.url), "utf8")
const APP_CSS = readFileSync(new URL("../src/web/styles/app.css", import.meta.url), "utf8")

describe("Track C — keymap (docs/08 ข้อ 70)", () => {
  test("คีย์ของ Doku มาก่อน defaultKeymap + Tab ใช้ `shift:` แบบ CM6", () => {
    expect(EDITOR_SOURCE).toContain("...markdownKeymap,")
    const dokuAt = EDITOR_SOURCE.indexOf('key: "Mod-Shift-ArrowUp"')
    const defaultAt = EDITOR_SOURCE.indexOf("...defaultKeymap,")
    expect(dokuAt).toBeGreaterThan(-1)
    expect(defaultAt).toBeGreaterThan(dokuAt)
    // ไม่ผูก indentWithTab (Tab = nest ตาม block model ผ่าน runBlockOp)
    expect(EDITOR_SOURCE).not.toContain("run: indentMore")
    expect(EDITOR_SOURCE).toContain('shift: (view) => runBlockOp(view, "outdent")')
  })

  test("binding ครบตาม §2.3/§4", () => {
    for (const key of [
      '"Mod-Shift-ArrowUp"',
      '"Mod-Shift-ArrowDown"',
      '"Mod-d"',
      '"Shift-Delete"',
      '"Mod-Backspace"',
      '"Mod-/"',
      '"Mod-a"',
      '"Escape"',
    ]) {
      expect(EDITOR_SOURCE).toContain(`key: ${key}`)
    }
  })

  test("operation ทั้งหมดเขียนกลับเป็น markdown ผ่าน editor/blocks.ts (ไม่มี state ซ่อน)", () => {
    expect(EDITOR_SOURCE).toContain('from "./editor/blocks.ts"')
    expect(EDITOR_SOURCE).toContain("function replaceDocument(")
    // change ที่เล็กที่สุด (カーไม่กระโดด/undo ละเอียด)
    expect(EDITOR_SOURCE).toContain("while (endOld > start && endNew > start")
  })

  test("block decorations มาจาก StateField/plugin (ไม่ inline DOM hack)", () => {
    expect(EDITOR_SOURCE).toContain("const hoverBlockField = StateField.define")
    expect(EDITOR_SOURCE).toContain("const blockSelectionField = StateField.define")
    expect(EDITOR_SOURCE).toContain("cm-doku-block-hover")
    expect(EDITOR_SOURCE).toContain("cm-doku-block-selected")
  })
})

describe("Track C — gutter overlay + drag & drop (docs/08 ข้อ 66/67/71)", () => {
  test("gutter เป็น overlay: follow mouse ต่อ frame + delay 200ms + hit-area", () => {
    for (const marker of [
      "z-doku-gutter",
      "requestAnimationFrame",
      "gutterHideTimer = window.setTimeout",
      "200",
      "inRect(el, event, 6)",
      "pointermove",
      "blockAtPoint",
      "highlight(block.from, block.to)",
    ]) {
      expect(CLIENT_JS).toContain(marker)
    }
    expect(APP_CSS).toContain(".z-doku-gutter")
    expect(APP_CSS).toContain(".doku-gutter-btn")
  })

  test("drag & drop: indicator + depth จากแนวนอน + ยกเลิกได้ + 1 งาน/frame", () => {
    for (const marker of [
      "doku-drop-indicator",
      "dragFrame",
      "moveBlockTo(",
      "pointercancel",
      "onDragCancel",
      "Math.round((x - rect.left - 24) / 24)",
    ]) {
      expect(CLIENT_JS).toContain(marker)
    }
    expect(APP_CSS).toContain(".doku-drop-indicator")
    expect(APP_CSS).toContain("--drop-depth")
  })

  test("touch = long-press 150ms (ไม่มี hover บนมือถือ — docs/08 ข้อ 71)", () => {
    expect(CLIENT_JS).toContain("touchstart")
    expect(CLIENT_JS).toContain("150")
    expect(CLIENT_JS).toContain("longPressTimer")
  })

  test("ทุก action ในเมนูมีคีย์ลัดเทียบเท่า (DoD)", () => {
    for (const label of ["ย้ายขึ้น", "ย้ายลง", "ทำสำเนา", "ซ้อน (nest)", "ลบ block", "H1"]) {
      expect(CLIENT_JS).toContain(label)
    }
    expect(CLIENT_JS).toContain("Mod+Shift+↑")
    expect(CLIENT_JS).toContain("Shift+Delete")
  })
})
