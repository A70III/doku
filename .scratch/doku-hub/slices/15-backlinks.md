# 15 — backlinks
Status: open
Phase: M5
Files I may touch: `packages/fs-node/src/search-index.ts` (ตาราง `links` + `extractLinks` + `backlinks()` — ต่อยอดจาก slice 12) · `packages/server/src/index-db.ts` (`SearchIndex.backlinks`) · `packages/server/src/app.tsx` (`/d/*` คำนวณ backlinks) · `packages/server/src/web/pages.tsx` (section `doku-backlinks`) · `packages/core/src/styles/prose.ts` (CSS ข้าง colophon) · `packages/server/test/search.test.ts` (ส่วน render test)
Plan item: plan.md §5 M5 — backlinks + wikilink resolve (link table)
DoD check: `bun test packages/fs-node packages/server/test/search.test.ts` → เขียวรวม (wiki/relative/`/d` resolve · self-link ไม่นับ · reindex/ลบตามทัน · `/d/<doc>` โชว์ "เชื่อมโยงมาจาก") · live: `curl :7683/d/projects/guide` มี `class="doku-backlinks"` + `href="/d/notes/back"`

## Notes
- links เก็บ raw (`wiki|doc|dpath`) ตอน index + **resolve ตอน query** ด้วย `buildDocIndex`/`resolveWikiTarget` (กำกวม = ตัวแรก เหมือน render · self-link ไม่นับ) → decision ข้อ 78
- render อยู่นอก fragment cache (page shell ต่อ request) → ไม่แตะ cache key · CSS ใช้โทเคนล้วน (ผ่าน rhythm/contrast เดิม)
- `search-index.ts`/`index-db.ts` มี hunks ของ slice 12 อยู่ — sequential หลัง sliceนั้น
