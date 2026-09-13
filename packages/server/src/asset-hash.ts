/**
 * Asset content hash — ใช้ตัดสินว่า `?h=<hash>` ที่ client อ้างมาตรงกับไฟล์จริงหรือไม่
 *
 * ทำไมต้องมี (docs/08 ข้อ 58): เดิมมี `?h=` แล้วให้ `immutable` ทันที
 * → ลิงก์ที่พิมพ์มือใน markdown (`/assets/x.png?h=เก่า`) จะค้างอยู่ในเบราว์เซอร์ 1 ปี
 *   แม้แก้รูปแล้ว · ตอนนี้ `immutable` ได้เฉพาะเมื่อ hash ตรงจริงเท่านั้น
 *
 * cache ผูกกับ (size, mtimeMs) จาก `VaultFs.stat` — adapter ที่ไม่รองรับ stat
 * จะคำนวณใหม่ทุกครั้ง (ถูกต้องเสมอ แค่ช้ากว่า)
 */

import { sha256Hex, type VaultFs } from "@doku/core"

interface Entry {
  hash: string
  size: number
  mtimeMs: number
}

const MAX_ENTRIES = 256

export class AssetHasher {
  #fs: VaultFs
  #cache = new Map<string, Entry>()

  constructor(fs: VaultFs) {
    this.#fs = fs
  }

  /** sha256 ของเนื้อไฟล์ (hex) — คืน null เมื่อไม่มีไฟล์ */
  async hash(rel: string): Promise<string | null> {
    const stat = await this.#stat(rel)
    const cached = this.#cache.get(rel)
    if (stat && cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      this.#touch(rel, cached)
      return cached.hash
    }

    const bytes = await this.#fs.readBytes(rel)
    if (!bytes) return null
    const hash = await sha256Hex(bytes)
    if (stat) {
      this.#touch(rel, { hash, size: stat.size, mtimeMs: stat.mtimeMs })
    }
    return hash
  }

  async #stat(rel: string): Promise<{ size: number; mtimeMs: number } | null> {
    if (!this.#fs.stat) return null
    try {
      const stat = await this.#fs.stat(rel)
      if (!stat) return null
      return { size: stat.size, mtimeMs: stat.mtimeMs }
    } catch {
      return null
    }
  }

  #touch(rel: string, entry: Entry): void {
    this.#cache.delete(rel)
    this.#cache.set(rel, entry)
    while (this.#cache.size > MAX_ENTRIES) {
      const oldest = this.#cache.keys().next().value
      if (oldest === undefined) break
      this.#cache.delete(oldest)
    }
  }
}
