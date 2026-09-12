/**
 * CodeMirror 6 browser entry (docs/08 ข้อ 17) — bundle เป็น `/static/editor.js`
 * ด้วย `bun run build:editor` (CSP `script-src 'self'` → ต้อง self-host ไม่มี CDN)
 *
 * ไม่ใช่ ESM module ที่ import จากที่อื่น — เกาะ `window.DokuEditor` แล้วให้ `client.js` เรียก
 * ธีมใช้ CSS variable ของ design token (`--d-*`) → ตรงกับ chrome โดยไม่ต้องตั้งสีซ้ำ
 */

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import { EditorState } from "@codemirror/state"
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
  rectangularSelection,
} from "@codemirror/view"

export interface DokuEditorHandle {
  getDoc(): string
  setDoc(text: string): void
  focus(): void
  destroy(): void
}

export interface DokuEditorOptions {
  doc: string
  placeholder?: string
  onChange?: (value: string) => void
  onSave?: (value: string) => void
}

const theme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "0.9375rem",
    backgroundColor: "transparent",
    color: "var(--d-text)",
  },
  ".cm-scroller": {
    fontFamily: "var(--d-font-mono)",
    lineHeight: "1.65",
  },
  ".cm-content": { padding: "1rem 0", caretColor: "var(--d-accent)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--d-text-subtle)",
    border: "none",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--d-accent) 5%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--d-accent)" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--d-accent) 22%, transparent)",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--d-accent) 22%, transparent)",
  },
})

function create(parent: HTMLElement, options: DokuEditorOptions): DokuEditorHandle {
  const extensions = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    drawSelection(),
    rectangularSelection(),
    EditorState.allowMultipleSelections.of(true),
    markdown(),
    EditorView.lineWrapping,
    theme,
    keymap.of([
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      {
        key: "Mod-s",
        preventDefault: true,
        run: (view) => {
          options.onSave?.(view.state.doc.toString())
          return true
        },
      },
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) options.onChange?.(update.state.doc.toString())
    }),
  ]
  if (options.placeholder) extensions.push(placeholderExt(options.placeholder))

  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: options.doc, extensions }),
  })

  return {
    getDoc: () => view.state.doc.toString(),
    setDoc: (text) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  }
}

declare global {
  interface Window {
    DokuEditor?: { create: typeof create }
  }
}

window.DokuEditor = { create }
