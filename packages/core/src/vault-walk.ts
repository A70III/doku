/** เดิน vault เพื่อหาเอกสาร/asset — ใช้ร่วมกันทั้ง check และตัวช่วย resolve ลิงก์ */

import { isDotEntry, type VaultFs } from "./fs.ts"

export function isDocPath(path: string): boolean {
  return path.endsWith(".md")
}

export function isMetaSidecar(path: string): boolean {
  return path.endsWith(".meta.json")
}

export interface VaultListing {
  /** path id ของเอกสารทุกตัว (ไม่มี `.md`) */
  docs: string[]
  /** vault path ของไฟล์ที่ไม่ใช่เอกสาร/meta (มีนามสกุล) */
  assets: string[]
}

/** recursive walk — ข้าม dotfile/dotfolder ทุกตัว (รวม `vault/.trash`) */
export async function walkVault(fs: VaultFs): Promise<VaultListing> {
  const docs: string[] = []
  const assets: string[] = []

  async function visit(rel: string): Promise<void> {
    const entries = await fs.list(rel)
    for (const entry of entries) {
      if (isDotEntry(entry.name)) continue
      const path = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.type === "dir") {
        await visit(path)
        continue
      }
      if (isMetaSidecar(path)) continue
      if (isDocPath(path)) docs.push(path.slice(0, -3))
      else assets.push(path)
    }
  }

  await visit("")
  docs.sort()
  assets.sort()
  return { docs, assets }
}

/** map basename → path id ทุกตัว (ใช้ resolve `[[wikilink]]` ก่อนมี index ที่ M5) */
export function buildDocIndex(docs: readonly string[]): Map<string, string[]> {
  const index = new Map<string, string[]>()
  for (const id of docs) {
    const name = id.slice(id.lastIndexOf("/") + 1)
    const bucket = index.get(name)
    if (bucket) bucket.push(id)
    else index.set(name, [id])
  }
  return index
}

export interface WikiTargetResolution {
  id: string | null
  ambiguous: boolean
}

/** `[[design]]` = basename · `[[projects/doku/design]]` = path ตรงจาก vault */
export function resolveWikiTarget(
  index: Map<string, string[]>,
  target: string,
): WikiTargetResolution {
  const normalized = target.trim()
  if (!normalized) return { id: null, ambiguous: false }

  if (normalized.includes("/")) {
    const candidates = index.get(normalized.slice(normalized.lastIndexOf("/") + 1)) ?? []
    return candidates.includes(normalized)
      ? { id: normalized, ambiguous: false }
      : { id: null, ambiguous: false }
  }

  const candidates = index.get(normalized)
  if (!candidates || candidates.length === 0) return { id: null, ambiguous: false }
  // ซ้ำ = เตือน + เลือกตัวแรก (docs/01 error handling)
  return { id: candidates[0] ?? null, ambiguous: candidates.length > 1 }
}
