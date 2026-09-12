/**
 * หน้า preview แบบ standalone (`doku render` → stdout/ไฟล์)
 *
 * หมายเหตุ: นี่ "ไม่ใช่" layout ของเว็บแอป — layout จริง (sidebar tree + TOC sticky +
 * Tailwind chrome) เป็นงานของ `packages/server` ที่ M1 (docs/01) และจะใช้ Hono JSX
 * ไฟล์นี้เป็น template string ธรรมดาโดยเจตนา: CLI ไม่ควรตั้ง dep เพิ่มเพื่อหน้า preview ชั่วคราว
 */

import type { Meta, TocEntry, Warning } from "@doku/core"
import { CONTENT_CSS, INTERACTIONS_JS } from "@doku/core"
import { PREVIEW_CHROME_CSS } from "./style.ts"

export interface PreviewPageInput {
  title: string
  docId: string
  meta: Meta
  html: string
  toc: TocEntry[]
  warnings: Warning[]
  /** CSS เพิ่มเติม (เช่น KaTeX) */
  extraCss?: string
}

export function renderPreviewPage(input: PreviewPageInput): string {
  const { meta } = input
  const accent =
    meta.theme.accent && /^#[0-9a-fA-F]{6}$/.test(meta.theme.accent) ? meta.theme.accent : null
  const htmlAttributes = [
    `lang="th"`,
    `data-theme="${meta.theme.mode}"`,
    accent ? `data-accent style="--doc-accent: ${accent}"` : "",
  ]
    .filter(Boolean)
    .join(" ")

  return `<!doctype html>
<html ${htmlAttributes}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(input.title)}</title>
<style>${CONTENT_CSS}${PREVIEW_CHROME_CSS}</style>${input.extraCss ? `\n<style>${input.extraCss}</style>` : ""}
</head>
<body>
<div class="doku-page">
<article class="doku-card doku-prose">
${docHeader(input)}
${warningsBanner(input.warnings)}
${meta.render.toc ? tocBlock(input.toc) : ""}
${input.html}
</article>
<footer class="doku-footer">doku · ${escapeHtml(input.docId || "(inline)")} · ${escapeHtml(meta.status)}</footer>
</div>
<script>${INTERACTIONS_JS}</script>
</body>
</html>
`
}

function docHeader(input: PreviewPageInput): string {
  const { meta } = input
  const bits: string[] = [`<span class="doku-status">${escapeHtml(meta.status)}</span>`]
  for (const tag of meta.tags) bits.push(`<span class="doku-tag">#${escapeHtml(tag)}</span>`)
  if (meta.created) bits.push(`<span>${escapeHtml(meta.created)}</span>`)
  if (meta.authors.length > 0) {
    bits.push(`<span>${meta.authors.map((author) => escapeHtml(author.name)).join(", ")}</span>`)
  }
  if (input.docId) bits.push(`<span class="doku-doc-path">${escapeHtml(input.docId)}</span>`)

  const summary = meta.summary ? `<p class="doku-doc-meta">${escapeHtml(meta.summary)}</p>` : ""

  return `<header class="doku-doc-header">
<h1 class="doku-doc-title">${escapeHtml(input.title)}</h1>
${summary}
<div class="doku-doc-meta">${bits.join("")}</div>
</header>`
}

function warningsBanner(warnings: readonly Warning[]): string {
  if (warnings.length === 0) return ""
  const serious = warnings.filter((item) => item.level !== "info")
  const infos = warnings.filter((item) => item.level === "info")

  const seriousHtml =
    serious.length > 0
      ? `<ul>${serious
          .map(
            (item) => `<li><code>${escapeHtml(item.code)}</code> ${escapeHtml(item.message)}</li>`,
          )
          .join("")}</ul>`
      : ""

  const infoHtml =
    infos.length > 0
      ? `<details><summary>${infos.length} รายการที่ยังไม่รองรับ / ข้อมูลเพิ่มเติม</summary><ul>${infos
          .map(
            (item) => `<li><code>${escapeHtml(item.code)}</code> ${escapeHtml(item.message)}</li>`,
          )
          .join("")}</ul></details>`
      : ""

  return `<div class="doku-warnings"><strong>render warnings (${warnings.length})</strong>${seriousHtml}${infoHtml}</div>`
}

function tocBlock(toc: readonly TocEntry[]): string {
  if (toc.length < 2) return ""
  return `<nav class="doku-toc">
<span class="doku-toc-title">สารบัญ</span>
<ul>${toc
    .map(
      (entry) =>
        `<li class="doku-toc-h${entry.depth}"><a href="#${encodeURI(entry.id)}">${escapeHtml(entry.text)}</a></li>`,
    )
    .join("")}</ul>
</nav>`
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
