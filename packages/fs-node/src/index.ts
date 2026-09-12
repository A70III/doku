/**
 * `@doku/fs-node` — VaultFs adapter สำหรับ Bun/Node (เจ้าของ I/O จริง)
 *
 * ทำไมแยก package: CLI และ server (M1) ต้องใช้ adapter ตัวเดียวกัน และ `@doku/core`
 * ห้ามผูก `node:fs` (hard invariant) → แยกเป็น leaf package ที่ทั้งคู่ depend ได้
 * (decision ใน docs/08 — node fs adapter)
 *
 * path safety (docs/06): ทุก path จาก user/agent ผ่าน `safeJoin`
 * = isSafeVaultPath → resolve → prefix check → realpath check (symlink หลุด vault ไม่ได้)
 */

import type { Dirent } from "node:fs"
import { readdir, readFile, realpath, stat } from "node:fs/promises"
import { resolve as resolvePath, sep } from "node:path"
import { isDotEntry, isSafeVaultPath, type VaultEntry, type VaultFs } from "@doku/core"

export interface NodeVaultFs extends VaultFs {
  /** absolute path ของ vault root (ผ่าน realpath แล้ว) */
  readonly root: string
}

export async function createNodeVaultFs(root: string): Promise<NodeVaultFs> {
  const realRoot = await realpath(resolvePath(root))
  const prefix = realRoot.endsWith(sep) ? realRoot : realRoot + sep

  /** resolve rel → absolute ที่อยู่ใน vault จริง (ทั้ง path และ realpath) */
  async function safeJoin(rel: string): Promise<string> {
    if (rel !== "" && !isSafeVaultPath(rel)) {
      throw new Error(`path ไม่ปลอดภัย: ${rel}`)
    }
    const abs = resolvePath(realRoot, rel)
    if (abs !== realRoot && !abs.startsWith(prefix)) {
      throw new Error(`path ออกนอก vault: ${rel}`)
    }
    try {
      const real = await realpath(abs)
      if (real !== realRoot && !real.startsWith(prefix)) {
        throw new Error(`symlink ออกนอก vault: ${rel}`)
      }
    } catch (error) {
      // ไม่มีไฟล์ = ยังไม่ต้องเช็ค realpath (ผู้เรียกจัดการ null เอง)
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    return abs
  }

  async function read(rel: string): Promise<Buffer | null> {
    try {
      return await readFile(await safeJoin(rel))
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT" || code === "EISDIR") return null
      throw error
    }
  }

  return {
    root: realRoot,
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
        if (code === "ENOENT" || code === "EISDIR") return null
        throw error
      }
    },
    async list(rel): Promise<VaultEntry[]> {
      const abs = await safeJoin(rel)
      let entries: Dirent[]
      try {
        entries = await readdir(abs, { withFileTypes: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
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
  }
}
