/**
 * Revision store — docs/06 "Revision / undo"
 *
 * ก่อน write/move/delete ทุกครั้ง เก็บสำเนาเดิมไว้ที่
 * `var/revisions/<path>/<ts>.md` + `<ts>.meta.json` และ rotate เก็บ 20 rev/doc
 *
 * interface + implementation ในหน่วยความจำอยู่ที่ core (isomorphic — test ได้)
 * ของจริง (`node:fs`) อยู่ที่ `@doku/fs-node`
 */

export const REVISION_KEEP = 20

export interface RevisionSnapshot {
  md: string | null
  meta: string | null
}

export interface RevisionEntry {
  ts: string
  /** ISO 8601 ของ ts */
  at: string
  hasMeta: boolean
  bytes: number
}

export interface RevisionStore {
  /** เก็บ snapshot — ไม่มีอะไรให้เก็บ (md และ meta ว่าง) = ไม่เขียน คืน null */
  save(docId: string, snapshot: RevisionSnapshot, at?: Date): Promise<RevisionEntry | null>
  list(docId: string): Promise<RevisionEntry[]>
  read(docId: string, ts: string): Promise<RevisionSnapshot | null>
  latest(docId: string): Promise<RevisionEntry | null>
  prune(docId: string, keep?: number): Promise<number>
}

/** `20250912T100000000Z` — เรียงตามเวลาได้ เป็นชื่อไฟล์ที่ปลอดภัย */
export function revisionTs(date: Date = new Date()): string {
  return date.toISOString().replace(/[-:.]/g, "")
}

export function parseRevisionTs(ts: string): Date | null {
  const base = ts.slice(0, 19)
  const match = base.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z$/)
  if (!match) return null
  const [, year, month, day, hour, minute, second, ms] = match
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

const REVISION_TS_PATTERN = /^\d{4}\d{2}\d{2}T\d{6}\d{3}Z(?:-\d+)?$/

/** ts ที่ปลอดภัยสำหรับใช้เป็นชื่อไฟล์ (กัน path traversal จาก `doku restore <path> <ts>`) */
export function isRevisionTs(ts: string): boolean {
  return REVISION_TS_PATTERN.test(ts)
}

/** implementation ในหน่วยความจำ — ใช้ใน test และ fallback */
export function memoryRevisionStore(): RevisionStore {
  const store = new Map<string, Map<string, RevisionSnapshot>>()

  const bucket = (docId: string): Map<string, RevisionSnapshot> => {
    let found = store.get(docId)
    if (!found) {
      found = new Map()
      store.set(docId, found)
    }
    return found
  }

  const entryOf = (ts: string, snapshot: RevisionSnapshot): RevisionEntry => ({
    ts,
    at: (parseRevisionTs(ts) ?? new Date(0)).toISOString(),
    hasMeta: snapshot.meta !== null,
    bytes: (snapshot.md?.length ?? 0) + (snapshot.meta?.length ?? 0),
  })

  const prune = (docId: string, keep = REVISION_KEEP): number => {
    const items = [...bucket(docId).keys()].sort()
    let removed = 0
    while (items.length > keep) {
      const oldest = items.shift()
      if (oldest === undefined) break
      bucket(docId).delete(oldest)
      removed += 1
    }
    return removed
  }

  const listOf = (docId: string): RevisionEntry[] =>
    [...bucket(docId).entries()]
      .map(([ts, snapshot]) => entryOf(ts, snapshot))
      .sort((a, b) => (a.ts < b.ts ? 1 : -1))

  return {
    async save(docId, snapshot, at = new Date()) {
      if (snapshot.md === null && snapshot.meta === null) return null
      const base = revisionTs(at)
      let ts = base
      let counter = 1
      while (bucket(docId).has(ts)) {
        ts = `${base}-${counter}`
        counter += 1
      }
      bucket(docId).set(ts, snapshot)
      prune(docId)
      return entryOf(ts, snapshot)
    },
    async list(docId) {
      return listOf(docId)
    },
    async read(docId, ts) {
      return bucket(docId).get(ts) ?? null
    },
    async latest(docId) {
      return listOf(docId)[0] ?? null
    },
    async prune(docId, keep = REVISION_KEEP) {
      return prune(docId, keep)
    },
  }
}
