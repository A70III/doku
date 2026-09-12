/**
 * โหลด/รวม meta: frontmatter (Obsidian) → `*.meta.json` ชนะ → default จากชื่อไฟล์
 * meta พัง = render ต่อ + warning ไม่ล้ม (docs/01 error handling)
 */

import type { VaultFs } from "./fs.ts"
import { metaPathFromDocId } from "./paths.ts"
import { defaultMeta, META_KNOWN_KEYS, type Meta, MetaSchema } from "./schema.ts"
import { type Warning, warning } from "./types.ts"

export type MetaSource = "sidecar" | "frontmatter" | "default"

export interface MetaLoadResult {
  meta: Meta
  source: MetaSource
  warnings: Warning[]
}

export async function loadMeta(
  fs: VaultFs,
  docId: string,
  frontmatter: Record<string, unknown> | null,
): Promise<MetaLoadResult> {
  const warnings: Warning[] = []
  const metaPath = metaPathFromDocId(docId)
  const rawText = await fs.readText(metaPath)

  let sidecar: Record<string, unknown> | null = null
  if (rawText !== null) {
    try {
      const parsed: unknown = JSON.parse(rawText)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        sidecar = parsed as Record<string, unknown>
      } else {
        warnings.push(
          warning("meta_invalid", "meta.json ต้องเป็น object", "warning", {
            path: docId,
            field: metaPath,
          }),
        )
      }
    } catch (error) {
      warnings.push(
        warning("meta_invalid", `meta.json parse ไม่ได้: ${(error as Error).message}`, "warning", {
          path: docId,
          field: metaPath,
        }),
      )
    }
  }

  if (sidecar) {
    for (const key of Object.keys(sidecar)) {
      if (!META_KNOWN_KEYS.has(key)) {
        warnings.push(
          warning("meta_unknown_field", `meta.json มี field ที่ระบบไม่รู้จัก: ${key}`, "warning", {
            path: docId,
            field: key,
          }),
        )
      }
    }
  }

  if (!sidecar && !frontmatter) {
    return { meta: defaultMeta(docId), source: "default", warnings }
  }

  // shallow merge: sidecar ชนะ frontmatter (docs/02)
  const merged: Record<string, unknown> = { ...(frontmatter ?? {}), ...(sidecar ?? {}) }
  const parsed = MetaSchema.safeParse(merged)

  if (parsed.success) {
    return { meta: parsed.data, source: sidecar ? "sidecar" : "frontmatter", warnings }
  }

  // salvage: ตัด field ที่พังทิ้งแล้วลองใหม่ (เช่น theme.accent ผิด → เสียแค่ theme)
  for (const issue of parsed.error.issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "(root)"
    warnings.push(
      warning("meta_invalid", `meta ไม่ผ่าน schema ที่ ${field}: ${issue.message}`, "warning", {
        path: docId,
        field,
      }),
    )
  }

  const salvaged = structuredClone(merged)
  for (const issue of parsed.error.issues) {
    const head = issue.path[0]
    if (typeof head === "string") delete salvaged[head]
  }
  const retried = MetaSchema.safeParse(salvaged)
  if (retried.success) {
    return { meta: retried.data, source: sidecar ? "sidecar" : "frontmatter", warnings }
  }

  warnings.push(
    warning("meta_invalid", "meta ใช้ไม่ได้เลย — ใช้ค่า default จากชื่อไฟล์แทน", "warning", {
      path: docId,
    }),
  )
  return { meta: defaultMeta(docId), source: "default", warnings }
}
