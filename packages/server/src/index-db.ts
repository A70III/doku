/**
 * search index lifecycle ฝั่ง server — M5 S1 (docs/01 §Indexer · plan §5 M5)
 *
 * - ตอนบูต: `syncFull` (incremental เทียบ hash ต่อไฟล์) — `/api/search` ใช้ได้ทันที
 * - watcher event → debounce **trailing** 500ms → syncFull — coalesce ไม่ drop event สุดท้าย
 *   (watcher ตัวเอง debounce แบบ drop 200ms + awaitWriteFinish 80ms → rescan รอบถัดไปทับไฟล์ที่ event หาย)
 * - fallback: rescan ทุก 60s (docs/01: "Fallback: rescan interval ถ้า watcher เงียบ")
 * - sync ล้มเหลว = stderr note แล้วไปต่อ — index พังห้ามทำ server พัง (cache/tree ยังใช้ได้)
 * - engine จริงอยู่ที่ `@doku/fs-node` (`search-index.ts`) — CLI/MCP ใช้ตัวเดียวกัน
 */

import type { VaultFs } from "@doku/core"
import {
  type Backlink,
  createSearchIndexStore,
  type SearchHit,
  type SearchIndexStore,
  type SearchOptions,
} from "@doku/fs-node"

export interface SearchIndex {
  search(q: string, options?: SearchOptions): SearchHit[]
  /** เอกสารที่อ้างอิง `targetId` (M5 S4) — resolve จากตาราง links + vault ปัจจุบัน */
  backlinks(targetId: string): Promise<Backlink[]>
  /** เรียกเมื่อ watcher เห็นการเปลี่ยนแปลง — debounce เอง (coalesce ไม่ drop) */
  trigger(): void
  close(): void
}

const DEBOUNCE_MS = 500
/** ค่า default ของ rescan fallback (docs/01) — override ผ่าน `DOKU_RESCAN_MS` (0 = ปิด) */
export const DEFAULT_RESCAN_MS = 60_000

export interface SearchIndexOptions {
  /** ระยะ rescan fallback (ms) · 0/ติดลบ = ปิด (พึ่ง watcher อย่างเดียว) · ไม่ระบุ = 60s */
  rescanMs?: number
}

export async function createSearchIndex(
  varDir: string,
  fs: VaultFs,
  options: SearchIndexOptions = {},
): Promise<SearchIndex> {
  const store: SearchIndexStore = createSearchIndexStore(varDir)

  /**
   * sync ห้ามซ้อนกัน: timer + watcher เรียกพร้อมกันได้ ถ้าตัวเก่ายังไม่จบให้ mark คิวไว้แล้วรันต่อ
   * (เดิม `void sync()` ทุกครั้ง → sync ที่ค้างสะสมเป็นชั้น ๆ = CPU/RAM บวมโดยไม่มีงานจริงเพิ่ม)
   */
  let running = false
  let queued = false

  const sync = async (label: string): Promise<void> => {
    if (running) {
      queued = true
      return
    }
    running = true
    try {
      await store.syncFull(fs)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`index: sync ไม่สำเร็จ (${label}): ${message}\n`)
    } finally {
      running = false
      if (queued) {
        queued = false
        void sync(`${label}:queued`)
      }
    }
  }

  await sync("boot")

  let timer: ReturnType<typeof setTimeout> | null = null
  const trigger = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void sync("watch")
    }, DEBOUNCE_MS)
  }

  const rescanMs = options.rescanMs ?? DEFAULT_RESCAN_MS
  const rescanner = rescanMs > 0 ? setInterval(() => void sync("rescan"), rescanMs) : null
  rescanner?.unref?.()

  return {
    search: (q, options) => store.search(q, options),
    backlinks: (targetId) => store.backlinks(fs, targetId),
    trigger,
    close: () => {
      if (timer) clearTimeout(timer)
      if (rescanner) clearInterval(rescanner)
      store.close()
    },
  }
}
