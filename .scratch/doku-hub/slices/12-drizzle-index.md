# 12 — drizzle-index
Status: open
Phase: M5
Files I may touch: `packages/fs-node/src/search-index.ts` (new) · `packages/fs-node/src/index.ts` · `packages/fs-node/package.json` · `bun.lock` · `packages/server/src/index-db.ts` (new) · `packages/fs-node/test/search-index.test.ts` (new)
Plan item: plan.md §5 M5 — Drizzle schema + migration (bun:sqlite) + FTS5 + incremental index ตาม file hash
DoD check: `bun test packages/fs-node/test/search-index.test.ts` → 7 tests เขียว (sync ครบ · hash-skip incremental · trigram ค้น substring กลางประโยคไทย · LIKE fallback q<3 · tag/limit · applyChange/remove · reopen + user_version rebuild)

## Notes
- engine อยู่ `@doku/fs-node` (var-side store ร่วม server/CLI/MCP — แบบ `createNodeRevisionStore`) เพราะ cli/server/mcp ห้าม import กันเอง (plan §4 #3) → decision ที่จะเคาะ = docs/08 ข้อ 76
- FTS5 tokenizer = **trigram** (unicode61 segment คำไทยไม่ได้) · q สั้นกว่า 3 อักขระ = LIKE เฉพาะ title/path (ไม่ linear-scan เนื้อหา) → ข้อ 75 · migration = `PRAGMA user_version` ไม่ใช้ drizzle-kit (disposable) → ข้อ 77
- `packages/server/src/index-db.ts` = lifecycle ฝั่ง server (boot sync · watcher trailing-debounce · rescan 60s · best-effort stderr) — ส่วน `backlinks` ที่เพิ่มทีหลังในไฟล์เดียวกันเป็นของ slice 15
- overlap: `search-index.ts`/`index-db.ts` ถูก slice 15 (backlinks) แตะต่อ — ทั้งคู่ sequential หลัง sliceนี้
