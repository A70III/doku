/**
 * `doku check` — validate vault (docs/02 Validation)
 * - meta ผ่าน Zod
 * - asset ที่อ้างมีจริง + ไม่หลุด vault
 * - ลิงก์ภายใน resolve ได้ / wikilink ไม่ซ้ำ
 * - custom block รู้จัก + ปิดครบ
 * - orphan assets + เอกสารที่ไม่มี title
 * - `_folder.meta.json` ผ่าน Zod
 *
 * exit code ≠ 0 เมื่อมี error (ใช้เป็น pre-commit/CI gate)
 */

import { describeFenceProblem, type FenceProblem } from "./blocks/fences.ts"
import type { VaultFs } from "./fs.ts"
import { DocNotFoundError, MAX_MD_BYTES, resolveDoc } from "./resolve.ts"
import { scanMarkdown } from "./scan.ts"
import { FolderMetaSchema } from "./schema.ts"
import { type Warning, type WarningCode, type WarningLevel, warning } from "./types.ts"
import { buildDocIndex, walkVault } from "./vault-walk.ts"

/** ระดับความรุนแรงเมื่อใช้เป็น gate ของ `doku check` (producer ไม่ต้องรู้) */
const CHECK_LEVELS: Partial<Record<WarningCode, WarningLevel>> = {
  doc_not_found: "error",
  path_invalid: "error",
  meta_invalid: "error",
  block_unknown: "error",
  block_unclosed: "error",
  block_stray_fence: "error",
  block_nesting_ambiguous: "error",
  link_broken: "error",
  link_unsafe: "error",
  asset_missing: "error",
  asset_path_unsafe: "error",
  wikilink_missing: "error",
  md_too_large: "warning",
  meta_unknown_field: "warning",
  wikilink_ambiguous: "warning",
  asset_unresolved: "warning",
  orphan_asset: "warning",
  missing_title: "warning",
  block_unimplemented: "info",
  icon_unknown: "warning",
  code_language_unsupported: "info",
}

function levelFor(code: WarningCode): WarningLevel {
  return CHECK_LEVELS[code] ?? "warning"
}

function fenceWarningCode(kind: FenceProblem["kind"]): WarningCode {
  if (kind === "unclosed") return "block_unclosed"
  if (kind === "stray") return "block_stray_fence"
  return "block_nesting_ambiguous"
}

export interface DocCheck {
  id: string
  title: string
  words: number
  headings: number
  blocks: string[]
  errors: Warning[]
  warnings: Warning[]
}

export interface CheckReport {
  ok: boolean
  docs: DocCheck[]
  errors: Warning[]
  warnings: Warning[]
  stats: {
    docs: number
    assets: number
    words: number
    blocks: number
    folders: number
  }
}

export interface CheckOptions {
  /** ตรวจเฉพาะเอกสารนี้ (path id) — ไม่ส่ง = ทั้ง vault */
  path?: string
  maxBytes?: number
  /** ชื่อโฟลเดอร์ vault (ตัด prefix) */
  vaultName?: string
}

export async function checkVault(fs: VaultFs, options: CheckOptions = {}): Promise<CheckReport> {
  const listing = await walkVault(fs)
  const targets = options.path ? [options.path] : listing.docs
  const index = buildDocIndex(listing.docs)
  const knownDocs = new Set(listing.docs)
  const knownAssets = new Set(listing.assets)
  const usedAssets = new Set<string>()

  const results: DocCheck[] = []

  for (const id of targets) {
    const docErrors: Warning[] = []
    const docWarnings: Warning[] = []

    let resolved: Awaited<ReturnType<typeof resolveDoc>>
    try {
      resolved = await resolveDoc(id, fs, {
        maxBytes: options.maxBytes ?? MAX_MD_BYTES,
        vaultName: options.vaultName,
      })
    } catch (error) {
      const message =
        error instanceof DocNotFoundError
          ? error.message
          : `อ่านเอกสารไม่ได้: ${(error as Error).message}`
      docErrors.push(warning("doc_not_found", message, "error", { path: id }))
      results.push({
        id,
        title: id,
        words: 0,
        headings: 0,
        blocks: [],
        errors: docErrors,
        warnings: docWarnings,
      })
      continue
    }

    const emit = (item: Warning): void => {
      const leveled = { ...item, level: levelFor(item.code) }
      if (leveled.level === "error") docErrors.push(leveled)
      else docWarnings.push(leveled)
    }

    for (const item of resolved.warnings) {
      // meta warning ที่ resolveDoc ปล่อยมา (meta_invalid / meta_unknown_field / md_too_large)
      emit(item)
    }

    const scan = scanMarkdown(resolved.body, id)

    // title: meta.json/frontmatter หรือ h1 แรก — เหลือแต่ "เดาจากชื่อไฟล์" = เตือน
    const metaTitle = resolved.metaSource === "default" ? undefined : resolved.meta.title
    const firstHeading = scan.headings.find((heading) => heading.depth === 1)
    if (!metaTitle && !firstHeading) {
      emit(warning("missing_title", "เอกสารไม่มี title (ทั้ง meta และ h1)", "warning", { path: id }))
    }

    // blocks
    for (const block of scan.blocks) {
      if (!block.known) {
        emit(
          warning("block_unknown", `block ที่ไม่รู้จัก: :::${block.name}`, "error", {
            path: id,
            field: block.name,
          }),
        )
      } else if (!block.implemented) {
        emit(
          warning("block_unimplemented", `block :::${block.name} ยังไม่รองรับ (M2)`, "info", {
            path: id,
            field: block.name,
          }),
        )
      }
    }
    for (const problem of scan.fenceProblems) {
      emit(
        warning(fenceWarningCode(problem.kind), describeFenceProblem(problem), "error", {
          path: id,
          field: problem.name,
        }),
      )
    }

    // links / assets
    for (const link of scan.links) {
      if (link.kind === "unsafe") {
        emit(
          warning("asset_path_unsafe", `path หลุด vault หรือไม่ปลอดภัย: ${link.raw}`, "error", {
            path: id,
            field: link.raw,
          }),
        )
        continue
      }
      if (!link.resolved) continue
      if (link.kind === "doc") {
        const target = link.resolved.slice(0, -3)
        if (!knownDocs.has(target)) {
          emit(
            warning("link_broken", `ลิงก์ไปเอกสารที่ไม่มีอยู่: ${target}`, "error", {
              path: id,
              field: link.raw,
            }),
          )
        }
        continue
      }
      usedAssets.add(link.resolved)
      if (!knownAssets.has(link.resolved)) {
        emit(
          warning("asset_missing", `asset ไม่มีอยู่จริง: ${link.resolved}`, "error", {
            path: id,
            field: link.raw,
          }),
        )
      }
    }

    for (const target of new Set(scan.wikilinks)) {
      const candidates = index.get(target) ?? (target.includes("/") ? [target] : [])
      if (candidates.length === 0) {
        emit(
          warning("wikilink_missing", `wikilink [[${target}]] หาไม่เจอ`, "error", {
            path: id,
            field: target,
          }),
        )
      } else if (candidates.length > 1) {
        emit(
          warning(
            "wikilink_ambiguous",
            `wikilink [[${target}]] ซ้ำ ${candidates.length} ไฟล์ — เลือก ${candidates[0]}`,
            "warning",
            { path: id, field: target },
          ),
        )
      }
    }

    results.push({
      id,
      title: metaTitle ?? firstHeading?.text ?? id,
      words: scan.words,
      headings: scan.headings.length,
      blocks: [...new Set(scan.blocks.map((block) => block.name))],
      errors: docErrors,
      warnings: docWarnings,
    })
  }

  // folder meta + orphan assets (ทั้ง vault เท่านั้น)
  const vaultWarnings: Warning[] = []
  if (!options.path) {
    for (const dir of collectDirs([...listing.docs, ...listing.assets])) {
      const raw = await fs.readText(`${dir}/_folder.meta.json`)
      if (raw === null) continue
      try {
        const parsed = FolderMetaSchema.safeParse(JSON.parse(raw))
        if (!parsed.success) {
          vaultWarnings.push(
            warning(
              "meta_invalid",
              `${dir}/_folder.meta.json ไม่ผ่าน schema: ${parsed.error.issues
                .map((issue) => issue.path.join("."))
                .join(", ")}`,
              "warning",
              { path: dir },
            ),
          )
        }
      } catch (error) {
        vaultWarnings.push(
          warning(
            "meta_invalid",
            `${dir}/_folder.meta.json parse ไม่ได้: ${(error as Error).message}`,
            "warning",
            { path: dir },
          ),
        )
      }
    }

    for (const asset of listing.assets) {
      if (!usedAssets.has(asset)) {
        vaultWarnings.push(
          warning("orphan_asset", `asset ที่ไม่มีเอกสารอ้างถึง: ${asset}`, "warning", { path: asset }),
        )
      }
    }
  }

  const errors = [
    ...results.flatMap((doc) => doc.errors),
    ...vaultWarnings.filter((w) => w.level === "error"),
  ]
  const warnings = [
    ...results.flatMap((doc) => doc.warnings),
    ...vaultWarnings.filter((w) => w.level !== "error"),
  ]

  return {
    ok: errors.length === 0,
    docs: results,
    errors,
    warnings,
    stats: {
      docs: results.length,
      assets: listing.assets.length,
      words: results.reduce((sum, doc) => sum + doc.words, 0),
      blocks: results.reduce((sum, doc) => sum + doc.blocks.length, 0),
      folders: collectDirs(listing.docs).length,
    },
  }
}

function collectDirs(paths: readonly string[]): string[] {
  const dirs = new Set<string>()
  for (const path of paths) {
    const segments = path.split("/")
    for (let index = 1; index < segments.length; index += 1) {
      dirs.add(segments.slice(0, index).join("/"))
    }
  }
  return [...dirs].sort()
}
