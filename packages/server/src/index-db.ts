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
const RESCAN_MS = 60_000

export async function createSearchIndex(varDir: string, fs: VaultFs): Promise<SearchIndex> {
  const store: SearchIndexStore = createSearchIndexStore(varDir)

  const sync = async (label: string): Promise<void> => {
    try {
      await store.syncFull(fs)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`index: sync ไม่สำเร็จ (${label}): ${message}\n`)
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

  const rescanner = setInterval(() => void sync("rescan"), RESCAN_MS)
  rescanner.unref?.()

  return {
    search: (q, options) => store.search(q, options),
    backlinks: (targetId) => store.backlinks(fs, targetId),
    trigger,
    close: () => {
      if (timer) clearTimeout(timer)
      clearInterval(rescanner)
      store.close()
    },
  }
}
