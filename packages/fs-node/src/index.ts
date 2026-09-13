/**
 * `@doku/fs-node` — VaultFs adapter สำหรับ Bun/Node (เจ้าของ I/O จริง)
 *
 * ทำไมแยก package: CLI และ server (M1) ต้องใช้ adapter ตัวเดียวกัน และ `@doku/core`
 * ห้ามผูก `node:fs` (hard invariant) → แยกเป็น leaf package ที่ทั้งคู่ depend ได้
 * (decision ใน docs/08 — node fs adapter)
 *
 * path safety (docs/06): ทุก path จาก user/agent ผ่าน `safeJoin`
 * = isSafeVaultPath → resolve → prefix check → realpath check (symlink หลุด vault ไม่ได้)
 *
 * M3: เพิ่ม write (atomic temp → rename) + `trashStore()` + `createNodeRevisionStore()`
 */

import type { Dirent } from "node:fs"
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join, resolve as resolvePath, sep } from "node:path"
import {
  isDotEntry,
  isRevisionTs,
  isSafeVaultPath,
  isTrashId,
  parseRevisionTs,
  parseTrashManifest,
  REVISION_KEEP,
  type RevisionEntry,
  type RevisionSnapshot,
  type RevisionStore,
  revisionTs,
  TRASH_DIR,
  type TrashItem,
  type TrashStore,
  trashId,
  trashManifestPath,
  type VaultEntry,
  type WritableVaultFs,
} from "@doku/core"

export interface NodeVaultFs extends WritableVaultFs {
  /** absolute path ของ vault root (ผ่าน realpath แล้ว) */
  readonly root: string
  /** trash ที่ผูกกับ vault นี้ (soft-delete — docs/06) */
  trashStore(): TrashStore
}

/**
 * realpath ของ path ที่อาจยังไม่มี — ถ้า leaf ยังไม่มี ให้ไล่ขึ้นไปจนเจอบรรพบุรุษที่มีอยู่จริง
 * (จำเป็นสำหรับ write/mkdir/move: parent อาจเป็น symlink ที่ชี้หลุด vault — docs/06)
 */
async function resolveRealPath(abs: string): Promise<string> {
  try {
    return await realpath(abs)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "ENOENT" && code !== "ENOTDIR") throw error
  }
  let current = dirname(abs)
  for (;;) {
    try {
      return await realpath(current)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error
    }
    const parent = dirname(current)
    if (parent === current) return current
    current = parent
  }
}

/** guard ของ path ที่ resolve ใต้ `root` — คืน absolute พร้อมเช็ค prefix + realpath (รวม ancestor) */
function createRealpathGuard(root: string) {
  const realRoot = root.endsWith(sep) ? root.slice(0, -1) : root
  const prefix = realRoot + sep
  return {
    realRoot,
    prefix,
    async check(abs: string, label: string): Promise<string> {
      if (abs !== realRoot && !abs.startsWith(prefix)) {
        throw new Error(`path ออกนอก vault: ${label}`)
      }
      const real = await resolveRealPath(abs)
      if (real !== realRoot && !real.startsWith(prefix)) {
        throw new Error(`symlink ออกนอก vault: ${label}`)
      }
      return abs
    },
  }
}

export async function createNodeVaultFs(root: string): Promise<NodeVaultFs> {
  const realRoot = await realpath(resolvePath(root))
  const guard = createRealpathGuard(realRoot)

  /** rel (ปลอดภัยแล้ว) → absolute ที่อยู่ใน vault จริง (ทั้ง path และ realpath) */
  async function safeJoin(rel: string): Promise<string> {
    if (rel !== "" && !isSafeVaultPath(rel)) {
      throw new Error(`path ไม่ปลอดภัย: ${rel}`)
    }
    return guard.check(resolvePath(realRoot, rel), rel)
  }

  async function read(rel: string): Promise<Buffer | null> {
    try {
      return await readFile(await safeJoin(rel))
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR") return null
      throw error
    }
  }

  /** เขียน atomic: temp ไฟล์ในโฟลเดอร์เดียวกัน → rename (docs/08 ข้อ 8) */
  async function writeAtomic(rel: string, data: string | Uint8Array): Promise<void> {
    const abs = await safeJoin(rel)
    await mkdir(dirname(abs), { recursive: true })
    const tmp = `${abs}.doku-tmp-${crypto.randomUUID()}`
    await writeFile(tmp, data)
    try {
      await rename(tmp, abs)
    } catch (error) {
      await rm(tmp, { force: true })
      throw error
    }
  }

  const trash = createNodeTrashStore(realRoot)

  return {
    root: realRoot,
    trashStore() {
      return trash
    },
    async readText(rel) {
      return (await read(rel))?.toString("utf8") ?? null
    },
    async readBytes(rel) {
      const buffer = await read(rel)
      return buffer ? new Uint8Array(buffer) : null
    },
    async stat(rel) {
      try {
        const info = await stat(await safeJoin(rel))
        return { mtimeMs: info.mtimeMs, size: info.size }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === "ENOENT" || code === "EISDIR" || code === "ENOTDIR") return null
        throw error
      }
    },
    async list(rel): Promise<VaultEntry[]> {
      const abs = await safeJoin(rel)
      let entries: Dirent[]
      try {
        entries = await readdir(abs, { withFileTypes: true })
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === "ENOENT" || code === "ENOTDIR") return []
        throw error
      }
      return (
        entries
          // watcher/tree/index ข้าม dotfile/dotfolder ทุกตัว (hard invariant ข้อ 9)
          .filter((entry) => !isDotEntry(entry.name))
          .map(
            (entry): VaultEntry => ({
              name: entry.name,
              type: entry.isDirectory() ? "dir" : "file",
            }),
          )
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === "dir" ? -1 : 1
            return a.name.localeCompare(b.name)
          })
      )
    },
    async writeText(rel, content) {
      await writeAtomic(rel, content)
    },
    async writeBytes(rel, bytes) {
      await writeAtomic(rel, bytes)
    },
    async mkdir(rel) {
      if (!rel) return
      await mkdir(await safeJoin(rel), { recursive: true })
    },
    async remove(rel) {
      if (!rel) return
      await rm(await safeJoin(rel), { recursive: true, force: true })
    },
    async move(from, to) {
      const source = await safeJoin(from)
      const target = await safeJoin(to)
      await mkdir(dirname(target), { recursive: true })
      await rename(source, target)
    },
    async exists(rel) {
      try {
        await stat(await safeJoin(rel))
        return true
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === "ENOENT" || code === "ENOTDIR") return false
        throw error
      }
    },
  }
}

/* ── trash (docs/06 · docs/08 ข้อ 2/10) ───────────────────────────────── */

async function sizeOf(abs: string): Promise<number> {
  try {
    const info = await stat(abs)
    if (!info.isDirectory()) return info.size
  } catch {
    return 0
  }
  let total = 0
  for (const entry of await readdir(abs, { withFileTypes: true })) {
    total += await sizeOf(join(abs, entry.name))
  }
  return total
}

export function createNodeTrashStore(vaultRoot: string): TrashStore {
  const guard = createRealpathGuard(vaultRoot)
  /** path ใต้ vault (รวม `.trash` ที่เป็น dotfolder) พร้อม realpath check (docs/06/08 ข้อ 39) */
  const vaultAbs = (relative: string): Promise<string> =>
    guard.check(resolvePath(guard.realRoot, relative), relative)
  const trashRoot = resolvePath(guard.realRoot, TRASH_DIR)

  const readManifest = async (id: string): Promise<TrashItem | null> => {
    if (!isTrashId(id)) return null
    try {
      return parseTrashManifest(await readFile(await vaultAbs(trashManifestPath(id)), "utf8"))
    } catch {
      return null
    }
  }

  const ids = async (): Promise<string[]> => {
    try {
      const entries = await readdir(trashRoot, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isDirectory() && isTrashId(entry.name))
        .map((entry) => entry.name)
    } catch {
      return []
    }
  }

  const removeItem = async (id: string): Promise<void> => {
    await rm(await vaultAbs(`${TRASH_DIR}/${id}`), { recursive: true, force: true })
  }

  /** path ใต้ `.trash/<id>/…` ที่เราสร้างเอง — ปลอดภัยถ้า id และ rel ผ่าน validation */
  const isTrashPath = (path: string): boolean => {
    if (!path.startsWith(`${TRASH_DIR}/`)) return false
    const rest = path.slice(TRASH_DIR.length + 1)
    const slash = rest.indexOf("/")
    if (slash === -1) return false
    return isTrashId(rest.slice(0, slash)) && isSafeVaultPath(rest.slice(slash + 1))
  }

  const movePath = async (from: string, to: string): Promise<void> => {
    if (!isSafeVaultPath(from) && !isTrashPath(from)) throw new Error(`path ไม่ปลอดภัย: ${from}`)
    const target = await vaultAbs(to)
    await mkdir(dirname(target), { recursive: true })
    await rename(await vaultAbs(from), target)
  }

  /** มี path อยู่แล้วหรือไม่ (ใช้กันการทับตอน restore — docs/08 ข้อ 39) */
  const targetExists = async (relative: string): Promise<boolean> =>
    (await stat(await vaultAbs(relative)).catch(() => null)) !== null

  return {
    async list() {
      const items: TrashItem[] = []
      for (const id of await ids()) {
        const item = await readManifest(id)
        if (item) items.push(item)
      }
      return items.sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1))
    },

    async put(sources, options) {
      const deletedAt = options.deletedAt ?? new Date()
      // id ซ้ำ = manifest ทับ item เก่า → หา id ว่างก่อน (แบบเดียวกับ revision store)
      let id = trashId(deletedAt)
      let counter = 1
      while ((await stat(await vaultAbs(`${TRASH_DIR}/${id}`)).catch(() => null)) !== null) {
        id = `${trashId(deletedAt)}-${counter}`
        counter += 1
      }
      let bytes = 0
      const kept: string[] = []
      const writeManifest = async (): Promise<TrashItem> => {
        const item: TrashItem = {
          id,
          label: options.label,
          kind: options.kind,
          sources: kept,
          deletedAt: deletedAt.toISOString(),
          bytes,
        }
        await writeFile(
          await vaultAbs(trashManifestPath(id)),
          JSON.stringify(item, null, 2),
          "utf8",
        )
        return item
      }
      try {
        for (const source of sources) {
          const abs = await vaultAbs(source)
          if ((await stat(abs).catch(() => null)) === null) continue // ไม่มีไฟล์ = ข้าม
          bytes += await sizeOf(abs)
          await movePath(source, `${TRASH_DIR}/${id}/${source}`)
          kept.push(source)
        }
      } catch (error) {
        // ล้มกลางทาง → เขียน manifest เท่าที่ย้ายสำเร็จ เพื่อไม่ให้ไฟล์ค้างแบบมองไม่เห็น
        if (kept.length > 0) await writeManifest()
        throw error
      }
      return writeManifest()
    },

    async restore(id) {
      const item = await readManifest(id)
      if (!item) throw new Error(`ไม่พบรายการใน trash: ${id}`)
      for (const source of item.sources) {
        // กันทับ: path เดิมต้องว่าง (docs/08 ข้อ 39) — API ตรวจก่อนแล้ว แต่ adapter ต้องกันด้วย
        if (await targetExists(source)) throw new Error(`path เดิมมีอยู่แล้ว: ${source}`)
      }
      for (const source of item.sources) {
        await movePath(`${TRASH_DIR}/${id}/${source}`, source)
      }
      await removeItem(id)
      return item
    },

    async empty() {
      const list = await ids()
      for (const id of list) await removeItem(id)
      return list.length
    },

    async purge(days, now = new Date()) {
      const cutoff = now.getTime() - (days ?? 30) * 24 * 60 * 60 * 1000
      let removed = 0
      for (const id of await ids()) {
        const item = await readManifest(id)
        if (!item) continue
        const at = Date.parse(item.deletedAt)
        if (Number.isNaN(at) || at >= cutoff) continue
        await removeItem(id)
        removed += 1
      }
      return removed
    },
  }
}

/* ── revisions (docs/06) ─────────────────────────────────────────────── */

export interface NodeRevisionStore extends RevisionStore {
  /** absolute path ของ var/revisions — ใช้ debug */
  readonly root: string
}

export async function createNodeRevisionStore(varDir: string): Promise<NodeRevisionStore> {
  const root = resolvePath(varDir, "revisions")
  await mkdir(root, { recursive: true })

  const dirOf = (docId: string): string => {
    if (!isSafeVaultPath(docId)) throw new Error(`docId ไม่ปลอดภัย: ${docId}`)
    return join(root, docId)
  }

  const fileOf = (docId: string, ts: string, ext: string): string => {
    if (!isRevisionTs(ts)) throw new Error(`ts ไม่ถูกต้อง: ${ts}`)
    return join(dirOf(docId), `${ts}${ext}`)
  }

  const entryOf = (ts: string, snapshot: RevisionSnapshot): RevisionEntry => ({
    ts,
    at: (parseRevisionTs(ts) ?? new Date(0)).toISOString(),
    hasMeta: snapshot.meta !== null,
    bytes: (snapshot.md?.length ?? 0) + (snapshot.meta?.length ?? 0),
  })

  const listOf = async (docId: string): Promise<RevisionEntry[]> => {
    const dir = dirOf(docId)
    let files: string[]
    try {
      files = await readdir(dir)
    } catch {
      return []
    }
    const map = new Map<string, RevisionSnapshot>()
    for (const file of files) {
      const isMeta = file.endsWith(".meta.json")
      const isMd = !isMeta && file.endsWith(".md")
      if (!isMeta && !isMd) continue
      const ts = file.slice(0, isMeta ? -".meta.json".length : -".md".length)
      if (!isRevisionTs(ts)) continue
      const current = map.get(ts) ?? { md: null, meta: null }
      const content = await readFile(join(dir, file), "utf8")
      if (isMeta) current.meta = content
      else current.md = content
      map.set(ts, current)
    }
    return [...map.entries()]
      .map(([ts, snapshot]) => entryOf(ts, snapshot))
      .sort((a, b) => (a.ts < b.ts ? 1 : -1))
  }

  const prune = async (docId: string, keep = REVISION_KEEP): Promise<number> => {
    const list = await listOf(docId)
    let removed = 0
    for (const entry of list.slice(keep)) {
      await rm(fileOf(docId, entry.ts, ".md"), { force: true })
      await rm(fileOf(docId, entry.ts, ".meta.json"), { force: true })
      removed += 1
    }
    return removed
  }

  return {
    root,
    async save(docId, snapshot, at = new Date()) {
      if (snapshot.md === null && snapshot.meta === null) return null
      await mkdir(dirOf(docId), { recursive: true })
      const base = revisionTs(at)
      const existsAt = async (candidate: string): Promise<boolean> => {
        const md = await stat(fileOf(docId, candidate, ".md")).catch(() => null)
        if (md) return true
        return (await stat(fileOf(docId, candidate, ".meta.json")).catch(() => null)) !== null
      }
      let ts = base
      let counter = 1
      while (await existsAt(ts)) {
        ts = `${base}-${counter}`
        counter += 1
      }
      if (snapshot.md !== null) await writeFile(fileOf(docId, ts, ".md"), snapshot.md, "utf8")
      if (snapshot.meta !== null)
        await writeFile(fileOf(docId, ts, ".meta.json"), snapshot.meta, "utf8")
      await prune(docId)
      return entryOf(ts, snapshot)
    },
    async list(docId) {
      return listOf(docId)
    },
    async read(docId, ts) {
      if (!isRevisionTs(ts)) return null
      const md = await readFile(fileOf(docId, ts, ".md"), "utf8").catch(() => null)
      const meta = await readFile(fileOf(docId, ts, ".meta.json"), "utf8").catch(() => null)
      if (md === null && meta === null) return null
      return { md, meta }
    },
    async latest(docId) {
      return (await listOf(docId))[0] ?? null
    },
    prune,
  }
}
