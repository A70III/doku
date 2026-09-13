/**
 * rehype plugin: rewrite asset path + ลิงก์ภายในเป็น URL จริง
 *
 * รัน "หลัง" sanitize เพราะเป็นการ map ค่าที่ผ่าน allowlist แล้ว → `/assets/<vault-path>?h=<hash>`
 * (และ path ที่ได้ต้องผ่าน resolveRelativePath อีกชั้น — ไม่มีทางหลุด vault)
 */

import type { Element, Root } from "hast"
import { visit } from "unist-util-visit"
import { ASSET_NAME_RULE, type AssetResolver, isSafeAssetName } from "./assets.ts"
import { basenameOf, dirnameOf, docIdFromMdPath, docUrl, resolveRelativePath } from "./paths.ts"
import { type Warning, warning } from "./types.ts"

export interface RewriteOptions {
  docId: string
  /** ไม่มี = ไม่มี vault (stateless render) → ข้าม asset */
  assets?: AssetResolver
  hasDoc?: (id: string) => boolean
  onWarning: (w: Warning) => void
}

/** URL ที่ไม่ต้องแตะ: scheme (`http:`), protocol-relative (`//`), absolute (`/d/...`, `/assets/...`), anchor */
const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i

/** asset tag → URL attribute ที่ต้อง rewrite (video มี poster, source อาจมี src) — docs/03 */
const ASSET_ATTRS: Record<string, readonly string[]> = {
  img: ["src"],
  video: ["src", "poster"],
  audio: ["src"],
  source: ["src"],
}

export function rehypeRewrite(options: RewriteOptions) {
  return async (tree: Root): Promise<void> => {
    const jobs: Array<Promise<void>> = []

    visit(tree, "element", (node: Element) => {
      const isAsset = node.tagName !== "a"
      const keys = isAsset ? ASSET_ATTRS[node.tagName] : ["href"]
      if (!keys) return

      for (const key of keys) {
        const raw = node.properties?.[key]
        if (typeof raw !== "string" || raw.length === 0) continue
        if (URL_LIKE.test(raw)) continue

        jobs.push(
          rewriteOne(node, key, raw, isAsset, options).catch((error: unknown) => {
            options.onWarning(
              warning(
                isAsset ? "asset_unresolved" : "link_broken",
                `rewrite ไม่สำเร็จ (${raw}): ${(error as Error).message}`,
                "warning",
                { path: options.docId },
              ),
            )
          }),
        )
      }
    })

    await Promise.all(jobs)
  }
}

async function rewriteOne(
  node: Element,
  key: string,
  raw: string,
  isAsset: boolean,
  options: RewriteOptions,
): Promise<void> {
  const [target = "", fragment = ""] = splitFragment(raw)
  const resolved = resolveRelativePath(dirnameOf(options.docId), target)

  if (!resolved) {
    options.onWarning(
      warning(
        isAsset ? "asset_path_unsafe" : "link_unsafe",
        `path ไม่ปลอดภัย/หลุด vault (${raw}) — ไม่ rewrite`,
        "warning",
        { path: options.docId },
      ),
    )
    return
  }

  // ลิงก์ไปเอกสารอื่น → /d/<path id>
  if (resolved.endsWith(".md")) {
    const id = docIdFromMdPath(resolved)
    if (options.hasDoc && !options.hasDoc(id)) {
      options.onWarning(
        warning("link_broken", `ลิงก์ไปเอกสารที่ไม่มีอยู่: ${id}`, "warning", {
          path: options.docId,
          field: raw,
        }),
      )
    }
    node.properties[key] = docUrl(id) + (fragment ? `#${fragment}` : "")
    return
  }

  if (!options.assets) {
    options.onWarning(
      warning(
        "asset_unresolved",
        `ไม่มี vault ให้ resolve asset (${raw}) — ต้อง render ผ่าน path ที่ผูกกับ vault`,
        "info",
        { path: options.docId },
      ),
    )
    return
  }

  // ชื่อไฟล์ไม่ผ่าน charset → route จะ 404 (docs/08 ข้อ 72) → ไม่ rewrite เป็น URL ที่พัง
  // แต่ทำ placeholder ให้ CSS วาดกรอบ (ไม่ throw/ไม่ 500 · เทสต์:codes asset_name_invalid)
  if (!isSafeAssetName(basenameOf(resolved))) {
    options.onWarning(
      warning(
        "asset_name_invalid",
        `ชื่อไฟล์ asset ต้องเป็น ${ASSET_NAME_RULE}: ${resolved}`,
        "warning",
        { path: options.docId, field: raw },
      ),
    )
    if (isAsset) {
      // ตัว media: ตัด URL ออก + บอก CSS ว่าตัวนี้คือ placeholder (แสดง alt แทนรูป)
      delete node.properties[key]
      node.properties.dataAssetInvalid = basenameOf(resolved)
    }
    return
  }

  const asset = await options.assets.resolve(resolved)
  node.properties[key] = asset.url + (fragment ? `#${fragment}` : "")
  if (!asset.exists) {
    options.onWarning(
      warning("asset_missing", `asset ไม่มีอยู่จริง: ${resolved}`, "warning", {
        path: options.docId,
        field: raw,
      }),
    )
  }
}

function splitFragment(raw: string): [string, string] {
  const index = raw.indexOf("#")
  if (index === -1) return [raw, ""]
  return [raw.slice(0, index), raw.slice(index + 1)]
}
