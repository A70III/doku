/**
 * DocRenderer — resolve → cache key → render (หรือ hit cache) → fragment ของการ์ดเนื้อหา
 *
 * cache key = sha256(md + meta + rendererVersion + theme + listingHash) — docs/01
 * listingHash ทำให้ fragment ที่อ้าง asset/wikilink ถูก render ใหม่เมื่อโครง vault เปลี่ยน
 */

import {
  type Meta,
  RENDERER_VERSION,
  renderMarkdown,
  resolveDoc,
  sha256Hex,
  type TocEntry,
  type VaultFs,
  type Warning,
} from "@doku/core"
import type { CachedDoc, FragmentCache } from "./cache.ts"
import type { VaultState } from "./tree.ts"

export class DocRenderer {
  #fs: VaultFs
  #state: VaultState
  #cache: FragmentCache

  constructor(fs: VaultFs, state: VaultState, cache: FragmentCache) {
    this.#fs = fs
    this.#state = state
    this.#cache = cache
  }

  async render(docId: string): Promise<CachedDoc> {
    const resolved = await resolveDoc(docId, this.#fs)
    const { listingHash, docs } = await this.#state.get()
    const key = await this.cacheKey(resolved.markdown, resolved.meta, listingHash)
    const hit = await this.#cache.load(key)
    if (hit) return hit

    const known = new Set(docs.map((doc) => doc.id))
    const warnings = [...resolved.warnings]
    const result = await renderMarkdown(resolved.body, {
      docId: resolved.id,
      meta: resolved.meta,
      vault: {
        fs: this.#fs,
        index: await this.#state.wikiIndex(),
        hasDoc: (id) => known.has(id),
      },
      warnings,
    })

    await this.#cache.store(
      {
        fragment: this.fragment(result.meta, result.html, result.toc, result.warnings),
        meta: result.meta,
        toc: result.toc,
        warnings: result.warnings,
      },
      key,
    )

    const doc = await this.#cache.load(key)
    return doc as CachedDoc
  }

  cacheKey(markdown: string, meta: Meta, listingHash = ""): Promise<string> {
    return sha256Hex(
      [
        markdown,
        JSON.stringify(meta),
        RENDERER_VERSION,
        meta.theme.mode,
        meta.theme.accent ?? "",
        listingHash,
      ].join("\u0000"),
    )
  }

  /** อ่าน listingHash จาก state แล้วค่อยคำนวณ key จริง (ให้ renderer ใช้ตอน render) */
  async cacheKeyWithListing(markdown: string, meta: Meta): Promise<string> {
    const { listingHash } = await this.#state.get()
    return this.cacheKey(markdown, meta, listingHash)
  }

  /** HTML ภายในการ์ดเนื้อหา — header + warnings + toc + prose (fragment ที่ cache จริง) */
  private fragment(meta: Meta, html: string, toc: TocEntry[], warnings: Warning[]): string {
    // ใช้ JSX ผ่าน app.tsx จะสะอาดกว่า — จุดนี้ assemble ด้วย string ที่เราคุมเอง
    // (input ทั้งหมดมาจาก meta/escape แล้ว หรือจาก HTML ที่ผ่าน sanitize)
    return `${docHeaderHtml(meta)}${warningsBannerHtml(warnings)}${tocHtml(toc)}${html}`
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function docHeaderHtml(meta: Meta): string {
  const bits: string[] = [`<span class="doku-status">${escapeHtml(meta.status)}</span>`]
  for (const tag of meta.tags) bits.push(`<span class="doku-tag">#${escapeHtml(tag)}</span>`)
  if (meta.created) bits.push(`<span>${escapeHtml(meta.created)}</span>`)
  if (meta.authors.length > 0) {
    bits.push(`<span>${meta.authors.map((author) => escapeHtml(author.name)).join(", ")}</span>`)
  }
  const summary = meta.summary ? `<p class="doku-doc-meta">${escapeHtml(meta.summary)}</p>` : ""

  return `<header class="doku-doc-header">
<h1 class="doku-doc-title">${escapeHtml(meta.title ?? "")}</h1>
${summary}
<div class="doku-doc-meta">${bits.join("")}</div>
</header>`
}

export function warningsBannerHtml(warnings: readonly Warning[]): string {
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

export function tocHtml(toc: readonly TocEntry[]): string {
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
