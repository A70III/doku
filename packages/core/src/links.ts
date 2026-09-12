/**
 * Link rewriting ตอน move/rename — docs/05 "move auto-update links"
 *
 * ทำบน raw markdown (ไม่ round-trip ผ่าน AST) เพื่อไม่ให้รูปแบบไฟล์เปลี่ยน:
 * - `[[design]]` / `[[projects/doku/design]]` / `[[design|alias]]` (wikilink)
 * - `[text](./a.md)` / `![img](../assets/x.png)` (relative)
 * - `[text](/d/projects/doku/design)` (absolute)
 *
 * กติกา: อัปเดตเฉพาะลิงก์ที่ resolve ไปยัง path ที่ย้ายจริง
 * · wikilink แบบ basename ที่กำกวม → ไม่แตะ (ปล่อยให้ `doku check` เตือน `wikilink_ambiguous`)
 */

import { dirnameOf, docIdFromMdPath, docUrl, resolveRelativePath } from "./paths.ts"

export interface MovePlan {
  /** vault path เดิม → ใหม่ (ครอบ doc `.md`, meta `.json` และ asset ที่อยู่ใต้โฟลเดอร์ที่ย้าย) */
  paths: Map<string, string>
  /** doc id เดิม → ใหม่ */
  docs: Map<string, string>
}

/**
 * สร้างแผนการย้าย — `from`/`to` เป็น vault path (ไฟล์หรือโฟลเดอร์)
 * คืน undefined ถ้าไม่มีอะไรเปลี่ยน
 */
export function planMove(
  from: string,
  to: string,
  listing: { docs: readonly string[]; assets: readonly string[] },
): MovePlan {
  const paths = new Map<string, string>()
  const docs = new Map<string, string>()

  const remap = (path: string): void => {
    if (path === from) {
      paths.set(path, to)
      return
    }
    if (path.startsWith(`${from}/`)) {
      paths.set(path, `${to}${path.slice(from.length)}`)
    }
  }

  for (const asset of listing.assets) remap(asset)
  for (const id of listing.docs) {
    const mdPath = `${id}.md`
    remap(mdPath)
    remap(`${id}.meta.json`)
    const mapped = paths.get(mdPath)
    if (mapped) docs.set(id, docIdFromMdPath(mapped))
  }

  return { paths, docs }
}

export function isEmptyPlan(plan: MovePlan): boolean {
  return plan.paths.size === 0 && plan.docs.size === 0
}

/** relative link จาก `fromDir` (โฟลเดอร์ของเอกสาร) ไปยัง vault path เป้าหมาย */
export function relativeVaultLink(fromDir: string, target: string): string {
  const from = fromDir ? fromDir.split("/") : []
  const to = target.split("/")
  let common = 0
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common += 1

  const up = from.slice(common).map(() => "..")
  const down = to.slice(common)
  const segments = [...up, ...down]
  if (segments.length === 0) return "."
  const joined = segments.join("/")
  return joined.startsWith(".") ? joined : `./${joined}`
}

const WIKILINK = /\[\[([^[\]|#]+)((?:#[^[\]|]*)?)((?:\|[^[\]]*)?)\]\]/g
const ABSOLUTE_DOC_LINK = /(\/d\/)([^\s"'<>)\]]+)/g
const RELATIVE_LINK = /\]\(\s*([^)\s]+)(\s+"[^"]*")?\s*\)/g

function splitSuffix(raw: string): { path: string; suffix: string } {
  const match = raw.match(/^([^?#]*)([?#].*)?$/)
  if (!match) return { path: raw, suffix: "" }
  return { path: match[1] ?? raw, suffix: match[2] ?? "" }
}

/**
 * เขียนลิงก์ใน `body` ใหม่ตาม `plan` โดยที่ `docId` คือ path id ของเอกสารนี้
 * (ถ้าเอกสารนี้เองถูกย้าย ผู้เรียกต้องส่ง id ใหม่มา)
 */
export function rewriteMarkdownLinks(
  body: string,
  docId: string,
  plan: MovePlan,
  index: Map<string, string[]>,
): string {
  const dir = dirnameOf(docId)
  let result = body

  // 1) wikilink
  result = result.replace(WIKILINK, (whole, targetRaw: string, anchor: string, alias: string) => {
    const target = targetRaw.trim()
    if (!target) return whole
    if (target.includes("/")) {
      const mapped = plan.docs.get(target)
      return mapped ? `[[${mapped}${anchor}${alias}]]` : whole
    }
    const candidates = index.get(target) ?? []
    if (candidates.length !== 1) return whole // กำกวม/ไม่รู้จัก → ไม่แตะ
    const mapped = plan.docs.get(candidates[0] as string)
    if (!mapped) return whole
    const basename = mapped.slice(mapped.lastIndexOf("/") + 1)
    return `[[${basename}${anchor}${alias}]]`
  })

  // 2) absolute `/d/<path>`
  result = result.replace(ABSOLUTE_DOC_LINK, (whole, prefix: string, raw: string) => {
    const { path, suffix } = splitSuffix(raw)
    let decoded: string
    try {
      decoded = decodeURIComponent(path)
    } catch {
      return whole
    }
    const id = docIdFromMdPath(decoded)
    const mapped = plan.docs.get(id)
    if (!mapped) return whole
    return `${prefix}${docUrl(mapped).slice("/d/".length)}${suffix}`
  })

  // 3) relative markdown links (doc + asset)
  result = result.replace(RELATIVE_LINK, (whole, raw: string, title: string | undefined) => {
    if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("#") || raw.startsWith("/")) {
      return whole
    }
    const { path, suffix } = splitSuffix(raw)
    const resolved = resolveRelativePath(dir, path)
    if (!resolved) return whole
    const mapped = plan.paths.get(resolved)
    if (!mapped) return whole
    return `](${relativeVaultLink(dir, mapped)}${suffix}${title ?? ""})`
  })

  return result
}
