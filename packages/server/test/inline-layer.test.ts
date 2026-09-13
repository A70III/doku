import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { CLIENT_JS } from "../src/web/client.ts"
import { EDITOR_SOURCE as EDITOR_LAYER_SOURCE } from "./editor-source.ts"

/**
 * M3.2 Track D — inline layer (docs/09 §5 Track D · §2.3 · docs/08 ข้อ 69/70)
 *
 * ตรวจสัญญาที่เป็น "สถาปัตยกรรม": คีย์ inline มาก่อน defaultKeymap · ทุก action
 * เขียน markdown ผ่าน `editor/inline.ts` (md → md) · bubble เป็น overlay ของ client
 * · smart paste ไม่มี HTML ดิบหลุด · IME guard ยังอยู่
 *
 * editor.ts แตะ `window` ตอน import → อ่านซอร์สเหมือน test เดิมของ editor
 */

const EDITOR_SOURCE = EDITOR_LAYER_SOURCE
const APP_CSS = readFileSync(new URL("../src/web/styles/app.css", import.meta.url), "utf8")

describe("Track D — keymap (docs/09 §2.3 · docs/08 ข้อ 70)", () => {
  test("Mod+B/I/Shift+S/E/K ผูกก่อน defaultKeymap (override ของ CM)", () => {
    for (const key of ['"Mod-b"', '"Mod-i"', '"Mod-Shift-s"', '"Mod-e"', '"Mod-k"']) {
      expect(EDITOR_SOURCE).toContain(`key: ${key}`)
    }
    const inlineAt = EDITOR_SOURCE.indexOf('key: "Mod-i"')
    const defaultAt = EDITOR_SOURCE.indexOf("...defaultKeymap,")
    expect(inlineAt).toBeGreaterThan(-1)
    expect(defaultAt).toBeGreaterThan(inlineAt)
    // ทุกคีย์เขียนผ่าน inline.ts (ไม่มี markdown string กระจายใน editor.ts)
    expect(EDITOR_SOURCE).toContain("toggleMarkAt(view,")
    expect(EDITOR_SOURCE).toContain("toggleInlineMark(")
  })

  test("ไม่ทำ underline (ตัดออกจาก M3.2 — docs/09 §6)", () => {
    expect(EDITOR_SOURCE).not.toContain('key: "Mod-u"')
  })

  test("chrome ของ client คืน Mod+K ให้เอกสาร ไม่ใช่ command palette", () => {
    expect(CLIENT_JS).toContain("const inEditor =")
    expect(CLIENT_JS).toContain("if (inEditor) return;")
  })
})

describe("Track D — bubble toolbar + link popover (docs/09 §3.3)", () => {
  test("bubble เป็น overlay ของ client · สร้างครั้งเดียว · ไม่ rebuild ต่อ keystroke", () => {
    for (const marker of [
      "z-doku-inline-bar",
      "doku-inline-row",
      "doku-inline-btn",
      "aria-pressed",
      'role", "toolbar"',
      "positionOverlay(el, info.rect,",
      "renderInlineBar",
    ]) {
      expect(CLIENT_JS).toContain(marker)
    }
    // mark ที่ active → ปุ่มต้องรู้สถานะ (aria-pressed ไม่ใช่ class)
    expect(CLIENT_JS).toContain("info.marks.indexOf(mark) !== -1")
  })

  test("link popover แก้/ลบ URL ได้ + Enter/Escape (docs/09 §4)", () => {
    for (const marker of [
      "doku-inline-link",
      "doku-inline-link-input",
      "openLinkPopover",
      "setLink(",
      "leadingkeydown",
    ]) {
      expect(CLIENT_JS).toContain(marker.replace("leading", ""))
    }
    expect(CLIENT_JS).toContain('input.type = "url"')
  })

  test("ไฮไลต์สีใช้ชุดสีเดียวกับ mark strip (BLOCK_COLORS — docs/08 ข้อ 30)", () => {
    expect(CLIENT_JS).toContain("writing.handle.setHighlight(color)")
    expect(CLIENT_JS).toContain("writing.handle.setHighlight(null)")
    expect(EDITOR_SOURCE).toContain("setHighlightColor(")
  })

  test("CSS ของ bubble/ที่วาง overlay ใช้ token (docs/03 §1) + ซ่อนตอน print", () => {
    for (const marker of [".z-doku-inline-bar", ".doku-inline-btn", ".doku-inline-link"]) {
      expect(APP_CSS).toContain(marker)
    }
    expect(APP_CSS).toContain(".z-doku-inline-bar,\n  .doku-inline-link,")
    expect(APP_CSS).toContain("border: 1px solid var(--d-border-control)")
  })
})

describe("Track D — smart paste + `:emoji:` (docs/09 §5)", () => {
  test("paste HTML → markdown ผ่าน inline.ts (allowlist เดียวกับ sanitize)", () => {
    expect(EDITOR_SOURCE).toContain("htmlToMarkdownBrowser(html)")
    expect(EDITOR_SOURCE).toContain('from "./editor/inline.ts"')
    expect(EDITOR_SOURCE).toContain('data.getData("text/html")')
    // ไม่ทับ paste ข้อความธรรมดา (ค่อย ๆ แปลงเฉพาะ HTML ที่มีโครงสร้าง)
    expect(EDITOR_SOURCE).toContain("STRUCTURED_HTML.test(html)")
    // paste ในโค้ด block = ข้อความดิบ (ห้ามแปลง)
    expect(EDITOR_SOURCE).toContain("if (insideCode(view, from, to)) return false")
    // โครงสร้างที่ paste ต้องไม่ถูกกลืนเป็นข้อความในบรรทัดเดิม
    expect(EDITOR_SOURCE).toContain("alignPaste(line.text.slice(0, from - line.from), md)")
    // ทาง paste เขียนเป็น markdown string ผ่าน ChangeSet เท่านั้น
    // (ไม่มี HTML ดิบถูกใส่กลับเข้า DOM — จุดแตะ parser มีจุดเดียว)
    expect(EDITOR_SOURCE.match(/new DOMParser\(\)/g)?.length).toBe(1)
    expect(EDITOR_SOURCE).toContain("changes: { from, to, insert },")
  })

  test("`:name:` → อีโมจิ + IME guard (docs/08 ข้อ 69)", () => {
    expect(EDITOR_SOURCE).toContain("EditorView.inputHandler.of(")
    expect(EDITOR_SOURCE).toContain("replaceEmoji(trigger, trigger.length)")
    expect(EDITOR_SOURCE).toContain("if (view.composing || from !== to) return false")
  })

  test("autosave ยังทำงาน: inline action ยิงผ่าน change/selection ของ CM (onChange เดิม)", () => {
    expect(EDITOR_SOURCE).toContain('"doku.inline.mark"')
    expect(EDITOR_SOURCE).toContain('"doku.inline.link"')
    expect(EDITOR_SOURCE).toContain("userEvent: event,")
    expect(EDITOR_SOURCE).toContain("options.onChange?.(update.state.doc.toString())")
  })
})
