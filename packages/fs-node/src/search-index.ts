/**
 * search index — `var/index.db` (Drizzle ORM + bun:sqlite FTS5) — M5 S1
 * (plan §5 · docs/01 §Indexer · docs/04 "DB" · docs/07 M5)
 *
 * อยู่ใน `@doku/fs-node` เพราะเป็น var-side store ที่ server/CLI/MCP ใช้ร่วมกัน
 * — รูปแบบเดียวกับ `createNodeRevisionStore` (ทิศทาง: cli/server/mcp → core + fs-node ห้าม import
 * กันเอง) · server = เจ้าของเขียน (watcher sync) · CLI/MCP = sync แล้วค้น
 *
 * - **disposable** — สร้างจาก vault เสมอ: `PRAGMA user_version` = schema version
 *   (ไม่ตรง = drop แล้วสร้างใหม่ — ไม่ต้อง migration ซับซ้อนกับ index ที่ทิ้งได้)
 * - **incremental ตาม file hash** = sha256(md + space + meta sidecar raw) — เทียบแถวเดิม ข้ามของเดิม
 * - FTS5 **trigram** tokenizer — ค้น substring ได้ทั้งไทย/อังกฤษ (unicode61 segment คำไทยไม่ได้)
 *   · query สั้นกว่า 3 อักขระ = LIKE เฉพาะ title/path (trigram ตอบ 0 แถว — ไม่ linear-scan เนื้อหา)
 * - WAL + busy_timeout=5s — server (เขียน) + CLI/MCP (sync+ค้น) เปิดพร้อมกันหลาย process ได้
 * - engine โยน error ตรง ๆ ไม่ swallow — ใครเรียกเป็นคนตัดสินใจ (server: note · CLI: error code)
 */

import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname, resolve as resolvePath } from "node:path"
import {
  buildDocIndex,
  isSafeVaultPath,
  loadMeta,
  normalizeLinkTarget,
  resolveWikiTarget,
  scanMarkdown,
  sha256Hex,
  splitFrontmatter,
  type VaultFs,
  walkVault,
} from "@doku/core"
import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

/** schema version — เปลี่ยน = ทิ้ง DB แล้วสร้างใหม่ (index disposable: docs/01) · v2 = เพิ่มตาราง links (M5 S4) */
const SCHEMA_VERSION = 2

/** FTS5 trigram ต้องการ query ≥ 3 อักขระ (สั้นกว่านั้น = 0 แถวเสมอ — ใช้ LIKE fallback) */
const TRIGRAM_MIN = 3

const DDL = `
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  tags TEXT NOT NULL,
  status TEXT NOT NULL,
  mtime_ms INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  hash TEXT NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  title, body, tags,
  tokenize = 'trigram'
);
CREATE TABLE IF NOT EXISTS links (
  from_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  target TEXT NOT NULL
);
`

/** แถว metadata ต่อเอกสาร — Drizzle schema สำหรับ typed query (DDL ดูด้านบน) */
export const docsTable = sqliteTable("docs", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  /** JSON array ของ tags — กรองด้วย `json_each` ใน SQL */
  tags: text("tags").notNull(),
  status: text("status").notNull(),
  mtimeMs: integer("mtime_ms").notNull(),
  bytes: integer("bytes").notNull(),
  /** sha256(md + space + meta raw) — ไม่เปลี่ยน = ข้ามตอน sync */
  hash: text("hash").notNull(),
})

/** แถว outgoing link 1 เส้น (M5 S4) — `kind`: wiki | doc (relative .md) | dpath (`/d/…`) */
export const linksTable = sqliteTable("links", {
  fromId: text("from_id").notNull(),
  kind: text("kind").notNull(),
  target: text("target").notNull(),
})

/** backlink = เอกสารอื่นที่ resolve มาชน `targetId` (resolve ตอน query — ตรงกับสถานะ vault ปัจจุบัน) */
export interface Backlink {
  path: string
  title: string
}

export interface SearchHit {
  path: string
  title: string
  tags: string[]
  /** เนื้อหาบางส่วนพร้อม [] รอบคำที่ match (ช่อง snippet ของ FTS5) */
  snippet: string
  mtimeMs: number
  bytes: number
}

export interface SearchOptions {
  limit?: number
  /** กรอง tag ตรงตัว (json_each บนแถวด้านใน) */
  tag?: string
}

export interface IndexSyncStats {
  /** เอกสารที่เดินเจอ */
  scanned: number
  /** hash เปลี่ยน → เขียนใหม่ */
  updated: number
  /** hash เดิม → ข้าม */
  skipped: number
  /** อยู่ใน index แต่หายจาก vault → ลบ */
  removed: number
}

export type ChangeResult = "indexed" | "removed" | "unchanged" | "ignored"

export interface SearchIndexStore {
  readonly dbPath: string
  /** เดิน vault ทั้งหมด — เทียบ hash ต่อไฟล์ (incremental) + reconcile แถวที่หาย */
  syncFull(fs: VaultFs): Promise<IndexSyncStats>
  /** event จาก watcher — รับเฉพาะ `.md`/`.meta.json` (เปลี่ยน/ลบ = upsert/remove) */
  applyChange(fs: VaultFs, relativePath: string): Promise<ChangeResult>
  remove(id: string): boolean
  /** เอกสารที่ link มาหา `targetId` — resolve จากตาราง links + index ปัจจุบันของ vault */
  backlinks(fs: VaultFs, targetId: string): Promise<Backlink[]>
  search(q: string, options?: SearchOptions): SearchHit[]
  count(): number
  close(): void
}

function escapeLike(value: string): string {
  return value.replaceAll(/[\\%_]/g, (char) => `\\${char}`)
}

function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((tag): tag is string => typeof tag === "string")
  } catch {
    // แถว parse ไม่ได้ = คืน [] (index สร้างใหม่จาก vault ได้เสมอ)
  }
  return []
}

interface LinkSeed {
  kind: "wiki" | "doc" | "dpath"
  target: string
}

/**
 * ดึง outgoing links จาก md (ไม่ render — ใช้ scanner เดียวกับ `doku check`):
 * `[[wikilink]]` · relative `[x](./a.md)` · `/d/<path>` (ถูก classify เป็น external → จับเอง)
 * target ผ่าน `normalizeLinkTarget` (ตัด `#anchor` · ปฎิเสธ path ไม่ปลอดภัย = ข้าม)
 */
function extractLinks(id: string, body: string): LinkSeed[] {
  const scan = scanMarkdown(body, id)
  const seeds: LinkSeed[] = []
  const seen = new Set<string>()
  const push = (kind: LinkSeed["kind"], target: string): void => {
    const key = `${kind} ${target}`
    if (target === "" || seen.has(key)) return
    seen.add(key)
    seeds.push({ kind, target })
  }
  for (const raw of scan.wikilinks) {
    try {
      push("wiki", normalizeLinkTarget(raw, {}))
    } catch {
      // path ไม่ผ่าน normalize = ไม่ใช่ link ที่ resolve ได้ → ข้าม
    }
  }
  for (const link of scan.links) {
    if (link.kind === "doc" && link.resolved) {
      push("doc", link.resolved.endsWith(".md") ? link.resolved.slice(0, -3) : link.resolved)
      continue
    }
    if (link.kind === "external" && link.raw.startsWith("/d/")) {
      try {
        const target = normalizeLinkTarget(link.raw.slice(3), {})
        push("dpath", target.endsWith(".md") ? target.slice(0, -3) : target)
      } catch {
        // ไม่ปลอดภัย = ข้าม
      }
    }
  }
  return seeds
}

function pragmaNumber(sqlite: Database, name: string): number {
  const row = sqlite.prepare(`PRAGMA ${name}`).get() as Record<string, unknown> | number | null
  if (row === null || row === undefined) return 0
  if (typeof row === "number") return row
  const value = row[name]
  return typeof value === "number" ? value : Number(value ?? 0)
}

export function createSearchIndexStore(varDir: string): SearchIndexStore {
  const dbPath = resolvePath(varDir, "index.db")
  mkdirSync(dirname(dbPath), { recursive: true })

  const sqlite = new Database(dbPath)
  // WAL = reader (CLI/MCP) ไม่บล็อก writer (server) · busy = รอแทนล้ม (หลาย process พร้อมกัน)
  sqlite.exec("PRAGMA journal_mode = WAL")
  sqlite.exec("PRAGMA busy_timeout = 5000")

  const version = pragmaNumber(sqlite, "user_version")
  if (version !== SCHEMA_VERSION) {
    // ไม่ตรง version = ทิ้งแล้วสร้างใหม่ — ของเก่าสร้างกลับจาก vault ได้เสมอ (disposable)
    sqlite.exec("DROP TABLE IF EXISTS docs_fts")
    sqlite.exec("DROP TABLE IF EXISTS links")
    sqlite.exec("DROP TABLE IF EXISTS docs")
  }
  sqlite.exec(DDL)
  if (version !== SCHEMA_VERSION) sqlite.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)

  const db = drizzle(sqlite)

  const existingRow = (id: string): { rowid: number; hash: string } | undefined => {
    const row = db
      .select({ rowid: sql<number>`rowid`, hash: docsTable.hash })
      .from(docsTable)
      .where(eq(docsTable.id, id))
      .get()
    return row ? { rowid: row.rowid, hash: row.hash } : undefined
  }

  /** แถวต้องมีอยู่ก่อนเรียก (caller เช็ค existing แล้ว) — คืน true เสมอหลังลบ */
  const deleteDoc = (id: string, rowid: number | undefined): boolean => {
    if (rowid !== undefined) sqlite.prepare("DELETE FROM docs_fts WHERE rowid = ?").run(rowid)
    db.delete(linksTable).where(eq(linksTable.fromId, id)).run()
    db.delete(docsTable).where(eq(docsTable.id, id)).run()
    return true
  }

  /** อ่านไฟล์ + hash → ข้ามถ้าเดิม · ไม่มีไฟล์ = ลบ · ไม่ใช่ = upsert docs + FTS ใน transaction เดียว */
  const indexOne = async (
    fs: VaultFs,
    id: string,
  ): Promise<"indexed" | "removed" | "unchanged"> => {
    const md = await fs.readText(`${id}.md`)
    const existing = existingRow(id)
    if (md === null) {
      if (!existing) return "unchanged"
      deleteDoc(id, existing.rowid)
      return "removed"
    }

    const metaRaw = await fs.readText(`${id}.meta.json`)
    const hash = await sha256Hex(`${md} ${metaRaw ?? ""}`)
    if (existing && existing.hash === hash) return "unchanged"

    const { data: frontmatter, body } = splitFrontmatter(md)
    const { meta } = await loadMeta(fs, id, frontmatter)
    const stat = await fs.stat?.(`${id}.md`)
    const values = {
      id,
      title: meta.title || id.slice(id.lastIndexOf("/") + 1),
      tags: JSON.stringify(meta.tags),
      status: meta.status,
      mtimeMs: Math.trunc(stat?.mtimeMs ?? 0),
      bytes: new TextEncoder().encode(md).byteLength,
      hash,
    }

    sqlite.exec("BEGIN IMMEDIATE")
    try {
      let rowid: number
      if (existing) {
        sqlite.prepare("DELETE FROM docs_fts WHERE rowid = ?").run(existing.rowid)
        const updated = db
          .update(docsTable)
          .set(values)
          .where(eq(docsTable.id, id))
          .returning({ rowid: sql<number>`rowid` })
          .get()
        rowid = updated?.rowid ?? existing.rowid
      } else {
        const inserted = db
          .insert(docsTable)
          .values(values)
          .returning({ rowid: sql<number>`rowid` })
          .get()
        if (!inserted) throw new Error(`insert docs ไม่สำเร็จ: ${id}`)
        rowid = inserted.rowid
      }
      sqlite
        .prepare("INSERT INTO docs_fts(rowid, title, body, tags) VALUES (?, ?, ?, ?)")
        .run(rowid, values.title, body, values.tags)
      // outgoing links ของเอกสารนี้ — แทนที่ทั้งชุด (M5 S4 · docs/01: index เก็บ FTS + tags + links)
      db.delete(linksTable).where(eq(linksTable.fromId, id)).run()
      const seeds = extractLinks(id, body)
      if (seeds.length > 0) {
        db.insert(linksTable)
          .values(seeds.map((seed) => ({ fromId: id, kind: seed.kind, target: seed.target })))
          .run()
      }
      sqlite.exec("COMMIT")
    } catch (error) {
      sqlite.exec("ROLLBACK")
      throw error
    }
    return "indexed"
  }

  interface RawHit {
    path: string
    title: string
    tags: string
    mtime_ms: number
    bytes: number
    snippet: string
  }

  /** LIKE fallback — เฉพาะ title/path/tags (ไม่แตะเนื้อหา — trigram ใช้ไม่ได้กับ query < 3 อักขระ) */
  const likeSearch = (tokens: string[], options: SearchOptions, limit: number): RawHit[] => {
    const where: string[] = []
    const params: (string | number)[] = []
    for (const token of tokens) {
      where.push(`(d.title LIKE ? ESCAPE '\\' OR d.id LIKE ? ESCAPE '\\')`)
      const pattern = `%${escapeLike(token)}%`
      params.push(pattern, pattern)
    }
    if (options.tag) {
      where.push("EXISTS (SELECT 1 FROM json_each(d.tags) WHERE json_each.value = ?)")
      params.push(options.tag)
    }
    const text = `SELECT d.id AS path, d.title AS title, d.tags AS tags, d.mtime_ms AS mtime_ms,
       d.bytes AS bytes, '' AS snippet
FROM docs d
${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
ORDER BY d.mtime_ms DESC
LIMIT ?`
    params.push(limit)
    return sqlite.prepare(text).all(...params) as unknown as RawHit[]
  }

  /** FTS path — token ≥ 3 อักขระ ผ่าน trigram (AND กัน) · token สั้นกว่า = LIKE post-filter */
  const ftsSearch = (q: string, options: SearchOptions, limit: number): RawHit[] => {
    const tokens = q.split(/\s+/).filter((token) => token.length > 0)
    const ftsTokens = tokens.filter((token) => token.length >= TRIGRAM_MIN)
    const shortTokens = tokens.filter((token) => token.length < TRIGRAM_MIN)
    if (ftsTokens.length === 0) return likeSearch(tokens, options, limit)

    // match ใน quoted phrase — trigram ค้น substring ข้ามคำไทยได้ (ไม่มี word boundary)
    const match = ftsTokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" AND ")
    const where: string[] = ["docs_fts MATCH ?"]
    const params: (string | number)[] = [match]
    if (options.tag) {
      where.push("EXISTS (SELECT 1 FROM json_each(d.tags) WHERE json_each.value = ?)")
      params.push(options.tag)
    }
    for (const token of shortTokens) {
      where.push(`(d.title LIKE ? ESCAPE '\\' OR d.id LIKE ? ESCAPE '\\')`)
      const pattern = `%${escapeLike(token)}%`
      params.push(pattern, pattern)
    }
    const text = `SELECT d.id AS path, d.title AS title, d.tags AS tags, d.mtime_ms AS mtime_ms,
       d.bytes AS bytes, snippet(docs_fts, 1, '[', ']', '…', 14) AS snippet
FROM docs_fts JOIN docs d ON d.rowid = docs_fts.rowid
WHERE ${where.join(" AND ")}
ORDER BY rank
LIMIT ?`
    params.push(limit)
    return sqlite.prepare(text).all(...params) as unknown as RawHit[]
  }

  const backlinks = async (fs: VaultFs, targetId: string): Promise<Backlink[]> => {
    const listing = await walkVault(fs)
    const known = new Set(listing.docs)
    const docIndex = buildDocIndex(listing.docs)
    const rows = db
      .select({ fromId: linksTable.fromId, kind: linksTable.kind, target: linksTable.target })
      .from(linksTable)
      .all()
    const fromIds = new Set<string>()
    for (const row of rows) {
      if (row.fromId === targetId || !known.has(row.fromId)) continue // self-link/แถวเก่า = ไม่นับ
      const resolved = row.kind === "wiki" ? resolveWikiTarget(docIndex, row.target).id : row.target
      if (resolved === targetId) fromIds.add(row.fromId)
    }
    if (fromIds.size === 0) return []
    const titles = new Map(
      db
        .select({ id: docsTable.id, title: docsTable.title })
        .from(docsTable)
        .all()
        .map((row) => [row.id, row.title]),
    )
    return [...fromIds].sort().map((path) => ({ path, title: titles.get(path) ?? path }))
  }

  const search = (q: string, options: SearchOptions = {}): SearchHit[] => {
    const query = q.trim()
    if (query === "") return []
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), 100)
    const tokens = query.split(/\s+/).filter((token) => token.length > 0)
    const hasFtsToken = tokens.some((token) => token.length >= TRIGRAM_MIN)
    const rows = hasFtsToken ? ftsSearch(query, options, limit) : likeSearch(tokens, options, limit)
    return rows.map((row) => ({
      path: row.path,
      title: row.title,
      tags: parseTags(row.tags),
      snippet: row.snippet,
      mtimeMs: row.mtime_ms,
      bytes: row.bytes,
    }))
  }

  const syncFull = async (fs: VaultFs): Promise<IndexSyncStats> => {
    const listing = await walkVault(fs)
    const seen = new Set(listing.docs)
    let updated = 0
    let skipped = 0
    for (const id of listing.docs) {
      try {
        const result = await indexOne(fs, id)
        if (result === "indexed") updated += 1
        else skipped += 1
      } catch {
        // path ที่ safeJoin ปฏิเสธ (เช่น มี #) = ข้ามไฟล์เดียว — index ห้ามพังทั้ง vault (best-effort)
        skipped += 1
      }
    }
    let removed = 0
    const stored = db.select({ id: docsTable.id, rowid: sql<number>`rowid` }).from(docsTable).all()
    for (const row of stored) {
      if (seen.has(row.id)) continue
      deleteDoc(row.id, row.rowid)
      removed += 1
    }
    return { scanned: listing.docs.length, updated, skipped, removed }
  }

  const applyChange = async (fs: VaultFs, relativePath: string): Promise<ChangeResult> => {
    // path ไม่ผ่าน path safety (dot segment .trash/.git · `#` · `..`) = ห้ามเข้า index เสมอ
    // (invariant 9 + safeJoin ของ adapter ก็จะโยน — กันตรงนี้ก่อนเพื่อไม่ให้ sync ล้ม)
    if (!isSafeVaultPath(relativePath)) return "ignored"
    if (relativePath.endsWith(".meta.json")) {
      return indexOne(fs, relativePath.slice(0, -".meta.json".length))
    }
    if (relativePath.endsWith(".md")) return indexOne(fs, relativePath.slice(0, -3))
    return "ignored"
  }

  const remove = (id: string): boolean => {
    const existing = existingRow(id)
    if (!existing) return false
    return deleteDoc(id, existing.rowid)
  }

  const count = (): number => db.select({ n: sql<number>`count(*)` }).from(docsTable).get()?.n ?? 0

  return {
    dbPath,
    syncFull,
    applyChange,
    remove,
    backlinks,
    search,
    count,
    close: () => {
      sqlite.close()
    },
  }
}
