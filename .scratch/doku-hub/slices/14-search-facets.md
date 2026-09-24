# 14 — search-facets
Status: open
Phase: M5
Files I may touch: `packages/mcp/src/tools.ts` · `packages/mcp/test/server.test.ts` · `packages/mcp/test/stdio.test.ts` · `packages/cli/src/index.ts` (บล็อก `search` เท่านั้น — ไฟล์นี้ร่วมกับ ticket 09 audit และ ticket 16 build ที่ sequential) · `packages/cli/test/search.test.ts` (new)
Plan item: plan.md §5 M5 — MCP `doc_search` + CLI `search` / `list --tag`
DoD check: `bun test packages/mcp` → 23 เขียว (tools/list = 12 ตัวเต็มตาราง docs/05 §4 · doc_search behavior + stdio step ค้นเจอ/miss) · `bun test packages/cli/test/search.test.ts` → 3 เขียว (envelope · AND+ไทย+tag+limit · usage exit 2)

## Notes
- ทั้งคู่ sync incremental จาก vault ก่อนค้น (เทียบ hash) → server ไม่ได้เปิดก็ค้นได้ · engine ตัวเดียวกับ server (slice 12)
- `list --tag` มีอยู่แล้วจาก ticket 10 — ไม่ต้องแก้
