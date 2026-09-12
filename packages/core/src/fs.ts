/**
 * fs adapter — `core` ห้าม import `node:fs` ตรงๆ (hard invariant)
 * ผู้เรียก (CLI/server/test) เป็นเจ้าของ I/O จริง และต้องทำ path safety ของตัวเอง
 * (safeJoin: resolve + prefix check + realpath — docs/06) ก่อนเรียก adapter
 *
 * M3 เพิ่มความสามารถเขียน (`VaultWriter`) ให้ `core` ยัง isomorphic:
 * interface อยู่ที่นี่ · ของจริง (`node:fs`) อยู่ที่ `@doku/fs-node`
 * write ต้อง atomic (temp → rename) — เป็นหน้าที่ของ adapter (docs/08 ข้อ 8)
 */

import { memoryTrashStoreOver, type TrashStore } from "./trash.ts"

export interface VaultEntry {
  name: string
  type: "file" | "dir"
}

/** ผลของ stat — ใช้ home "recent" (docs/03 §5) · optional เพราะ adapter บางตัวให้ไม่ได้ */
export interface VaultStat {
  mtimeMs: number
  size: number
}

export interface VaultFs {
  /** อ่านไฟล์เป็น text — คืน `null` ถ้าไม่มีไฟล์ */
  readText(rel: string): Promise<string | null>
  /** อ่านไฟล์เป็น bytes — คืน `null` ถ้าไม่มีไฟล์ (ใช้ hash asset) */
  readBytes(rel: string): Promise<Uint8Array | null>
  /** list เนื้อในโฟลเดอร์ (rel = "" คือ root) — ข้าม dotfile/dotfolder ได้เลย */
  list(rel: string): Promise<VaultEntry[]>
  /** stat ไฟล์ — ถ้า adapter ไม่รองรับให้เว้น undefined (ผู้เรียกต้องเช็คเสมอ) */
  stat?(rel: string): Promise<VaultStat | null>
}

/**
 * ส่วนเขียนของ vault (M3) — relay = vault path ที่ปลอดภัยแล้วเท่านั้น
 * adapter ต้องทำ: safeJoin + mkdir parents + เขียน atomic
 * path ที่เป็น dotfile/dotfolder ไม่ถูกเรียกผ่าน interface นี้ (`.trash` มี store ของตัวเอง)
 */
export interface VaultWriter {
  writeText(rel: string, content: string): Promise<void>
  writeBytes(rel: string, bytes: Uint8Array): Promise<void>
  /** สร้างโฟลเดอร์ (รวม parents) — มีอยู่แล้ว = ไม่ error */
  mkdir(rel: string): Promise<void>
  /** ลบไฟล์หรือโฟลเดอร์ (recursive) — ไม่มีอยู่ = ไม่ error */
  remove(rel: string): Promise<void>
  /** ย้าย/เปลี่ยนชื่อ (rel → rel) — สร้างโฟลเดอร์ปลายทางให้ */
  move(from: string, to: string): Promise<void>
  exists(rel: string): Promise<boolean>
}

export type WritableVaultFs = VaultFs & VaultWriter

/** ตรวจ runtime ว่า adapter นี้เขียนได้ไหม (server/CLI เช็คก่อนเปิด route เขียน) */
export function isWritableVaultFs(fs: VaultFs): fs is WritableVaultFs {
  const candidate = fs as Partial<VaultWriter>
  return (
    typeof candidate.writeText === "function" &&
    typeof candidate.writeBytes === "function" &&
    typeof candidate.mkdir === "function" &&
    typeof candidate.remove === "function" &&
    typeof candidate.move === "function" &&
    typeof candidate.exists === "function"
  )
}

export function isDotEntry(name: string): boolean {
  return name.startsWith(".")
}

/** adapter ในหน่วยความจำ — ใช้ใน test และตอนรันแบบ stateless (`render --stdin`) */
export interface MemoryVaultFs extends WritableVaultFs {
  /** ไฟล์ทั้งหมด (snapshot) — ใช้ debug/assert ใน test */
  snapshot(): Record<string, string>
  /** trash store ที่ใช้ store เดียวกัน — ให้ test ตรวจ soft-delete ได้โดยไม่แตะ filesystem */
  trashStore(): TrashStore
}

export function memoryVaultFs(files: Record<string, string | Uint8Array> = {}): MemoryVaultFs {
  const entries = new Map<string, Uint8Array>()
  const directories = new Set<string>()
  const encoder = new TextEncoder()

  const addParents = (path: string): void => {
    const segments = path.split("/")
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join("/"))
    }
  }

  for (const [path, value] of Object.entries(files)) {
    entries.set(path, typeof value === "string" ? encoder.encode(value) : value)
    addParents(path)
  }

  const isDirectory = (path: string): boolean => directories.has(path)
  const childrenOf = (path: string): string[] => {
    const prefix = path ? `${path}/` : ""
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

  const fs: MemoryVaultFs = {
    async readText(rel) {
      const bytes = entries.get(rel)
      return bytes ? new TextDecoder().decode(bytes) : null
    },
    async readBytes(rel) {
      return entries.get(rel) ?? null
    },
    async stat(rel) {
      const bytes = entries.get(rel)
      if (bytes) return { mtimeMs: 0, size: bytes.byteLength }
      return isDirectory(rel) ? { mtimeMs: 0, size: 0 } : null
    },
    async list(rel) {
      if (rel && entries.has(rel)) return []
      const names = new Map<string, VaultEntry["type"]>()
      for (const name of childrenOf(rel)) {
        if (name.startsWith(".")) continue
        const child = rel ? `${rel}/${name}` : name
        names.set(name, isDirectory(child) ? "dir" : "file")
      }
      return [...names]
        .map(([name, type]): VaultEntry => ({ name, type }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1
          return a.name.localeCompare(b.name)
        })
    },
    async writeText(rel, content) {
      entries.set(rel, encoder.encode(content))
      addParents(rel)
    },
    async writeBytes(rel, bytes) {
      entries.set(rel, bytes)
      addParents(rel)
    },
    async mkdir(rel) {
      if (rel) directories.add(rel)
      addParents(rel)
    },
    async remove(rel) {
      entries.delete(rel)
      directories.delete(rel)
      const prefix = `${rel}/`
      for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key)
      for (const key of [...directories]) if (key.startsWith(prefix)) directories.delete(key)
    },
    async move(from, to) {
      const file = entries.get(from)
      if (file) {
        entries.delete(from)
        entries.set(to, file)
        addParents(to)
        return
      }
      if (!isDirectory(from)) return
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
    },
    async exists(rel) {
      return entries.has(rel) || isDirectory(rel)
    },
    snapshot() {
      const result: Record<string, string> = {}
      for (const [path, bytes] of entries) result[path] = new TextDecoder().decode(bytes)
      return result
    },
    trashStore() {
      return memoryTrashStoreOver({ entries, directories })
    },
  }

  return fs
}
