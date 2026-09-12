/**
 * Hono JSX pages (docs/01: layout เป็น server-rendered HTML, ไม่มี SPA framework)
 * Tailwind = app chrome เท่านั้น — เนื้อหาเอกสารใช้ CSS layer .doku-prose (docs/03 §10)
 *
 * หน้าตา: "catalogue & reading room" — rail หิน (app-bg) + กระดาษ (k-bg)
 * โครงสร้างมาจาก whitespace → hairline ไม่ใช่การ์ด (docs/03 Part B · 08 ข้อ 31–33)
 */

import { HEX_COLOR_PATTERN, type Meta } from "@doku/core"
import type { Child, FC } from "hono/jsx"
import type { CachedDoc } from "../cache.ts"
import type { DocSummary, TreeNode } from "../tree.ts"

/** วันที่แบบคลังเอกสาร — เก็บเป็น absolute เสมอสำหรับ archive (docs/03 §3) */
function formatDate(mtimeMs: number): string {
  if (!mtimeMs) return ""
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(mtimeMs))
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
      </body>
    </html>
  )
}

/* ── sidebar rail ────────────────────────────────────────────────────── */

const TreeDocRow: FC<{ node: { id: string; title: string }; activeId?: string }> = ({
  node,
  activeId,
}) => {
  const active = activeId === node.id
  return (
    <li>
      <a
        href={`/d/${encodeURI(node.id)}`}
        class={`block truncate py-1 pl-3 text-sm no-underline transition-colors ${
          active
            ? "-ml-px border-l-2 border-(--d-accent) font-medium text-(--d-accent)"
            : "text-(--d-text-muted) hover:text-(--k-text)"
        }`}
        aria-current={active ? "page" : undefined}
      >
        {node.title}
      </a>
    </li>
  )
}

const TreeFolder: FC<{
  node: {
    path: string
    name: string
    title?: string
    collapsed?: boolean
    children: TreeNode[]
  }
  activeId?: string
}> = ({ node, activeId }) => (
  <details class="tree" data-tree={node.path} open={!node.collapsed}>
    <summary class="flex cursor-pointer list-none items-center gap-1.5 py-1 text-sm font-medium text-(--k-text) transition-colors select-none hover:text-(--d-accent)">
      <span class="tree-caret text-(--d-text-subtle)" aria-hidden="true">
        ▸
      </span>
      <span class="truncate">{node.title ?? node.name}</span>
    </summary>
    <ul class="ml-[7px] border-l border-(--d-border)">
      {node.children.map((child) =>
        child.type === "folder" ? (
          <TreeFolder key={child.path} node={child} activeId={activeId} />
        ) : (
          <TreeDocRow key={child.id} node={child} activeId={activeId} />
        ),
      )}
    </ul>
  </details>
)

export const Sidebar: FC<{ tree: TreeNode[]; activeId?: string; vaultName: string }> = ({
  tree,
  activeId,
  vaultName,
}) => (
  <aside class="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-(--d-border) bg-(--k-app-bg) px-5 py-6 md:flex">
    <a href="/" class="block no-underline">
      <span class="block text-sm font-semibold tracking-tight text-(--k-text)">doku</span>
      <span class="mt-0.5 block truncate font-(family-name:--d-font-mono) text-xs text-(--d-text-subtle)">
        {vaultName}
      </span>
    </a>

    <nav aria-label="แผนผังเอกสาร" class="mt-6 flex-1">
      {tree.length === 0 ? (
        <p class="text-sm text-(--d-text-subtle)">vault ว่าง — วางไฟล์ .md ได้เลย</p>
      ) : (
        <ul class="space-y-0.5">
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

    <div class="mt-6 border-t border-(--d-border) pt-4">
      <a
        href="/styleguide"
        class={`block text-sm no-underline transition-colors ${
          activeId === "__styleguide__"
            ? "font-medium text-(--d-accent)"
            : "text-(--d-text-muted) hover:text-(--k-text)"
        }`}
        aria-current={activeId === "__styleguide__" ? "page" : undefined}
      >
        styleguide
      </a>
    </div>
  </aside>
)

/* ── doc page (reading room) ─────────────────────────────────────────── */

export const DocPage: FC<{
  doc: CachedDoc
  path: string
  tree: TreeNode[]
  vaultName: string
}> = ({ doc, path, tree, vaultName }) => {
  const meta = doc.meta
  return (
    <Layout title={meta.title ?? "doku"} theme={meta.theme}>
      <div class="mx-auto flex max-w-6xl">
        <Sidebar tree={tree} activeId={path} vaultName={vaultName} />
        <main class="min-w-0 flex-1 px-6 py-10 md:px-10">
          <article
            class="max-w-[var(--k-measure)]"
            data-doc-id={path}
            data-motion={meta.render.motion ? undefined : "off"}
          >
            {/* shelf mark — path = id (docs/02) */}
            <p class="mb-3 font-(family-name:--d-font-mono) text-xs text-(--d-text-subtle)">
              {path}
            </p>
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
      href={`/d/${encodeURI(doc.id)}`}
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
}> = ({ tree, docs, tag, vaultName }) => {
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
      <div class="mx-auto flex max-w-6xl">
        <Sidebar tree={tree} vaultName={vaultName} />
        <main class="min-w-0 flex-1 px-6 py-10 md:px-10">
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

/* ── not found ───────────────────────────────────────────────────────── */

export const NotFoundPage: FC<{
  tree: TreeNode[]
  vaultName: string
  kind: "doc" | "asset" | "route"
  path?: string
}> = ({ tree, vaultName, kind, path }) => {
  const message =
    kind === "doc"
      ? `ไม่พบเอกสาร${path ? `: ${path}` : ""}`
      : kind === "asset"
        ? `ไม่พบ asset${path ? `: ${path}` : ""}`
        : "ไม่พบหน้าที่ขอ"
  return (
    <Layout title="404 — doku">
      <div class="mx-auto flex max-w-6xl">
        <Sidebar tree={tree} vaultName={vaultName} />
        <main class="min-w-0 flex-1 px-6 py-16 md:px-10">
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
}> = ({ tree, vaultName, blocks }) => (
  <Layout title="styleguide — doku">
    <div class="mx-auto flex max-w-6xl">
      <Sidebar tree={tree} activeId="__styleguide__" vaultName={vaultName} />
      <main class="min-w-0 flex-1 px-6 py-10 md:px-10">
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
                <code>{block.syntax}</code>
              </pre>
              <div class="doku-prose" dangerouslySetInnerHTML={{ __html: block.html }} />
            </section>
          ))}
        </div>
      </main>
    </div>
  </Layout>
)
