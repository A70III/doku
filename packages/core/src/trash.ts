/**
 * Trash (soft-delete) — docs/06, docs/08 ข้อ 2 + 10
 *
 * - ลบ = ย้ายเข้า `vault/.trash/<id>/...` เสมอ (agent ลบถาวรไม่ได้)
 * - `.trash` เป็น dotfolder → watcher/tree/index ข้ามอัตโนมัติ
 * - แต่ละรายการมี manifest `vault/.trash/<id>/.doku-trash.json` เก็บ path เดิม
 * - retention: auto-purge 30 วัน (TRASH_RETENTION_DAYS)
 *
 * interface + implementation ในหน่วยความจำอยู่ที่ core (isomorphic — test ได้)
 * ของจริง (`node:fs`) อยู่ที่ `@doku/fs-node`
 */

export const TRASH_DIR = ".trash"
/** manifest ต่อรายการ — dotfile จึงไม่ถูก index เป็น asset */
export const TRASH_MANIFEST = ".doku-trash.json"
export const TRASH_RETENTION_DAYS = 30

export type TrashKind = "doc" | "folder" | "asset"

export interface TrashItem {
  /** id ของรายการ = ชื่อโฟลเดอร์ใต้ `.trash/` */
  id: string
  /** path id เดิมที่ผู้ใช้เห็น (doc: ไม่มี `.md` · folder/asset: path เต็ม) */
  label: string
  kind: TrashKind
  /** vault path ของไฟล์/โฟลเดอร์ที่ถูกย้าย (relative เดิม) */
  sources: string[]
  /** ISO 8601 date-time */
  deletedAt: string
  bytes: number
}

export interface TrashStore {
  list(): Promise<TrashItem[]>
  /** ย้าย `sources` เข้า trash เป็นรายการเดียว — `sources` ต้องเป็น vault path ที่ปลอดภัยแล้ว */
  put(
    sources: readonly string[],
    options: { label: string; kind: TrashKind; deletedAt?: Date },
  ): Promise<TrashItem>
  /** กู้คืนทั้งรายการ — คืน metadata ของรายการที่กู้แล้ว */
  restore(id: string): Promise<TrashItem>
  /** ลบถาวรทุกอย่างใน trash — คืนจำนวนรายการที่ลบ (คนเท่านั้นที่เรียกได้ — docs/06) */
  empty(): Promise<number>
  /** ลบรายการที่เก่ากว่า `days` วัน — คืนจำนวนรายการที่ลบ */
  purge(days?: number, now?: Date): Promise<number>
}

const TRASH_ID_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]*$/

/** id ปลอดภัยสำหรับใช้เป็นชื่อโฟลเดอร์ (`..`, `/`, ว่าง = ปฏิเสธ) */
export function isTrashId(id: string): boolean {
  if (!id || id === "." || id === "..") return false
  return TRASH_ID_PATTERN.test(id)
}

/** `2025-09-12T10-00-00-000Z-ab12` — อ่านด้วยตาได้ + เรียงตามเวลาได้ */
export function trashId(date: Date = new Date()): string {
  const stamp = date.toISOString().replace(/[:.]/g, "-")
  const suffix = Math.floor(Math.random() * 0xffff)
    .toString(16)
    .padStart(4, "0")
  return `${stamp}-${suffix}`
}

export function parseTrashManifest(raw: string | null): TrashItem | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const value = parsed as Record<string, unknown>
  if (typeof value.id !== "string" || !isTrashId(value.id)) return null
  if (typeof value.label !== "string" || value.label.length === 0) return null
  if (value.kind !== "doc" && value.kind !== "folder" && value.kind !== "asset") return null
  if (!Array.isArray(value.sources) || value.sources.some((item) => typeof item !== "string")) {
    return null
  }
  if (typeof value.deletedAt !== "string") return null
  return {
    id: value.id,
    label: value.label,
    kind: value.kind,
    sources: value.sources as string[],
    deletedAt: value.deletedAt,
    bytes: typeof value.bytes === "number" ? value.bytes : 0,
  }
}

export function trashManifestPath(id: string): string {
  return `${TRASH_DIR}/${id}/${TRASH_MANIFEST}`
}

export interface MemoryTrashBacking {
  entries: Map<string, Uint8Array>
  directories: Set<string>
}

const encoder = new TextEncoder()

/** implementation ในหน่วยความจำ — ใช้ร่วมกับ `memoryVaultFs()` (store เดียวกัน) */
export function memoryTrashStoreOver(backing: MemoryTrashBacking): TrashStore {
  const { entries, directories } = backing

  const listNames = (prefix: string): string[] => {
    const names = new Set<string>()
    const collect = (candidate: string): void => {
      if (!candidate.startsWith(prefix)) return
      const rest = candidate.slice(prefix.length)
      if (!rest) return
      const slash = rest.indexOf("/")
      names.add(slash === -1 ? rest : rest.slice(0, slash))
    }
    for (const dir of directories) collect(dir)
    for (const file of entries.keys()) collect(file)
    return [...names]
  }

  const sizeOf = (path: string): number => {
    const bytes = entries.get(path)
    if (bytes) return bytes.byteLength
    const prefix = `${path}/`
    let total = 0
    for (const [key, value] of entries) if (key.startsWith(prefix)) total += value.byteLength
    return total
  }

  const removePath = (path: string): void => {
    entries.delete(path)
    directories.delete(path)
    const prefix = `${path}/`
    for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key)
    for (const key of [...directories]) if (key.startsWith(prefix)) directories.delete(key)
  }

  const movePath = (from: string, to: string): void => {
    const addParents = (path: string): void => {
      const segments = path.split("/")
      for (let index = 1; index < segments.length; index += 1) {
        directories.add(segments.slice(0, index).join("/"))
      }
    }
    const file = entries.get(from)
    if (file) {
      entries.delete(from)
      entries.set(to, file)
      addParents(to)
      return
    }
    if (!directories.has(from)) return
    directories.delete(from)
    directories.add(to)
    addParents(to)
    const prefix = `${from}/`
    for (const key of [...directories]) {
      if (!key.startsWith(prefix)) continue
      directories.delete(key)
      const moved = `${to}/${key.slice(prefix.length)}`
      directories.add(moved)
      addParents(moved)
    }
    for (const [key, bytes] of [...entries]) {
      if (!key.startsWith(prefix)) continue
      entries.delete(key)
      const moved = `${to}/${key.slice(prefix.length)}`
      entries.set(moved, bytes)
      addParents(moved)
    }
  }

  const readManifest = (id: string): TrashItem | null => {
    const bytes = entries.get(trashManifestPath(id))
    return bytes ? parseTrashManifest(new TextDecoder().decode(bytes)) : null
  }

  const writeManifest = (item: TrashItem): void => {
    entries.set(trashManifestPath(item.id), encoder.encode(JSON.stringify(item, null, 2)))
    directories.add(`${TRASH_DIR}/${item.id}`)
    directories.add(TRASH_DIR)
  }

  const allIds = (): string[] => listNames(`${TRASH_DIR}/`).filter((name) => isTrashId(name))

  return {
    async list() {
      const items: TrashItem[] = []
      for (const id of allIds()) {
        const item = readManifest(id)
        if (item) items.push(item)
      }
      return items.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1))
    },

    async put(sources, options) {
      const deletedAt = options.deletedAt ?? new Date()
      // id ซ้ำ = manifest ทับ item เก่า → หา id ว่างก่อน (ให้ตรงกับ node store)
      const base = trashId(deletedAt)
      let id = base
      let counter = 1
      while (readManifest(id) !== null) {
        id = `${base}-${counter}`
        counter += 1
      }
      const item: TrashItem = {
        id,
        label: options.label,
        kind: options.kind,
        sources: [],
        deletedAt: deletedAt.toISOString(),
        bytes: 0,
      }
      try {
        for (const source of sources) {
          if (!entries.has(source) && !directories.has(source)) continue
          item.bytes += sizeOf(source)
          movePath(source, `${TRASH_DIR}/${id}/${source}`)
          item.sources.push(source)
        }
      } catch (error) {
        // ล้มกลางทาง → เขียน manifest เท่าที่ย้ายสำเร็จ (ไม่ให้ไฟล์ค้างแบบมองไม่เห็น)
        if (item.sources.length > 0) writeManifest(item)
        throw error
      }
      writeManifest(item)
      return item
    },

    async restore(id) {
      const item = readManifest(id)
      if (!item) throw new Error(`ไม่พบรายการใน trash: ${id}`)
      for (const source of item.sources) {
        // กันทับ path เดิม (docs/08 ข้อ 39) — ให้ตรงกับ node store
        if (entries.has(source) || directories.has(source)) {
          throw new Error(`path เดิมมีอยู่แล้ว: ${source}`)
        }
      }
      for (const source of item.sources) {
        movePath(`${TRASH_DIR}/${id}/${source}`, source)
      }
      removePath(`${TRASH_DIR}/${id}`)
      return item
    },

    async empty() {
      const ids = allIds()
      for (const id of ids) removePath(`${TRASH_DIR}/${id}`)
      return ids.length
    },

    async purge(days = TRASH_RETENTION_DAYS, now = new Date()) {
      const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000
      let removed = 0
      for (const id of allIds()) {
        const item = readManifest(id)
        if (!item) continue
        const at = Date.parse(item.deletedAt)
        if (Number.isNaN(at) || at >= cutoff) continue
        removePath(`${TRASH_DIR}/${id}`)
        removed += 1
      }
      return removed
    },
  }
}
