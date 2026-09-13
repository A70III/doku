/**
 * DocRenderer — resolve → cache key → render (หรือ hit cache) → fragment ของการ์ดเนื้อหา
 *
 * cache key = sha256(path id + md + meta + metaSource + warnings + rendererVersion + theme + listingHash)
 *
 * - **path id ต้องอยู่ใน key** เพราะ render ขึ้นกับตำแหน่งของเอกสาร (relative link/asset)
 *   → เอกสารต่างโฟลเดอร์ที่ md+meta เหมือนกันเคย hash ชนกันและได้ fragment ของกัน (บั๊ก M1–M2)
 * - metaSource + warnings จำเป็นเพราะทั้งคู่เปลี่ยน HTML (ตัด h1 / warnings banner) โดยไม่เปลี่ยน meta ที่ parse แล้ว
 * - listingHash ทำให้ fragment ที่อ้าง asset/wikilink ถูก render ใหม่เมื่อโครง vault เปลี่ยน
 * (docs/01 §Caching · docs/08 ข้อ 44)
 */

import {
  type Meta,
  RENDERER_VERSION,
  type ResolvedDoc,
  renderMarkdown,
  resolveDoc,
  sha256Hex,
  type TocEntry,
  type VaultFs,
  type Warning,
} from "@doku/core"
import type { CachedDoc, FragmentCache } from "./cache.ts"
import type { VaultState } from "./tree.ts"

/** h1 นำหน้าสุดของ body → ใช้เป็นชื่อเอกสาร (กัน h1 ซ้ำกับ header) */
const LEADING_H1 = /^[\uFEFF \t\r\n]*#[ \t]+(.+?)[ \t]*(?:\r?\n|$)/

function extractLeadingHeading(body: string): { title: string; body: string } | null {
  const match = body.match(LEADING_H1)
  if (!match) return null
  return { title: match[1] ?? "", body: body.slice(match[0].length) }
}

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
    const key = await this.cacheKey(resolved, listingHash)
    const hit = await this.#cache.load(key)
    if (hit) return hit

    const known = new Set(docs.map((doc) => doc.id))
    const warnings = [...resolved.warnings]

    // ชื่อเอกสารเดียว: meta ที่ระบุชัดเจนชนะ · ไม่มี → ใช้ h1 นำหน้าของ body · สุดท้ายใช้ชื่อไฟล์
    // ตัด h1 ออกเมื่อไม่มี meta title ชัดเจน หรือเมื่อ h1 ซ้ำกับ title (กันหัวเรื่องซ้ำ)
    const baseName = resolved.id.slice(resolved.id.lastIndexOf("/") + 1)
    const leading = extractLeadingHeading(resolved.body)
    const explicitTitle = resolved.metaSource === "default" ? undefined : resolved.meta.title
    const title = explicitTitle ?? leading?.title ?? baseName
    const dedupe =
      leading !== null &&
      (explicitTitle === undefined ||
        leading.title.trim().toLowerCase() === title.trim().toLowerCase())
    const body = dedupe && leading ? leading.body : resolved.body

    const result = await renderMarkdown(body, {
      docId: resolved.id,
      meta: { ...resolved.meta, title },
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

  cacheKey(resolved: ResolvedDoc, listingHash = ""): Promise<string> {
    return sha256Hex(
      [
        resolved.id,
        resolved.markdown,
        JSON.stringify(resolved.meta),
        resolved.metaSource,
        resolved.warnings.map((item) => `${item.level}:${item.code}:${item.field ?? ""}`).join("|"),
        RENDERER_VERSION,
        resolved.meta.theme.mode,
        resolved.meta.theme.accent ?? "",
        listingHash,
      ].join("\u0000"),
    )
  }

  /** HTML ภายในการ์ดเนื้อหา — header + warnings + toc + prose (fragment ที่ cache จริง) */
  private fragment(meta: Meta, html: string, toc: TocEntry[], warnings: Warning[]): string {
    // ใช้ JSX ผ่าน app.tsx จะสะอาดกว่า — จุดนี้ assemble ด้วย string ที่เราคุมเอง
    // (input ทั้งหมดมาจาก meta/escape แล้ว หรือจาก HTML ที่ผ่าน sanitize)
    return `${docHeaderHtml(meta)}${warningsBannerHtml(warnings)}${meta.render.toc ? tocHtml(toc) : ""}${html}`
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

function formatArchiveDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(date)
}

export function docHeaderHtml(meta: Meta): string {
  const bits: string[] = []
  // "active" = สถานะปกติ — ไม่ต้องประกาศ (เหลือแต่ state ที่ต่างจากปกติ)
  if (meta.status !== "active")
    bits.push(`<span class="doku-status">${escapeHtml(meta.status)}</span>`)
  for (const tag of meta.tags) bits.push(`<span class="doku-tag">#${escapeHtml(tag)}</span>`)
  if (meta.created) bits.push(`<span>${escapeHtml(formatArchiveDate(meta.created))}</span>`)
  if (meta.authors.length > 0) {
    bits.push(`<span>${meta.authors.map((author) => escapeHtml(author.name)).join(", ")}</span>`)
  }
  const lede = meta.summary ? `<p class="doku-doc-lede">${escapeHtml(meta.summary)}</p>` : ""
  const metaLine = bits.length > 0 ? `<div class="doku-doc-meta">${bits.join("")}</div>` : ""

  return `<header class="doku-doc-header">
<h1 class="doku-doc-title">${escapeHtml(meta.title ?? "")}</h1>
${lede}
${metaLine}
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
