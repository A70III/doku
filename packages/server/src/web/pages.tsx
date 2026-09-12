/**
 * Hono JSX pages (docs/01: layout เป็น server-rendered HTML, ไม่มี SPA framework)
 * Tailwind = app chrome เท่านั้น — เนื้อหาเอกสารใช้ CSS layer .doku-prose (docs/03 §10)
 *
 * หน้าตา: "catalogue & reading room" — rail หิน (app-bg) + กระดาษ (k-bg)
 * โครงสร้างมาจาก whitespace → hairline ไม่ใช่การ์ด (docs/03 Part B · 08 ข้อ 31–33)
 *
 * M3: ไอคอน Lucide (inline svg) · toolbar (edit/meta/history/move/delete) · drag-drop tree
 *     · command palette · zen mode · editor overlay · trash page (docs/08 ข้อ 8/17/34–35)
 */

import {
  docUrl,
  HEX_COLOR_PATTERN,
  hasIcon,
  ICON_NAMES,
  iconSvg,
  type LucideIconName,
  type Meta,
  type TrashItem,
} from "@doku/core"
import type { Child, FC } from "hono/jsx"
import type { CachedDoc } from "../cache.ts"
import type { DocSummary, TreeNode } from "../tree.ts"

/* ── primitives ──────────────────────────────────────────────────────── */

/** ไอคอน chrome — inline `<svg>` จาก map ใน core (docs/08 ข้อ 35) */
export const Icon: FC<{ name: LucideIconName; size?: number; className?: string }> = ({
  name,
  size = 16,
  className,
}) => (
  <span
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: iconSvg(name, { size }) }}
    {...(className ? { class: className } : {})}
  />
)

/** วันที่แบบคลังเอกสาร — เก็บเป็น absolute เสมอสำหรับ archive (docs/03 §3) */
function formatDate(mtimeMs: number): string {
  if (!mtimeMs) return ""
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(mtimeMs))
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(date)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const Layout: FC<{
  title: string
  theme?: Meta["theme"]
  children: Child
}> = ({ title, theme, children }) => {
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
        <script src="/static/client.js" defer />
        <script src="/static/editor.js" defer />
      </head>
      <body class="min-h-screen bg-(--k-bg) text-(--k-text) font-(family-name:--d-font-sans) antialiased">
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
              autocomplete="off"
              spellcheck={false}
              aria-controls="doku-palette-list"
            />
            <div id="doku-palette-list" class="doku-palette-list" role="listbox" />
          </div>
        </div>
        <div id="doku-meta-overlay" class="doku-overlay" hidden>
          <form id="doku-meta-form" class="doku-panel" aria-label="คุณสมบัติเอกสาร">
            <header class="doku-panel-head">
              <h2 class="doku-panel-title">คุณสมบัติ</h2>
              <button type="button" class="doku-icon-btn" data-action="meta-close" aria-label="ปิด">
                <Icon name="x" />
              </button>
            </header>
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
        <section id="doku-editor" class="doku-editor" hidden aria-label="แก้ไขเอกสาร">
          <header class="doku-editor-head">
            <span id="doku-editor-path" class="doku-editor-path" />
            <span id="doku-editor-status" class="doku-chip" data-state="clean">
              บันทึกแล้ว
            </span>
            <div class="doku-editor-actions">
              <button
                type="button"
                class="doku-icon-btn"
                data-action="editor-preview"
                title="สลับ preview"
              >
                <Icon name="panel-left" />
              </button>
              <button type="button" class="doku-btn doku-btn-accent" data-action="editor-save">
                <Icon name="save" /> บันทึก
              </button>
              <button
                type="button"
                class="doku-icon-btn"
                data-action="editor-close"
                aria-label="ปิด"
              >
                <Icon name="x" />
              </button>
            </div>
          </header>
          <div class="doku-editor-body">
            <div id="doku-editor-source" class="doku-editor-pane" data-pane="source" />
            <div id="doku-editor-preview" class="doku-editor-pane doku-prose" data-pane="preview" />
          </div>
        </section>
        <div id="doku-toast" class="doku-toast" role="status" aria-live="polite" hidden />
      </body>
    </html>
  )
}

/* ── sidebar rail ────────────────────────────────────────────────────── */

const TreeRowMenu: FC<{
  kind: "doc" | "folder"
  path: string
  label: string
}> = ({ kind, path, label }) => (
  <button
    type="button"
    class="doku-row-menu"
    data-action="row-menu"
    data-kind={kind}
    data-path={path}
    data-label={label}
    aria-label={`ตัวเลือก: ${label}`}
    title="ตัวเลือก"
  >
    <Icon name="more-horizontal" size={14} />
  </button>
)

const TreeDocRow: FC<{ node: { id: string; title: string }; activeId?: string }> = ({
  node,
  activeId,
}) => {
  const active = activeId === node.id
  return (
    <li class="doku-row" data-doc-id={node.id} draggable="true">
      <a
        href={docUrl(node.id)}
        class={`doku-row-link ${active ? "is-active" : ""}`}
        aria-current={active ? "page" : undefined}
        data-doc-link={node.id}
      >
        {node.title}
      </a>
      <TreeRowMenu kind="doc" path={node.id} label={node.title} />
    </li>
  )
}

const TreeFolder: FC<{
  node: {
    path: string
    name: string
    title?: string
    icon?: string
    color?: string
    order?: number
    collapsed?: boolean
    children: TreeNode[]
  }
  activeId?: string
}> = ({ node, activeId }) => {
  const label = node.title ?? node.name
  const icon: LucideIconName = hasIcon(node.icon) ? node.icon : "folder"
  const color = node.color && HEX_COLOR_PATTERN.test(node.color) ? node.color : undefined
  return (
    <li
      class="doku-row doku-row-folder"
      data-folder-path={node.path}
      data-folder-title={node.title}
      data-folder-icon={hasIcon(node.icon) ? node.icon : undefined}
      data-folder-color={color}
      data-folder-order={node.order}
      draggable="true"
    >
      <details class="tree" data-tree={node.path} open={!node.collapsed}>
        <summary
          class="doku-folder-summary"
          data-drop-folder={node.path}
          title={`${label} — ลากเอกสารมาวางเพื่อย้าย`}
        >
          <span class="tree-caret text-(--d-text-subtle)" aria-hidden="true">
            ▸
          </span>
          <span class="doku-folder-icon" {...(color ? { style: { color } as never } : {})}>
            <Icon name={icon} size={14} />
          </span>
          <span class="truncate">{label}</span>
          <TreeRowMenu kind="folder" path={node.path} label={label} />
        </summary>
        <ul class="doku-tree-children">
          {node.children.map((child) =>
            child.type === "folder" ? (
              <TreeFolder key={child.path} node={child} activeId={activeId} />
            ) : (
              <TreeDocRow key={child.id} node={child} activeId={activeId} />
            ),
          )}
        </ul>
      </details>
    </li>
  )
}

export const Sidebar: FC<{
  tree: TreeNode[]
  activeId?: string
  vaultName: string
  trashCount?: number
}> = ({ tree, activeId, vaultName, trashCount = 0 }) => (
  <aside class="doku-rail">
    <div class="doku-rail-head">
      <a href="/" class="block no-underline">
        <span class="block text-sm font-semibold tracking-tight text-(--k-text)">doku</span>
        <span class="mt-0.5 block truncate font-(family-name:--d-font-mono) text-xs text-(--d-text-subtle)">
          {vaultName}
        </span>
      </a>
      <div class="doku-rail-actions">
        <button
          type="button"
          class="doku-icon-btn"
          data-action="new-doc"
          data-dir=""
          title="เอกสารใหม่"
          aria-label="เอกสารใหม่"
        >
          <Icon name="file-plus-2" />
        </button>
        <button
          type="button"
          class="doku-icon-btn"
          data-action="new-folder"
          data-dir=""
          title="โฟลเดอร์ใหม่"
          aria-label="โฟลเดอร์ใหม่"
        >
          <Icon name="folder-plus" />
        </button>
      </div>
    </div>

    <button type="button" class="doku-search-trigger" data-action="palette">
      <Icon name="search" size={14} />
      <span>ค้นหา / คำสั่ง</span>
      <kbd>Ctrl K</kbd>
    </button>

    <nav aria-label="แผนผังเอกสาร" class="doku-rail-tree">
      {tree.length === 0 ? (
        <p class="doku-rail-empty">
          vault ว่าง — กด <Icon name="file-plus-2" size={12} /> เพื่อเริ่มเอกสารแรก
        </p>
      ) : (
        <ul class="doku-tree" data-drop-root="true">
          {tree.map((node) =>
            node.type === "folder" ? (
              <TreeFolder key={node.path} node={node} activeId={activeId} />
            ) : (
              <TreeDocRow key={node.id} node={node} activeId={activeId} />
            ),
          )}
        </ul>
      )}
    </nav>

    <div class="doku-rail-foot">
      <a
        href="/styleguide"
        class={`doku-rail-link ${activeId === "__styleguide__" ? "is-active" : ""}`}
        aria-current={activeId === "__styleguide__" ? "page" : undefined}
      >
        <Icon name="list-checks" size={14} /> styleguide
      </a>
      <a
        href="/trash"
        class={`doku-rail-link ${activeId === "__trash__" ? "is-active" : ""}`}
        aria-current={activeId === "__trash__" ? "page" : undefined}
      >
        <Icon name="trash-2" size={14} /> trash
        {trashCount > 0 ? <span class="doku-rail-count">{trashCount}</span> : null}
      </a>
      <button type="button" class="doku-rail-link" data-action="cycle-theme">
        <Icon name="sun" size={14} /> ธีม
      </button>
    </div>
  </aside>
)

/* ── doc page (reading room) ─────────────────────────────────────────── */

const DocToolbar: FC<{ path: string }> = ({ path }) => (
  <div class="doku-doc-toolbar" data-path={path}>
    <button type="button" class="doku-tool" data-action="edit" data-path={path} title="แก้ไข (Ctrl+E)">
      <Icon name="pencil" size={15} /> <span>แก้ไข</span>
    </button>
    <button type="button" class="doku-tool" data-action="meta" data-path={path} title="คุณสมบัติ">
      <Icon name="settings-2" size={15} /> <span>คุณสมบัติ</span>
    </button>
    <button type="button" class="doku-tool" data-action="history" data-path={path} title="ประวัติ">
      <Icon name="history" size={15} /> <span>ประวัติ</span>
    </button>
    <button type="button" class="doku-tool" data-action="move" data-path={path} title="ย้าย">
      <Icon name="move" size={15} /> <span>ย้าย</span>
    </button>
    <button
      type="button"
      class="doku-tool doku-tool-danger"
      data-action="delete"
      data-path={path}
      title="ย้ายไป trash"
    >
      <Icon name="trash-2" size={15} /> <span>ลบ</span>
    </button>
    <span class="doku-toolbar-spacer" />
    <button type="button" class="doku-tool" data-action="zen" title="โหมดอ่านเต็มจอ (zen)">
      <Icon name="maximize-2" size={15} />
    </button>
  </div>
)

export const DocPage: FC<{
  doc: CachedDoc
  path: string
  tree: TreeNode[]
  vaultName: string
  trashCount?: number
}> = ({ doc, path, tree, vaultName, trashCount }) => {
  const meta = doc.meta
  return (
    <Layout title={meta.title ?? "doku"} theme={meta.theme}>
      <div class="doku-shell">
        <Sidebar tree={tree} activeId={path} vaultName={vaultName} trashCount={trashCount} />
        <main class="doku-main">
          <article
            class="doku-article"
            data-doc-id={path}
            data-motion={meta.render.motion ? undefined : "off"}
          >
            <DocToolbar path={path} />
            {/* shelf mark — path = id (docs/02) */}
            <p class="doku-shelfmark">{path}</p>
            <div class="doku-prose" dangerouslySetInnerHTML={{ __html: doc.fragment }} />
          </article>
        </main>
      </div>
    </Layout>
  )
}

/* ── hub page (catalogue) ────────────────────────────────────────────── */

const DocRow: FC<{ doc: DocSummary }> = ({ doc }) => {
  const hasMeta = doc.status !== "active" || doc.tags.length > 0
  return (
    <a
      href={docUrl(doc.id)}
      class="group block border-b border-(--d-border) py-3 no-underline last:border-b-0"
    >
      <div class="flex items-baseline justify-between gap-4">
        <span class="min-w-0 truncate font-medium text-(--k-text) transition-colors group-hover:text-(--d-accent)">
          {doc.title}
        </span>
        <span class="shrink-0 text-xs text-(--d-text-subtle) tabular-nums">
          {formatDate(doc.mtimeMs)}
        </span>
      </div>
      {hasMeta ? (
        <div class="mt-0.5 flex flex-wrap items-baseline gap-x-4 text-xs text-(--d-text-muted)">
          {doc.status !== "active" ? (
            <span class="text-(--d-text-subtle)">{doc.status}</span>
          ) : null}
          {doc.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}
    </a>
  )
}

const SectionTitle: FC<{ children: Child; count: number }> = ({ children, count }) => (
  <h2 class="mb-1 flex items-baseline gap-2 text-sm font-medium text-(--k-text)">
    {children}
    <span class="text-xs font-normal text-(--d-text-subtle) tabular-nums">{count}</span>
  </h2>
)

export const HomePage: FC<{
  tree: TreeNode[]
  docs: DocSummary[]
  tag?: string
  vaultName: string
  trashCount?: number
}> = ({ tree, docs, tag, vaultName, trashCount }) => {
  const tagCounts = new Map<string, number>()
  for (const doc of docs) {
    for (const item of doc.tags) tagCounts.set(item, (tagCounts.get(item) ?? 0) + 1)
  }
  const allTags = [...tagCounts.keys()].sort()

  const filtered = tag ? docs.filter((doc) => doc.tags.includes(tag)) : docs
  const pinned = filtered.filter((doc) => doc.pinned)
  const rest = filtered.filter((doc) => !doc.pinned).sort((a, b) => b.mtimeMs - a.mtimeMs)
  const [recent, older] = [rest.slice(0, 8), rest.slice(8)]

  const heading = tag ? `#${tag}` : vaultName
  const stats = tag ? `${filtered.length} เอกสาร` : `${docs.length} เอกสาร · ${allTags.length} แท็ก`

  return (
    <Layout title={tag ? `doku · #${tag}` : "doku"}>
      <div class="doku-shell">
        <Sidebar tree={tree} vaultName={vaultName} trashCount={trashCount} />
        <main class="doku-main">
          <header class="mb-5 border-b border-(--d-border) pb-5">
            <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h1 class="text-2xl font-semibold tracking-tight text-(--k-text)">{heading}</h1>
              <p class="text-sm text-(--d-text-muted) tabular-nums">{stats}</p>
            </div>
          </header>

          {allTags.length > 0 ? (
            <div class="mb-8 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
              <span class="text-(--d-text-subtle)">แท็ก</span>
              {allTags.map((item) => {
                const active = item === tag
                return (
                  <a
                    key={item}
                    href={active ? "/" : `/?tag=${encodeURIComponent(item)}`}
                    class={`no-underline transition-colors ${
                      active
                        ? "font-medium text-(--d-accent)"
                        : "text-(--d-text-muted) hover:text-(--d-accent)"
                    }`}
                  >
                    {item}
                    <span class="ml-1 text-xs text-(--d-text-subtle) tabular-nums">
                      {tagCounts.get(item)}
                    </span>
                  </a>
                )
              })}
            </div>
          ) : null}

          {pinned.length > 0 ? (
            <section class="mb-8">
              <SectionTitle count={pinned.length}>ปักหมุด</SectionTitle>
              {pinned.map((doc) => (
                <DocRow key={doc.id} doc={doc} />
              ))}
            </section>
          ) : null}

          {recent.length > 0 ? (
            <section class="mb-8">
              <SectionTitle count={recent.length}>ล่าสุด</SectionTitle>
              {recent.map((doc) => (
                <DocRow key={doc.id} doc={doc} />
              ))}
            </section>
          ) : null}

          {older.length > 0 ? (
            <section class="mb-8">
              <SectionTitle count={older.length}>ทั้งหมด</SectionTitle>
              {older.map((doc) => (
                <DocRow key={doc.id} doc={doc} />
              ))}
            </section>
          ) : null}

          {filtered.length === 0 ? (
            <p class="text-sm text-(--d-text-subtle)">
              {tag ? `ไม่มีเอกสารที่มีแท็ก #${tag}` : "ยังไม่มีเอกสารใน vault นี้"}
            </p>
          ) : null}
        </main>
      </div>
    </Layout>
  )
}

/* ── trash ───────────────────────────────────────────────────────────── */

export const TrashPage: FC<{
  tree: TreeNode[]
  vaultName: string
  items: TrashItem[]
  trashCount?: number
}> = ({ tree, vaultName, items, trashCount }) => (
  <Layout title="trash — doku">
    <div class="doku-shell">
      <Sidebar tree={tree} activeId="__trash__" vaultName={vaultName} trashCount={trashCount} />
      <main class="doku-main">
        <header class="mb-6 border-b border-(--d-border) pb-5">
          <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <div>
              <h1 class="text-2xl font-semibold tracking-tight text-(--k-text)">Trash</h1>
              <p class="mt-1 text-sm text-(--d-text-muted)">
                ลบ = ย้ายมาไว้ที่นี่ (กู้ได้เสมอ) · ล้างอัตโนมัติหลัง 30 วัน
              </p>
            </div>
            {items.length > 0 ? (
              <button
                type="button"
                class="doku-btn doku-btn-danger"
                data-action="empty-trash"
                data-count={items.length}
              >
                <Icon name="octagon-alert" size={14} /> ล้างถาวรทั้งหมด
              </button>
            ) : null}
          </div>
        </header>

        {items.length === 0 ? (
          <p class="text-sm text-(--d-text-subtle)">ว่าง — ไม่มีอะไรถูกลบ</p>
        ) : (
          <ul class="doku-trash-list">
            {items.map((item) => (
              <li class="doku-trash-row" data-trash-id={item.id}>
                <span class="doku-trash-icon">
                  <Icon
                    name={
                      item.kind === "folder"
                        ? "folder"
                        : item.kind === "asset"
                          ? "image"
                          : "file-text"
                    }
                    size={15}
                  />
                </span>
                <span class="doku-trash-main">
                  <span class="doku-trash-label">{item.label}</span>
                  <span class="doku-trash-meta">
                    {item.kind} · {formatDateTime(item.deletedAt)} · {formatBytes(item.bytes)}
                  </span>
                </span>
                <button
                  type="button"
                  class="doku-btn"
                  data-action="restore"
                  data-trash-id={item.id}
                >
                  <Icon name="undo-2" size={14} /> กู้คืน
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  </Layout>
)

/* ── not found ───────────────────────────────────────────────────────── */

export const NotFoundPage: FC<{
  tree: TreeNode[]
  vaultName: string
  kind: "doc" | "asset" | "route"
  path?: string
  trashCount?: number
}> = ({ tree, vaultName, kind, path, trashCount }) => {
  const message =
    kind === "doc"
      ? `ไม่พบเอกสาร${path ? `: ${path}` : ""}`
      : kind === "asset"
        ? `ไม่พบ asset${path ? `: ${path}` : ""}`
        : "ไม่พบหน้าที่ขอ"
  return (
    <Layout title="404 — doku">
      <div class="doku-shell">
        <Sidebar tree={tree} vaultName={vaultName} trashCount={trashCount} />
        <main class="doku-main">
          <div class="max-w-[var(--k-measure)]">
            <p class="font-(family-name:--d-font-mono) text-sm text-(--d-text-subtle)">404</p>
            <p class="mt-1 text-(--d-text-muted)">{message}</p>
            <a href="/" class="mt-4 inline-block text-sm text-(--d-accent) underline">
              กลับหน้าแรก
            </a>
          </div>
        </main>
      </div>
    </Layout>
  )
}

/* ── styleguide (docs/03 §9) — render ทุก block ให้คน + AI ดู ────────────── */

export interface StyleGuideSection {
  name: string
  kind: string
  syntax: string
  html: string
}

export const StyleGuidePage: FC<{
  tree: TreeNode[]
  vaultName: string
  blocks: StyleGuideSection[]
  trashCount?: number
}> = ({ tree, vaultName, blocks, trashCount }) => (
  <Layout title="styleguide — doku">
    <div class="doku-shell">
      <Sidebar
        tree={tree}
        activeId="__styleguide__"
        vaultName={vaultName}
        trashCount={trashCount}
      />
      <main class="doku-main">
        <header class="mb-6 border-b border-(--d-border) pb-5">
          <h1 class="text-2xl font-semibold tracking-tight text-(--k-text)">Styleguide</h1>
          <p class="mt-1 text-sm text-(--d-text-muted)">
            {blocks.length} blocks — ทุก directive พร้อม syntax และตัวอย่างจริง (docs/03 §9)
          </p>
          <nav aria-label="รายการ block" class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {blocks.map((block) => (
              <a
                key={block.name}
                href={`#block-${block.name}`}
                class="font-(family-name:--d-font-mono) text-(--d-text-muted) no-underline transition-colors hover:text-(--d-accent)"
              >
                {block.name}
              </a>
            ))}
          </nav>
        </header>

        <div class="max-w-[var(--k-measure)]">
          {blocks.map((block) => (
            <section key={block.name} id={`block-${block.name}`} class="mb-10 scroll-mt-6">
              <div class="mb-3 flex items-baseline justify-between gap-3 border-b border-(--d-border) pb-2">
                <h2 class="font-(family-name:--d-font-mono) text-sm font-medium text-(--k-text)">
                  <a href={`#block-${block.name}`} class="no-underline text-(--k-text)">
                    {block.name}
                  </a>
                </h2>
                <span class="text-xs text-(--d-text-subtle)">{block.kind}</span>
              </div>
              <pre class="mb-4 overflow-auto rounded-(--d-radius-sm) border border-(--d-border) bg-(--d-bg-subtle) p-3 text-xs text-(--d-text-muted)">
                {block.syntax}
              </pre>
              <div class="doku-prose" dangerouslySetInnerHTML={{ __html: block.html }} />
            </section>
          ))}
        </div>
      </main>
    </div>
  </Layout>
)
