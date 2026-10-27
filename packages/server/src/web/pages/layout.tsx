/** shell ของหน้า (head/chrome/dialog/toast) — แยกจาก pages.tsx (ไม่เปลี่ยนพฤติกรรม) */

import { HEX_COLOR_PATTERN, ICON_NAMES, type Meta } from "@doku/core"
import type { Child, FC } from "hono/jsx"

import { Icon } from "./shared.tsx"

export const Layout: FC<{
  title: string
  theme?: Meta["theme"]
  /** เนื้อหาหน้านี้มีสมการ (KaTeX) — ค่อยโหลด katex.css (docs/08 ข้อ 70) */
  math?: boolean
  children: Child
}> = ({ title, theme, math, children }) => {
  const accent = theme?.accent && HEX_COLOR_PATTERN.test(theme.accent) ? theme.accent : null
  return (
    <html
      lang="th"
      data-theme={theme?.mode ?? "auto"}
      data-accent={accent ? "true" : undefined}
      style={accent ? ({ "--doc-accent": accent } as never) : undefined}
    >
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <title>{title}</title>
        <link rel="stylesheet" href="/static/app.css" />
        <link rel="stylesheet" href="/static/content.css" />
        {/* woff2 ถูกฝังเป็น data URI → ~380KB · โหลดเฉพาะหน้าที่มีสมการ (docs/08 ข้อ 23/70) */}
        {math ? <link rel="stylesheet" href="/static/katex.css" data-katex="true" /> : null}
        <script src="/static/client.js" defer />
        <script src="/static/editor.js" defer />
      </head>
      <body class="min-h-screen bg-(--k-app-bg) text-(--k-text) font-(family-name:--d-font-sans) antialiased">
        <div class="doku-progress" aria-hidden="true">
          <div data-part="progress-fill" />
        </div>
        {/* rail ถูกซ่อนใต้ md — เหลือแถบนำทางบาง ๆ ไม่ให้ content ถูกบีบ (docs/03 §2) */}
        <a
          href="/"
          class="block border-b border-(--d-border) px-6 py-3 text-sm font-semibold tracking-tight text-(--k-text) no-underline md:hidden"
        >
          doku
        </a>
        {children}

        {/* ── chrome ร่วมทุกหน้า (client.js ควบคุม) ── */}
        <div id="doku-menu" class="doku-menu" role="menu" hidden />
        <div id="doku-palette" class="doku-overlay" hidden>
          <div class="doku-palette" role="dialog" aria-modal="true" aria-label="ค้นหาและคำสั่ง">
            <input
              id="doku-palette-input"
              class="doku-palette-input"
              type="search"
              placeholder="ค้นหาเอกสาร หรือพิมพ์คำสั่ง เช่น new, folder, zen…"
              aria-label="ค้นหาและคำสั่ง (Ctrl+K)"
              autocomplete="off"
              spellcheck={false}
              aria-controls="doku-palette-list"
            />
            <div id="doku-palette-list" class="doku-palette-list" role="listbox" />
          </div>
        </div>
        <div id="doku-folder-overlay" class="doku-overlay" hidden>
          <form id="doku-folder-form" class="doku-panel" aria-label="ตั้งค่าโฟลเดอร์">
            <header class="doku-panel-head">
              <h2 class="doku-panel-title">โฟลเดอร์</h2>
              <button
                type="button"
                class="doku-icon-btn"
                data-action="folder-close"
                aria-label="ปิด"
              >
                <Icon name="x" />
              </button>
            </header>
            <p class="doku-panel-hint">
              เขียนลง <code>_folder.meta.json</code> — title / icon / color / order / collapsed
            </p>
            <label class="doku-field">
              <span>ชื่อที่แสดง</span>
              <input type="text" name="title" autocomplete="off" placeholder="ใช้ชื่อโฟลเดอร์" />
            </label>
            <div class="doku-field-row">
              <label class="doku-field">
                <span>ไอคอน</span>
                <select name="icon">
                  <option value="">(ไม่มี)</option>
                  {ICON_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label class="doku-field">
                <span>สี</span>
                <input type="text" name="color" autocomplete="off" placeholder="#2b5fc4" />
              </label>
              <label class="doku-field">
                <span>ลำดับ</span>
                <input type="number" name="order" step={1} />
              </label>
            </div>
            <footer class="doku-panel-foot">
              <span id="doku-folder-status" class="doku-panel-hint" role="status" />
              <button type="submit" class="doku-btn doku-btn-accent">
                <Icon name="save" /> บันทึก
              </button>
            </footer>
          </form>
        </div>
        {/* กลับขึ้นบน — โผล่หลังเลื่อนลง (client ตัดสิน) */}
        <button type="button" class="doku-to-top" data-action="to-top" aria-label="กลับขึ้นบน" hidden>
          <Icon name="chevron-down" size={16} />
        </button>

        {/* ถามข้อความสั้น ๆ — แทน window.prompt ของ new/move (client เรียก askText) */}
        <div id="doku-ask" class="doku-overlay" hidden>
          <form id="doku-ask-form" class="doku-panel doku-ask" aria-labelledby="doku-ask-title">
            <h2 id="doku-ask-title" class="doku-panel-title">
              เอกสารใหม่
            </h2>
            <p id="doku-ask-hint" class="doku-panel-hint" hidden />
            <label class="doku-field">
              <span id="doku-ask-label">path</span>
              <input id="doku-ask-input" type="text" autocomplete="off" spellcheck={false} />
            </label>
            <footer class="doku-panel-foot">
              <span class="doku-panel-hint" />
              <button type="button" class="doku-btn" data-ask="cancel">
                ยกเลิก
              </button>
              <button type="submit" class="doku-btn doku-btn-accent" id="doku-ask-submit">
                ตกลง
              </button>
            </footer>
          </form>
        </div>

        {/* คีย์ลัดทั้งหมด — เปิดด้วย ? หรือคำสั่งใน palette */}
        <div id="doku-keys" class="doku-overlay" hidden>
          <div
            class="doku-panel doku-keys"
            role="dialog"
            aria-modal="true"
            aria-labelledby="doku-keys-title"
          >
            <header class="doku-panel-head">
              <h2 id="doku-keys-title" class="doku-panel-title">
                คีย์ลัด
              </h2>
              <button type="button" class="doku-icon-btn" data-action="keys-close" aria-label="ปิด">
                <Icon name="x" size={16} />
              </button>
            </header>
            <dl class="doku-keys-list">
              <div>
                <dt>
                  <kbd>Ctrl</kbd> <kbd>K</kbd>
                </dt>
                <dd>ค้นหาเอกสาร / สั่งงาน</dd>
              </div>
              <div>
                <dt>
                  <kbd>Ctrl</kbd> <kbd>N</kbd>
                </dt>
                <dd>เอกสารใหม่ (ในโฟลเดอร์เดียวกับที่เปิดอยู่)</dd>
              </div>
              <div>
                <dt>
                  <kbd>Ctrl</kbd> <kbd>E</kbd>
                </dt>
                <dd>เข้าโหมดเขียนของเอกสารนี้</dd>
              </div>
              <div>
                <dt>
                  <kbd>Ctrl</kbd> <kbd>S</kbd>
                </dt>
                <dd>บันทึกทันที (ขณะเขียน)</dd>
              </div>
              <div>
                <dt>
                  <kbd>Esc</kbd>
                </dt>
                <dd>ออกจากโหมดเขียน / ปิดแผง</dd>
              </div>
              <div>
                <dt>
                  <kbd>?</kbd>
                </dt>
                <dd>เปิดคีย์ลัดนี้</dd>
              </div>
              <div>
                <dt>ลาก / แปะรูป</dt>
                <dd>อัปโหลดเข้าโฟลเดอร์ของเอกสารแล้วแทรกลงเนื้อหาให้เลย</dd>
              </div>
            </dl>
          </div>
        </div>

        <div id="doku-toast" class="doku-toast" role="status" aria-live="polite" hidden />
      </body>
    </html>
  )
}

/* ── sidebar rail ────────────────────────────────────────────────────── */
