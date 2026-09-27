/**
 * VaultState — snapshot ของ vault สำหรับ layout และหน้า hub
 *
 * สิ่งที่เก็บ:
 * - tree สำหรับ sidebar (โฟลเดอร์ sort: order → ชื่อ · ไฟล์ sort: pinned → order → ชื่อ ·
 *   โฟลเดอร์ก่อนไฟล์ — docs/01 sidebar tree, docs/02 โฟลเดอร์)
 * - doc summary (title/tags/pinned/mtime/bytes) สำหรับหน้า home
 * - listingHash — ส่วนหนึ่งของ HTML cache key เพื่อให้ fragment ที่อ้าง asset/wikilink
 *   ถูก render ใหม่เมื่อโครง vault เปลี่ยน (docs/01: cache เป็น pure function ของ input)
 *
 * invalidate โดย watcher (debounce ฝั่ง caller — docs/01: debounce 200ms)
 */

import {
  basenameOf,
  buildDocIndex,
  dirnameOf,
  loadMeta,
  type Meta,
  sha256Hex,
  type VaultFs,
  type VaultStat,
  walkVault,
} from "@doku/core"

export interface DocSummary {
  id: string
  title: string
  tags: string[]
  pinned: boolean
  order?: number
  status: Meta["status"]
  created?: string
  /** mtime ของไฟล์ .md (ถ้า adapter ให้ stat — 0 เมื่อไม่มี) */
  mtimeMs: number
  /** ขนาดไฟล์ .md เป็น bytes (ถ้า adapter ให้ stat — 0 เมื่อไม่มี) — ใช้ sort `?sort=size` */
  bytes: number
}

export interface TreeDoc {
  type: "doc"
  id: string
  name: string
  title: string
  pinned: boolean
  order?: number
}

export interface TreeFolder {
  type: "folder"
  /** vault path ของโฟลเดอร์ ("" = root) — ใช้เป็น key ของ collapse state */
  path: string
  name: string
  title?: string
  icon?: string
  /** hex `#rrggbb` จาก `_folder.meta.json` (ผ่าน Zod แล้ว) — ใช้ tint ไอคอน */
  color?: string
  order?: number
  collapsed?: boolean
  children: TreeNode[]
}

export type TreeNode = TreeDoc | TreeFolder

/**
 * จำกัดความลึกของ tree (API `GET /tree?depth=`) — depth ≤ 0 = ไม่จำกัด
 * depth 1 = ชั้นบนสุดอย่างเดียว · 2 = รวมลูกหนึ่งชั้น
 */
export function clampTreeDepth(nodes: TreeNode[], depth: number): TreeNode[] {
  if (!Number.isFinite(depth) || depth <= 0) return nodes
  return nodes.map((node) => {
    if (node.type !== "folder") return node
    if (depth <= 1) return { ...node, children: [] }
    return { ...node, children: clampTreeDepth(node.children, depth - 1) }
  })
}

export interface VaultSnapshot {
  tree: TreeNode[]
  docs: DocSummary[]
  /** hash ของโครง vault (docs+assets+mtime ของ asset) — ส่วนของ HTML cache key */
  listingHash: string
}

export class VaultState {
  #fs: VaultFs
  #vaultName: string
  #snapshot: Promise<VaultSnapshot> | null = null

  constructor(fs: VaultFs, vaultName = "") {
    this.#fs = fs
    this.#vaultName = vaultName
  }

  /** ชื่อโฟลเดอร์ vault — ใช้ตัด prefix ตอน normalize path จาก URL */
  get vaultName(): string {
    return this.#vaultName
  }

  invalidate(): void {
    this.#snapshot = null
  }

  get(): Promise<VaultSnapshot> {
    this.#snapshot ??= this.#build()
    return this.#snapshot
  }

  /** wikilink index สำหรับ render (basename → path id) */
  async wikiIndex(): Promise<Map<string, string[]>> {
    const { docs } = await this.#walk()
    return buildDocIndex(docs)
  }

  async hasDoc(id: string): Promise<boolean> {
    const { docs } = await this.#walk()
    return docs.includes(id)
  }

  async #walk() {
    return walkVault(this.#fs)
  }

  async #build(): Promise<VaultSnapshot> {
    // walkVault คืน docs เป็น path id (ตัด .md แล้ว) — ไม่ต้อง strip ซ้ำ
    const { docs: docIds, assets, folders } = await this.#walk()

    const summaries = new Map<string, DocSummary>()
    for (const id of docIds) {
      const summary = await this.#readSummary(id)
      if (summary) summaries.set(id, summary)
    }

    // listingHash: เอา mtime ของ asset ด้วย เพราะ asset เปลี่ยน = ?h=<hash> ใน fragment เปลี่ยน
    // ⚠️ fs error ต่อ asset (เช่น symlink ที่หลุด vault) ต้องไม่ทำให้ tree/home ล้มทั้งหน้า
    const assetParts: string[] = []
    for (const asset of assets) {
      let info: VaultStat | null = null
      try {
        info = (await this.#fs.stat?.(asset)) ?? null
      } catch {
        info = null
      }
      assetParts.push(`${asset}:${info?.mtimeMs ?? 0}`)
    }
    const listingHash = await sha256Hex(`${docIds.sort().join("\n")}\n\n${assetParts.join("\n")}`)

    return {
      tree: await buildTree(docIds, this.#fs, summaries, folders),
      docs: [...summaries.values()],
      listingHash,
    }
  }

  async #readDocMeta(id: string): Promise<Meta | null> {
    try {
      const { meta } = await loadMeta(this.#fs, id, null)
      return meta
    } catch {
      return null
    }
  }

  async #readSummary(id: string): Promise<DocSummary | null> {
    const meta = await this.#readDocMeta(id)
    if (!meta) return null
    let stat: VaultStat | null = null
    try {
      stat = (await this.#fs.stat?.(`${id}.md`)) ?? null
    } catch {
      stat = null
    }
    return {
      id,
      title: meta.title ?? basenameOf(id),
      tags: meta.tags,
      pinned: meta.pinned,
      order: meta.order,
      status: meta.status,
      created: meta.created,
      mtimeMs: stat?.mtimeMs ?? 0,
      bytes: stat?.size ?? 0,
    }
  }
}

/** อ่าน `_folder.meta.json` — พัง/ไม่มี = ใช้ default (ไม่ล้ม tree) */
export interface FolderMetaLite {
  title?: string
  icon?: string
  color?: string
  order?: number
  collapsed?: boolean
}

async function loadFolderMeta(fs: VaultFs, dir: string): Promise<FolderMetaLite> {
  const raw = dir
    ? await fs.readText(`${dir}/_folder.meta.json`)
    : await fs.readText("_folder.meta.json")
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const picked = parsed as Record<string, unknown>
    return {
      title: typeof picked.title === "string" ? picked.title : undefined,
      icon: typeof picked.icon === "string" ? picked.icon : undefined,
      color: typeof picked.color === "string" ? picked.color : undefined,
      order: typeof picked.order === "number" ? picked.order : undefined,
      collapsed: typeof picked.collapsed === "boolean" ? picked.collapsed : undefined,
    }
  } catch {
    return {}
  }
}

interface MutableFolder extends TreeFolder {
  children: Mutable[]
}
type Mutable = MutableFolder | TreeDoc

/**
 * สร้าง tree จากรายการ doc id — โฟลเดอร์ก่อนไฟล์
 * โฟลเดอร์ sort: order → ชื่อ · ไฟล์ sort: pinned → order → ชื่อ (docs/02)
 */
export async function buildTree(
  docIds: readonly string[],
  fs: VaultFs,
  summaries: ReadonlyMap<string, DocSummary>,
  folderPaths: readonly string[] = [],
): Promise<TreeNode[]> {
  const root: MutableFolder = { type: "folder", path: "", name: "", children: [] }
  const folders = new Map<string, MutableFolder>([["", root]])

  const folderAt = (dir: string): MutableFolder => {
    let folder = folders.get(dir)
    if (folder) return folder
    folder = folderAt(dirnameOf(dir))
    const node: MutableFolder = {
      type: "folder",
      path: dir,
      name: basenameOf(dir),
      children: [],
    }
    folder.children.push(node)
    folders.set(dir, node)
    return node
  }

  // โฟลเดอร์ว่างต้องอยู่ใน tree ด้วย (สร้างโฟลเดอร์ใหม่แล้วต้องเห็นทันที — M3)
  for (const path of folderPaths) folderAt(path)

  for (const id of docIds) folderAt(dirnameOf(id)).children.push(makeDoc(id, summaries))

  // เติม `_folder.meta.json` ของทุกโฟลเดอร์แล้ว sort ใหม่ทั้งชั้น
  return finalize(root, fs, folders)
}

function makeDoc(id: string, summaries: ReadonlyMap<string, DocSummary>): TreeDoc {
  const summary = summaries.get(id)
  const name = basenameOf(id)
  return {
    type: "doc",
    id,
    name,
    title: summary?.title ?? name,
    pinned: summary?.pinned ?? false,
    order: summary?.order,
  }
}

async function finalize(
  root: MutableFolder,
  fs: VaultFs,
  folders: Map<string, MutableFolder>,
): Promise<TreeNode[]> {
  for (const [path, folder] of folders) {
    const meta = await loadFolderMeta(fs, path)
    folder.title = meta.title
    folder.icon = meta.icon
    folder.color = meta.color
    folder.order = meta.order
    folder.collapsed = meta.collapsed
  }
  sortFolder(root)
  return root.children
}

function sortFolder(folder: MutableFolder): void {
  const children = [...folder.children]
  const foldersSorted = children
    .filter((node): node is MutableFolder => node.type === "folder")
    .sort((a, b) => sortKey(a.order, a.name, b.order, b.name))
  for (const node of foldersSorted) sortFolder(node)
  const docsSorted = children
    .filter((node): node is TreeDoc => node.type === "doc")
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return sortKey(a.order, a.name, b.order, b.name)
    })
  folder.children = [...foldersSorted, ...docsSorted]
}

function sortKey(
  aOrder: number | undefined,
  aName: string,
  bOrder: number | undefined,
  bName: string,
): number {
  if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) return aOrder - bOrder
  if (aOrder !== undefined && bOrder === undefined) return -1
  if (aOrder === undefined && bOrder !== undefined) return 1
  return aName.localeCompare(bName, "th")
}
