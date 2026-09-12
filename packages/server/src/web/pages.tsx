/**
 * Hono JSX pages (docs/01: layout เป็น server-rendered HTML, ไม่มี SPA framework)
 * Tailwind = app chrome เท่านั้น — เนื้อหาเอกสารใช้ CSS layer .doku-prose (docs/03 §10)
 */

import { HEX_COLOR_PATTERN, type Meta } from "@doku/core"
import type { Child, FC } from "hono/jsx"
import type { CachedDoc } from "../cache.ts"
import type { DocSummary, TreeNode } from "../tree.ts"

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
      <body class="min-h-screen bg-(--k-app-bg) text-(--k-text) font-(family-name:--d-font-sans) antialiased">
        <div class="doku-progress" aria-hidden="true">
          <div data-part="progress-fill" />
        </div>
        {children}
      </body>
    </html>
  )
}

/* ── sidebar tree ─────────────────────────────────────────────────────── */

const TreeDocRow: FC<{ node: { id: string; title: string }; activeId?: string }> = ({
  node,
  activeId,
}) => (
  <li>
    <a
      href={`/d/${encodeURI(node.id)}`}
      class={`block truncate rounded-(--d-radius-sm) px-2 py-1 text-sm no-underline transition-colors hover:bg-(--d-bg-muted) ${
        activeId === node.id
          ? "bg-(--d-accent-weak) font-medium text-(--d-accent)"
          : "text-(--d-text-muted)"
      }`}
      aria-current={activeId === node.id ? "page" : undefined}
    >
      {node.title}
    </a>
  </li>
)

const TreeFolderRow: FC<{
  node: {
    path: string
    name: string
    title?: string
    icon?: string
    collapsed?: boolean
    children: TreeNode[]
  }
  activeId?: string
}> = ({ node, activeId }) => (
  <details data-tree={node.path} open={!node.collapsed}>
    <summary class="cursor-pointer list-none rounded-(--d-radius-sm) px-2 py-1 text-sm font-medium text-(--k-text) transition-colors hover:bg-(--d-bg-muted) select-none">
      <span class="mr-1 opacity-70">{node.icon ?? "▾"}</span>
      {node.title ?? node.name}
    </summary>
    <ul class="ml-3 border-l border-(--d-border) pl-2">
      {node.children.map((child) =>
        child.type === "folder" ? (
          <TreeFolderRow key={child.path} node={child} activeId={activeId} />
        ) : (
          <TreeDocRow key={child.id} node={child} activeId={activeId} />
        ),
      )}
    </ul>
  </details>
)

export const Sidebar: FC<{ tree: TreeNode[]; activeId?: string }> = ({ tree, activeId }) => (
  <aside class="sticky top-0 h-screen w-64 shrink-0 overflow-y-auto border-r border-(--d-border) bg-(--k-bg) p-4">
    <a href="/" class="mb-4 block text-lg font-semibold no-underline text-(--k-text)">
      doku
    </a>
    <nav aria-label="แผนผังเอกสาร">
      <ul class="mb-3 border-b border-(--d-border) pb-3">
        <li>
          <a
            href="/styleguide"
            class={`block rounded-(--d-radius-sm) px-2 py-1 text-sm no-underline transition-colors hover:bg-(--d-bg-muted) ${
              activeId === "__styleguide__"
                ? "font-medium text-(--d-accent)"
                : "text-(--d-text-muted)"
            }`}
          >
            styleguide
          </a>
        </li>
      </ul>
      {tree.length === 0 ? (
        <p class="text-sm text-(--d-text-subtle)">vault ว่าง — วางไฟล์ .md ได้เลย</p>
      ) : (
        <ul class="space-y-0.5">
          {tree.map((node) =>
            node.type === "folder" ? (
              <TreeFolderRow key={node.path} node={node} activeId={activeId} />
            ) : (
              <TreeDocRow key={node.id} node={node} activeId={activeId} />
            ),
          )}
        </ul>
      )}
    </nav>
  </aside>
)

/* ── doc page ────────────────────────────────────────────────────────── */

export const DocPage: FC<{ doc: CachedDoc; path: string; tree: TreeNode[] }> = ({
  doc,
  path,
  tree,
}) => {
  const meta = doc.meta
  return (
    <Layout title={meta.title ?? "doku"} theme={meta.theme}>
      <div class="mx-auto flex max-w-6xl">
        <Sidebar tree={tree} activeId={path} />
        <main class="min-w-0 flex-1 px-4 py-8">
          <article
            class="mx-auto max-w-[var(--k-measure)] rounded-(--d-radius-lg) border border-(--d-border) bg-(--k-bg) p-(--d-space-8) shadow-(--k-shadow-md)"
            data-doc-id={path}
            data-motion={meta.render.motion ? undefined : "off"}
          >
            <div class="doku-prose" dangerouslySetInnerHTML={{ __html: doc.fragment }} />
          </article>
          <p class="mx-auto mt-6 max-w-[var(--k-measure)] text-center font-(family-name:--d-font-mono) text-xs text-(--d-text-subtle)">
            doku · {path}
          </p>
        </main>
      </div>
    </Layout>
  )
}

/* ── home page (pinned / recent / tag filter) ────────────────────────── */

const TagPill: FC<{ tag: string; active?: boolean }> = ({ tag, active }) => (
  <a
    href={active ? "/" : `/?tag=${encodeURIComponent(tag)}`}
    class={`rounded-(--d-radius-pill) px-3 py-1 text-xs no-underline transition-colors ${
      active
        ? "bg-(--d-accent) text-white"
        : "bg-(--d-accent-weak) text-(--d-accent) hover:bg-(--d-accent) hover:text-white"
    }`}
  >
    #{tag}
  </a>
)

const DocRow: FC<{ doc: DocSummary }> = ({ doc }) => (
  <a
    href={`/d/${encodeURI(doc.id)}`}
    class="block rounded-(--d-radius-md) border border-(--d-border) bg-(--k-bg) p-4 no-underline transition-shadow hover:shadow-(--k-shadow-md)"
  >
    <div class="flex items-baseline justify-between gap-2">
      <span class="font-medium text-(--k-text)">{doc.title}</span>
      <span class="shrink-0 text-xs text-(--d-text-subtle)">{formatDate(doc.mtimeMs)}</span>
    </div>
    <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-(--d-text-muted)">
      <span class="font-(family-name:--d-font-mono)">{doc.id}</span>
      {doc.status !== "active" ? (
        <span class="rounded-(--d-radius-pill) border border-(--d-border) px-1.5 py-0.5 uppercase tracking-wide">
          {doc.status}
        </span>
      ) : null}
      {doc.tags.map((tag) => (
        <span key={tag} class="doku-tag">
          #{tag}
        </span>
      ))}
    </div>
  </a>
)

const SectionTitle: FC<{ children: Child }> = ({ children }) => (
  <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-(--d-text-muted)">
    {children}
  </h2>
)

export const HomePage: FC<{
  tree: TreeNode[]
  docs: DocSummary[]
  tag?: string
}> = ({ tree, docs, tag }) => {
  const allTags = [...new Set(docs.flatMap((doc) => doc.tags))].sort()
  const filtered = tag ? docs.filter((doc) => doc.tags.includes(tag)) : docs
  const pinned = filtered.filter((doc) => doc.pinned)
  const recent = [...filtered]
    .filter((doc) => !doc.pinned)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 8)
  const rest = [...filtered]
    .filter((doc) => !doc.pinned)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(8)

  const heading = tag ? `# ${tag}` : "Doku"

  return (
    <Layout title={tag ? `doku · #${tag}` : "doku"}>
      <div class="mx-auto flex max-w-6xl">
        <Sidebar tree={tree} />
        <main class="min-w-0 flex-1 px-4 py-8">
          <header class="mb-8">
            <h1 class="text-3xl font-semibold text-(--k-text)">{heading}</h1>
            <p class="mt-1 text-sm text-(--d-text-muted)">
              {docs.length} เอกสาร · {allTags.length} แท็ก
            </p>
          </header>

          {allTags.length > 0 ? (
            <section class="mb-8">
              <SectionTitle>แท็ก</SectionTitle>
              <div class="flex flex-wrap gap-2">
                {allTags.map((item) => (
                  <TagPill key={item} tag={item} active={item === tag} />
                ))}
              </div>
            </section>
          ) : null}

          {pinned.length > 0 ? (
            <section class="mb-8">
              <SectionTitle>ปักหมุด</SectionTitle>
              <div class="grid gap-3">
                {pinned.map((doc) => (
                  <DocRow key={doc.id} doc={doc} />
                ))}
              </div>
            </section>
          ) : null}

          {recent.length > 0 ? (
            <section class="mb-8">
              <SectionTitle>ล่าสุด</SectionTitle>
              <div class="grid gap-3">
                {recent.map((doc) => (
                  <DocRow key={doc.id} doc={doc} />
                ))}
              </div>
            </section>
          ) : null}

          {rest.length > 0 ? (
            <section class="mb-8">
              <SectionTitle>ทั้งหมด</SectionTitle>
              <div class="grid gap-3">
                {rest.map((doc) => (
                  <DocRow key={doc.id} doc={doc} />
                ))}
              </div>
            </section>
          ) : null}

          {filtered.length === 0 ? (
            <p class="text-sm text-(--d-text-subtle)">
              {tag ? `ไม่มีเอกสารที่มีแท็ก #${tag}` : "ยังไม่มีเอกสาร"}
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
  kind: "doc" | "asset" | "route"
  path?: string
}> = ({ tree, kind, path }) => {
  const message =
    kind === "doc"
      ? `ไม่พบเอกสาร${path ? `: ${path}` : ""}`
      : kind === "asset"
        ? `ไม่พบ asset${path ? `: ${path}` : ""}`
        : "ไม่พบหน้าที่ขอ"
  return (
    <Layout title="404 — doku">
      <div class="mx-auto flex max-w-6xl">
        <Sidebar tree={tree} />
        <main class="min-w-0 flex-1 px-4 py-16">
          <div class="mx-auto max-w-[var(--k-measure)] rounded-(--d-radius-lg) border border-(--d-border) bg-(--k-bg) p-(--d-space-8) text-center shadow-(--k-shadow-md)">
            <p class="font-(family-name:--d-font-mono) text-4xl text-(--d-text-subtle)">404</p>
            <p class="mt-2 text-(--d-text-muted)">{message}</p>
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

export const StyleGuidePage: FC<{ tree: TreeNode[]; blocks: StyleGuideSection[] }> = ({
  tree,
  blocks,
}) => (
  <Layout title="styleguide — doku">
    <div class="mx-auto flex max-w-6xl">
      <Sidebar tree={tree} activeId="__styleguide__" />
      <main class="min-w-0 flex-1 px-4 py-8">
        <header class="mb-8">
          <h1 class="text-3xl font-semibold text-(--k-text)">Styleguide</h1>
          <p class="mt-1 text-sm text-(--d-text-muted)">
            {blocks.length} blocks — ทุก block พร้อม syntax และตัวอย่าง (docs/03 §9)
          </p>
        </header>
        <div class="grid gap-6">
          {blocks.map((block) => (
            <section
              id={`block-${block.name}`}
              class="rounded-(--d-radius-lg) border border-(--d-border) bg-(--k-bg) p-6"
            >
              <div class="mb-4 flex items-baseline justify-between gap-3">
                <h2 class="font-(family-name:--d-font-mono) text-lg font-semibold text-(--k-text)">
                  <a href={`#block-${block.name}`} class="no-underline text-(--k-text)">
                    {block.name}
                  </a>
                </h2>
                <span class="rounded-(--d-radius-pill) border border-(--d-border) px-2 py-0.5 text-xs text-(--d-text-subtle)">
                  {block.kind}
                </span>
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
