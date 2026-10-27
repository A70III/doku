/** หน้าอ่านเอกสาร + TOC + colophon + toolbar — แยกจาก pages.tsx (ไม่เปลี่ยนพฤติกรรม) */

import type { Meta, TocEntry } from "@doku/core"
import type { Child, FC } from "hono/jsx"
import type { CachedDoc } from "../../cache.ts"
import type { TreeNode } from "../../tree.ts"
import { getSiteName } from "../site.ts"
import { Layout } from "./layout.tsx"
import { formatDate, formatDateTime, Icon } from "./shared.tsx"
import { Sidebar } from "./sidebar.tsx"

export const TocList: FC<{ toc: TocEntry[]; variant?: "column" | "sheet" }> = ({
  toc,
  variant,
}) => (
  <ul {...(variant ? { "data-variant": variant } : {})}>
    {toc.map((entry) => (
      <li class={`doku-toc-h${entry.depth}`}>
        <a href={`#${encodeURI(entry.id)}`} data-toc-link={entry.id}>
          {entry.text}
        </a>
      </li>
    ))}
  </ul>
)

const TocColumn: FC<{ toc: TocEntry[] }> = ({ toc }) =>
  toc.length < 2 ? (
    <div class="doku-toc-col" aria-hidden="true" />
  ) : (
    <aside class="doku-toc-col">
      <nav class="doku-toc" aria-label="สารบัญ">
        <span class="doku-toc-title">สารบัญ</span>
        <TocList toc={toc} variant="column" />
      </nav>
    </aside>
  )

/** แผ่น TOC สำหรับจอแคบ (เปิดจากปุ่มใน toolbar — docs/03 §2) */
const TocSheet: FC<{ toc: TocEntry[] }> = ({ toc }) =>
  toc.length < 2 ? null : (
    <div id="doku-toc-sheet" class="doku-overlay" hidden>
      <div class="doku-panel" role="dialog" aria-modal="true" aria-label="สารบัญ">
        <header class="doku-panel-head">
          <h2 class="doku-panel-title">สารบัญ</h2>
          <button type="button" class="doku-icon-btn" data-action="toc-close" aria-label="ปิด">
            <Icon name="x" size={16} />
          </button>
        </header>
        <nav class="doku-toc" aria-label="สารบัญ">
          <TocList toc={toc} variant="sheet" />
        </nav>
      </div>
    </div>
  )

/** หัวเอกสาร — อยู่นอก #doku-doc-body โดยตั้งใจ: ตอนเขียนในที่ ชื่อเรื่องต้องไม่หาย
 *  (fragment ที่ cache คือ warnings + เนื้อหาเท่านั้น — docs/08 ข้อ 52) */
const DocHeader: FC<{ meta: Meta }> = ({ meta }) => {
  const bits: Child[] = []
  if (meta.status !== "active") {
    bits.push(<span class="doku-status">{meta.status}</span>)
  }
  for (const tag of meta.tags)
    bits.push(
      <span class="doku-tag" data-doc-tag>
        #{tag}
      </span>,
    )
  if (meta.created) bits.push(<span>{formatDateTime(meta.created)}</span>)
  if (meta.authors.length > 0) {
    bits.push(<span>{meta.authors.map((author) => author.name).join(", ")}</span>)
  }
  return (
    <header class="doku-doc-header">
      <h1 class="doku-doc-title">{meta.title ?? ""}</h1>
      {meta.summary ? <p class="doku-doc-lede">{meta.summary}</p> : null}
      {bits.length > 0 ? <div class="doku-doc-meta">{bits}</div> : null}
    </header>
  )
}

/** colophon ท้ายเอกสาร — path (คือ id) · ขนาด · แก้ไขล่าสุด (docs/08 ข้อ 49) */
const Colophon: FC<{ path: string; meta: Meta; mtimeMs?: number; words?: number }> = ({
  path,
  meta,
  mtimeMs,
  words,
}) => (
  <footer class="doku-colophon">
    <code>{path}</code>
    {words ? <span data-part="colophon-words">{words.toLocaleString("th-TH")} คำ</span> : null}
    {words ? <span>อ่าน ~{Math.max(1, Math.round(words / 220))} นาที</span> : null}
    {mtimeMs ? <span>แก้ไข {formatDate(mtimeMs)}</span> : null}
    {meta.authors.length > 0 ? <span>{meta.authors.map((a) => a.name).join(", ")}</span> : null}
  </footer>
)

/** toolbar = เมนู ⋯ + สารบัญ/zen · **ไม่มีปุ่ม "แก้ไข"** (เอกสารพิมพ์ได้ทันที — docs/08 ข้อ 51–52)
 *  ระหว่าง M3.1 จะยังมีปุ่มแก้ไขชั่วคราวจนกว่าพื้นผิวการเขียนใหม่จะลง (แอปต้องใช้ได้ทุกขั้น) */
const DocToolbar: FC<{ path: string; hasToc: boolean }> = ({ path, hasToc }) => (
  <div class="doku-doc-toolbar" data-path={path}>
    {/* ตัวบอกสถานะบันทึก — เงียบ ๆ ไม่มีปุ่ม Save (docs/08 ข้อ 54) */}
    <span id="doku-doc-status" class="doku-doc-status" role="status" aria-live="polite" />
    <span class="doku-toolbar-spacer" />
    <button
      type="button"
      class="doku-icon-btn"
      data-action="doc-menu"
      data-path={path}
      data-label={path}
      data-kind="doc"
      title="การกระทำของเอกสาร"
      aria-label="การกระทำของเอกสาร"
    >
      <Icon name="more-horizontal" size={16} />
    </button>
    {hasToc ? (
      <button
        type="button"
        class="doku-icon-btn doku-toolbar-narrow"
        data-action="toc-sheet"
        title="สารบัญ"
        aria-label="สารบัญ"
      >
        <Icon name="list" size={16} />
      </button>
    ) : null}
    <button
      type="button"
      class="doku-icon-btn"
      data-action="zen"
      title="โหมดอ่านเต็มจอ (zen)"
      aria-label="โหมดอ่านเต็มจอ"
    >
      <Icon name="maximize-2" size={16} />
    </button>
  </div>
)

export const DocPage: FC<{
  doc: CachedDoc
  path: string
  tree: TreeNode[]
  trashCount?: number
  mtimeMs?: number
  words?: number
  /** backlinks (M5 S4) — เอกสารที่อ้างอิงเอกสารนี้ · ไม่ส่ง = ไม่โชว์ section */
  backlinks?: { path: string; title: string }[]
}> = ({ doc, path, tree, trashCount, mtimeMs, words, backlinks }) => {
  const meta = doc.meta
  const toc = meta.render.toc ? doc.toc : []
  return (
    <Layout
      title={meta.title ?? getSiteName()}
      theme={meta.theme}
      math={doc.fragment.includes("katex")}
    >
      <div class="doku-shell">
        <Sidebar tree={tree} activeId={path} trashCount={trashCount} />
        <main class="doku-main">
          <article
            class="doku-article"
            data-doc-id={path}
            data-motion={meta.render.motion ? undefined : "off"}
          >
            <DocToolbar path={path} hasToc={toc.length >= 2} />
            <DocHeader meta={meta} />
            <section id="doku-meta-panel" class="doku-meta-panel-wrap" hidden>
              <header class="doku-meta-panel-head">
                <h2 class="doku-meta-panel-title">คุณสมบัติ</h2>
                <button
                  type="button"
                  class="doku-icon-btn"
                  data-action="meta-close"
                  aria-label="ปิดคุณสมบัติ"
                >
                  <Icon name="x" size={16} />
                </button>
              </header>
              <form id="doku-meta-form" class="doku-meta-panel" aria-label="คุณสมบัติเอกสาร">
                <p class="doku-panel-hint">
                  แก้ <code>*.meta.json</code> — ไฟล์คือความจริง (path = id, ไม่มี field หมวดหมู่)
                </p>
                <label class="doku-field">
                  <span>ชื่อเรื่อง</span>
                  <input type="text" name="title" autocomplete="off" />
                </label>
                <label class="doku-field">
                  <span>สรุป</span>
                  <textarea name="summary" rows={2} maxlength={280} />
                </label>
                <label class="doku-field">
                  <span>แท็ก (คั่นด้วยจุลภาค)</span>
                  <input type="text" name="tags" autocomplete="off" placeholder="design, doku" />
                </label>
                <div class="doku-field-row">
                  <label class="doku-field">
                    <span>สถานะ</span>
                    <select name="status">
                      <option value="active">active</option>
                      <option value="draft">draft</option>
                      <option value="archived">archived</option>
                    </select>
                  </label>
                  <label class="doku-field">
                    <span>ลำดับ</span>
                    <input type="number" name="order" step={1} />
                  </label>
                  <label class="doku-field">
                    <span>โหมดสี</span>
                    <select name="mode">
                      <option value="">(ตามค่าเริ่มต้น)</option>
                      <option value="auto">auto</option>
                      <option value="light">light</option>
                      <option value="dark">dark</option>
                    </select>
                  </label>
                </div>
                <div class="doku-field-row">
                  <label class="doku-field doku-field-inline">
                    <input type="checkbox" name="pinned" />
                    <span>ปักหมุด</span>
                  </label>
                  <label class="doku-field doku-field-inline">
                    <input type="checkbox" name="toc" />
                    <span>สารบัญ</span>
                  </label>
                </div>
                <footer class="doku-panel-foot">
                  <span id="doku-meta-status" class="doku-panel-hint" role="status" />
                  <button type="submit" class="doku-btn doku-btn-accent">
                    <Icon name="save" /> บันทึก
                  </button>
                </footer>
              </form>
            </section>
            <div
              id="doku-doc-body"
              class="doku-prose"
              dangerouslySetInnerHTML={{ __html: doc.fragment }}
            />
            {backlinks && backlinks.length > 0 ? (
              <nav class="doku-backlinks" aria-label="เอกสารที่อ้างอิงเอกสารนี้">
                <h2>เชื่อมโยงมาจาก</h2>
                <ul>
                  {backlinks.map((item) => (
                    <li key={item.path}>
                      <a href={`/d/${item.path.split("/").map(encodeURIComponent).join("/")}`}>
                        {item.title}
                      </a>
                      <code>{item.path}</code>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            <Colophon path={path} meta={meta} mtimeMs={mtimeMs} words={words} />
          </article>
        </main>
        <TocColumn toc={toc} />
      </div>
      <TocSheet toc={toc} />
    </Layout>
  )
}

/* ── hub page (catalogue) ────────────────────────────────────────────── */

/** node โฟลเดอร์ใน tree — ตั้งชื่อแยกจาก component `TreeFolder` ของ sidebar กันชน (ชื่อเดิม import มาไม่ได้) */
