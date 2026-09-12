/**
 * HTML fragment cache (docs/01) — key = content hash (md + meta + rendererVersion + theme + listing)
 * in-memory LRU + disk envelope ที่ `var/cache/<key>.json` (warm ตอน restart)
 * cache เป็น disposable — พัง/ผิดรูป = ละเลยแล้ว render ใหม่เสมอ
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Meta, TocEntry, Warning } from "@doku/core"

export interface CachedDoc {
  key: string
  /** HTML ภายในการ์ดเนื้อหา (header + warnings + toc + prose) */
  fragment: string
  meta: Meta
  toc: TocEntry[]
  warnings: Warning[]
}

interface Envelope extends Omit<CachedDoc, "key"> {
  version: string
}

const MAX_ENTRIES = 200

export class FragmentCache {
  #memory = new Map<string, CachedDoc>()
  #dir: string | null
  #version: string

  /**
   * @param dir โฟลเดอร์ disk cache (เช่น `var/cache`) — null = ปิด disk cache (test)
   * @param version RENDERER_VERSION — envelope เก่าที่เวอร์ชันไม่ตรงจะถูกละเลย
   */
  constructor(dir: string | null, version: string) {
    this.#dir = dir
    this.#version = version
  }

  get(key: string): CachedDoc | null {
    const hit = this.#memory.get(key)
    if (hit) {
      // touch สำหรับ LRU (Map เรียงตาม insertion)
      this.#memory.delete(key)
      this.#memory.set(key, hit)
      return hit
    }
    return null
  }

  /** จำนวน entry ใน memory cache — ใช้ใน test */
  get size(): number {
    return this.#memory.size
  }

  async load(key: string): Promise<CachedDoc | null> {
    const memory = this.get(key)
    if (memory) return memory
    if (!this.#dir) return null

    let envelope: Envelope | null = null
    try {
      envelope = JSON.parse(await readFile(this.#path(key), "utf8")) as Envelope
    } catch {
      return null // ไม่มี/พัง = miss ตามปกติ (cache disposable)
    }
    if (!envelope || envelope.version !== this.#version) return null

    const doc: CachedDoc = {
      key,
      fragment: envelope.fragment,
      meta: envelope.meta,
      toc: envelope.toc,
      warnings: envelope.warnings,
    }
    this.#remember(doc)
    return doc
  }

  async store(doc: Omit<CachedDoc, "key">, key: string): Promise<void> {
    const full: CachedDoc = { ...doc, key }
    this.#remember(full)

    if (!this.#dir) return
    const envelope: Envelope = { ...doc, version: this.#version }
    try {
      await mkdir(this.#dir, { recursive: true })
      const target = this.#path(key)
      // write atomic (docs/08 ข้อ 8) — cache เป็นของ disposable แต่เขียน atomic ตามเนื้อโปรเจกต์
      const tmp = `${target}.tmp-${crypto.randomUUID()}`
      await writeFile(tmp, JSON.stringify(envelope))
      await rename(tmp, target)
    } catch {
      // disk cache เขียนไม่ได้ = ข้าม (memory ยังอยู่)
    }
  }

  #path(key: string): string {
    return join(this.#dir as string, `${key}.json`)
  }

  #remember(doc: CachedDoc): void {
    if (this.#memory.has(doc.key)) this.#memory.delete(doc.key)
    this.#memory.set(doc.key, doc)
    while (this.#memory.size > MAX_ENTRIES) {
      const oldest = this.#memory.keys().next().value
      if (oldest === undefined) break
      this.#memory.delete(oldest)
    }
  }
}
