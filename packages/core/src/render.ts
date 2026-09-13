/**
 * Render pipeline (docs/01):
 *
 *   md ─▶ parse ─▶ custom blocks ─▶ sanitize ─▶ asset rewrite ─▶ Shiki/KaTeX ─▶ HTML
 *
 * ลำดับที่สำคัญ:
 * 1. remark-rehype แบบ **ไม่เปิด** allowDangerousHtml → raw HTML ตายตั้งแต่ต้น
 * 2. sanitize (allowlist) ทำงานกับทุกอย่างที่มาจาก markdown + block ของเรา
 * 3. asset rewrite / Shiki / KaTeX รัน "หลัง" sanitize — เป็น trusted deterministic
 *    transformation ที่ต้องใช้ `style` (Shiki/KaTeX) ซึ่ง allowlist ห้ามไว้โดยเจตนา
 *    input ของมันคือ tree ที่ sanitize แล้วเท่านั้น
 */

import rehypeShiki from "@shikijs/rehype"
import rehypeAutolinkHeadings from "rehype-autolink-headings"
import rehypeKatex from "rehype-katex"
import rehypeSanitize from "rehype-sanitize"
import rehypeSlug from "rehype-slug"
import rehypeStringify from "rehype-stringify"
import remarkDirective from "remark-directive"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { type AssetResolver, createAssetResolver } from "./assets.ts"
import { createDokuHandlers, remarkDokuDirectives } from "./blocks/directive.ts"
import { analyzeDirectiveFences, describeFenceProblem, type FenceProblem } from "./blocks/fences.ts"
import { splitFrontmatter } from "./frontmatter.ts"
import type { VaultFs } from "./fs.ts"
import { remarkBreaks } from "./plugins/breaks.ts"
import { remarkMark } from "./plugins/mark.ts"
import { rehypeCollectToc, type TocEntry } from "./plugins/toc.ts"
import { remarkWikilinks } from "./plugins/wikilink.ts"
import { rehypeRewrite } from "./rewrite.ts"
import { dokuSanitizeSchema, rehypeNormalizeLinks } from "./sanitize.ts"
import { defaultMeta, type Meta } from "./schema.ts"
import { type Warning, type WarningCode, warning } from "./types.ts"

/** จับ `$…$` / `$$…$$` — ใช้เตือนเมื่อ meta ปิด math ไว้ (docs/08 ข้อ 60) */
const MATH_DELIMITER = /(^|[^\\])\$\$?[^$\n]+\$\$?/m

export interface RenderVault {
  fs: VaultFs
  /** basename → path id (ใช้ resolve wikilink) */
  index?: Map<string, string[]>
  /** ตรวจว่าลิงก์ไปเอกสารที่มีอยู่จริงไหม */
  hasDoc?: (id: string) => boolean
}

export interface RenderOptions {
  /** path id ของเอกสาร (ว่าง = inline/stdin) */
  docId?: string
  meta?: Meta
  /** vault ที่ผูกอยู่ — ไม่มี = stateless (ไม่มี wikilink/asset resolve) */
  vault?: RenderVault
  /** ปิด syntax highlighting (ใช้ตอน `doku check` ให้เร็ว) */
  highlight?: boolean
  /** array ที่ผู้เรียกรับ warning ต่อ (ถ้าไม่ส่ง จะสร้างใหม่) */
  warnings?: Warning[]
}

export interface RenderResult {
  /** HTML fragment (เนื้อหา ไม่มี layout) */
  html: string
  toc: TocEntry[]
  warnings: Warning[]
  meta: Meta
}

const SHIKI_THEMES = { light: "github-light", dark: "github-dark" } as const

function fenceWarningCode(kind: FenceProblem["kind"]): WarningCode {
  if (kind === "unclosed") return "block_unclosed"
  if (kind === "stray") return "block_stray_fence"
  return "block_nesting_ambiguous"
}

export async function renderMarkdown(
  /** md ต้นฉบับ (frontmatter จะถูกตัดออกให้เอง — idempotent ถ้าส่ง body มาแล้ว) */
  markdown: string,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const docId = options.docId ?? ""
  const meta = options.meta ?? defaultMeta(docId || "untitled")
  const body = splitFrontmatter(markdown).body
  const warnings = options.warnings ?? []
  const collect = (item: Warning): void => {
    warnings.push(item)
  }

  // ตรวจ fence ของ `:::` จาก source ก่อน — ครอบคลุมเคสที่ AST บอกไม่ได้
  // (position เพี้ยนเมื่อ container ซ้อนกัน · `:::` เปล่า · เปิดไม่ปิด)
  for (const problem of analyzeDirectiveFences(body)) {
    collect(
      warning(fenceWarningCode(problem.kind), describeFenceProblem(problem), "warning", {
        path: docId,
        field: problem.name,
      }),
    )
  }
  const toc: TocEntry[] = []

  const assets: AssetResolver | undefined = options.vault
    ? createAssetResolver(options.vault.fs)
    : undefined

  const mathOn = meta.render.math
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkDirective)
  // math: ต้องแทรก remark-math "ตรงตำแหน่งนี้" (หลัง remarkParse ก่อน remarkRehype) — docs/08 ข้อ 60
  if (mathOn) {
    processor.use(remarkMath)
  } else if (MATH_DELIMITER.test(body)) {
    collect(
      warning(
        "math_disabled",
        "meta.render.math = false — คงข้อความ $…$ ไว้ตามต้นฉบับ (ไม่ render สมการ)",
        "info",
        { path: docId },
      ),
    )
  }
  processor
    .use(remarkMark, { docId, onWarning: collect })
    .use(remarkDokuDirectives, { source: body, onWarning: collect, docId })
    .use(remarkWikilinks, { docId, index: options.vault?.index, onWarning: collect })
    // soft break → `<br>` ต้องมาหลัง mark/wikilink เพื่อให้ syntax ที่พาดบรรทัดยังจับคู่ได้
    // (docs/08 ข้อ 71 — คนพิมพ์บรรทัดเดียว ต้องอ่านเห็นบรรทัดนั้น)
    .use(remarkBreaks)
    .use(remarkRehype, { handlers: createDokuHandlers({ docId, onWarning: collect }) })
    .use(rehypeSlug)
    // TOC ก่อน autolink เพื่อไม่ให้ข้อความ "#" ของ anchor ติดเข้าไปในสารบัญ
    .use(rehypeCollectToc, { onEntry: (entry) => toc.push(entry) })
    .use(rehypeAutolinkHeadings, {
      behavior: "append",
      properties: { className: ["doku-anchor"], ariaHidden: "true", tabIndex: -1 },
      content: {
        type: "element",
        tagName: "span",
        properties: { className: ["doku-anchor-icon"] },
        children: [{ type: "text", value: "#" }],
      },
    })
    .use(rehypeNormalizeLinks) // ก่อน sanitize: lowercase scheme + rel ให้ target=_blank
    .use(rehypeSanitize, dokuSanitizeSchema)
    .use(rehypeRewrite, {
      docId,
      assets,
      hasDoc: options.vault?.hasDoc,
      onWarning: collect,
    })

  // KaTeX ก่อน Shiki: display math ของ remark-math มาเป็น `<pre><code class="language-math">`
  // ถ้า Shiki วิ่งก่อน มันจะยึด code block นั้นไป และ KaTeX จะไม่เห็นสมการ
  // KaTeX error color: ไม่ส่ง `errorColor` (จะกลายเป็น inline style ที่ hardcode สีและไม่ตามธีม)
  // → บังคับด้วย CSS `.katex-error { color: var(--k-danger) !important }` ใน prose.ts (docs/08 ข้อ 47)
  // rehype-katex ไมรับ `throwOnError` (มัน Omit ออก) — ผิดพลาดแล้วได้ node .katex-error
  if (mathOn) {
    processor.use(rehypeKatex)
  }

  if (options.highlight !== false) {
    processor.use(rehypeShiki, {
      themes: { ...SHIKI_THEMES },
      defaultColor: "light",
      fallbackLanguage: "text",
      onError: (error: unknown) => {
        collect(
          warning(
            "code_language_unsupported",
            `highlight ไม่สำเร็จ: ${(error as Error).message}`,
            "info",
            { path: docId },
          ),
        )
      },
    })
  }

  processor.use(rehypeStringify)

  const file = await processor.process(body)
  return { html: String(file), toc, warnings, meta }
}
