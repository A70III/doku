/**
 * rehype plugin: rewrite asset path + ลิงก์ภายในเป็น URL จริง
 *
 * รัน "หลัง" sanitize เพราะเป็นการ map ค่าที่ผ่าน allowlist แล้ว → `/assets/<vault-path>?h=<hash>`
 * (และ path ที่ได้ต้องผ่าน resolveRelativePath อีกชั้น — ไม่มีทางหลุด vault)
 */

import type { Element, Root } from "hast"
import { visit } from "unist-util-visit"
import { type AssetResolver, posterCandidates } from "./assets.ts"
import { dirnameOf, docIdFromMdPath, docUrl, resolveRelativePath } from "./paths.ts"
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

/** embed เดียวที่ยอมให้อยู่ในเนื้อหา — ต้องเป็น URL ที่ renderer สร้างเองเท่านั้น (docs/08 ข้อ 65) */
const ALLOWED_EMBED =
  /^https:\/\/www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{6,20}(?:\?[\w=&.-]*)?$/

/** asset tag → URL attribute ที่ต้อง rewrite (source อาจมี src) — docs/03 */
const ASSET_ATTRS: Record<string, readonly string[]> = {
  img: ["src"],
  video: ["src", "poster"],
  audio: ["src"],
  source: ["src"],
}

export function rehypeRewrite(options: RewriteOptions) {
  return async (tree: Root): Promise<void> => {
    const jobs: Array<Promise<void>> = []

    // iframe/embed ที่ไม่ใช่ของ renderer → ถอดทิ้ง (ทำงานหลัง sanitize: เป็นด่านสุดท้าย
    // ของ iframe ทุกตัวที่หลุด allowlist มาได้ — docs/08 ข้อ 65)
    dropUnsafeEmbeds(tree)

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

    // ต้องรอ rewrite ของ `src` จบก่อน — poster อ่าน path ของวิดีโอจาก src
    await Promise.all(jobs)
    await applyPosters(tree, options)
  }
}

/** ถอด `<iframe>` ทุกตัวที่ src ไม่ตรงรูปแบบ embed ที่อนุญาต */
function dropUnsafeEmbeds(tree: Root): void {
  visit(tree, "element", (node: Element, index, parent) => {
    if (node.tagName !== "iframe") return
    const src = typeof node.properties?.src === "string" ? node.properties.src : ""
    if (ALLOWED_EMBED.test(src)) return
    if (parent && typeof index === "number") parent.children.splice(index, 1)
    return index
  })
}

/** เดินทุก `<video>` แล้วเติม poster จากไฟล์ข้าง ๆ `src` */
async function applyPosters(tree: Root, options: RewriteOptions): Promise<void> {
  if (!options.assets) return
  const videos: Element[] = []
  visit(tree, "element", (node: Element) => {
    if (node.tagName === "video") videos.push(node)
  })
  for (const node of videos) await applyPosterFromSrc(node, options)
}

/**
 * poster ของวิดีโอ “มาจาก src”: หาไฟล์รูปชื่อเดียวกับวิดีโอในโฟลเดอร์เดียวกัน
 * (`assets/clip.mp4` → `assets/clip.png`/`.jpg`/`.jpeg`/`.webp`/`.avif`) — เจอตัวแรกที่มีจริง
 * แล้วใส่ `poster` · ที่นี่เท่านั้นที่รู้จัก vault (block renderer ไม่มี fs — docs/08 ข้อ 65)
 */
async function applyPosterFromSrc(node: Element, options: RewriteOptions): Promise<void> {
  const assets = options.assets
  if (!assets) return
  const current = node.properties?.poster
  if (typeof current === "string" && current.length > 0) return
  const src = typeof node.properties?.src === "string" ? node.properties.src : ""
  const [target = ""] = splitFragment((src.split("?")[0] ?? "").trim())
  if (!target) return
  const assetPath = target.startsWith("/assets/")
    ? target.slice("/assets/".length)
    : URL_LIKE.test(target)
      ? ""
      : resolveRelativePath(dirnameOf(options.docId), target)
  for (const candidate of assetPath ? posterCandidates(assetPath) : []) {
    const asset = await assets.resolve(candidate)
    if (asset.exists) {
      node.properties.poster = asset.url
      return
    }
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
