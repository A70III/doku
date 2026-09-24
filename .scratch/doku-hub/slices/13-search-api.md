# 13 — search-api
Status: open
Phase: M5
Files I may touch: `packages/server/src/api.ts` (route `GET /api/search` + `ApiDeps.searchIndex` เท่านั้น — ส่วน audit hooks ในไฟล์เดียวกันเป็นของ ticket 09) · `packages/server/src/app.tsx` · `packages/server/src/index.ts` · `packages/server/src/web/client.ts` · `packages/server/test/search.test.ts` (new)
Plan item: plan.md §5 M5 — `GET /api/search` + palette upgrade (full-text)
DoD check: `bun test packages/server/test/search.test.ts` → 4 tests เขียว (hits+snippet+tag+limit · ไม่มี index = 503 · boot sync/trailing-debounce lifecycle) · live: `curl :7683/api/search?q=...` คืน hit + watcher-trigger ทำให้ doc ใหม่ค้นเจอภายใน ~1.5s

## Notes
- contract `--json`-style envelope `{ok, query, count, hits}` · read route ไม่ใช้ write limit
- palette (client.ts) = debounce 200ms + seq กันคำตอบเก่า + merge/dedup หน้าสุด — plan §5 บอก "palette upgrade" (ไม่ใช่หน้า /search เดี่ยว → decision ข้อ 79)
- `app.tsx`/`index.ts` ยังมี hunks ของ backlinks (slice 15) ในไฟล์เดียว — sequential
