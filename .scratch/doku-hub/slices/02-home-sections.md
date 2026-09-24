# S2 — home-sections

Status: done
Phase: M3.5
Files I may touch: `packages/server/src/web/pages.tsx` (+ a new sibling file under `web/` if HomePage needs splitting)
Plan item: plan.md §5 → 3.5.1 (folder sections on home) + 3.5.3 (date groups rendered on home)
DoD check: start server (`bun run dev`) → `curl localhost:7667/` contains a section per top-level folder (name + doc count) and date-group labels for the flat list; `bun test` + `check` + `typecheck` green

## Notes

- Depends on S1 (`web/listing.ts` API) — spawn only after S1 PASS.
- Design: Digital Archivist — masthead + hairline + catalogue rows · folder color/icon from
  `_folder.meta.json` as a small tint only · no card grids, no gradient, single accent (docs/03 Part B).
- Data: `state.docs` + `tree` are already passed to HomePage — no core changes, no `meta.category`.
- Keep pinned/recent/tag sections that exist; folder sections sit with them, sort/date groups per `?sort=`.
- Forbidden: `client.ts` · `api.ts` · `core/**`.

## Controller rulings on round-1 verify findings (2026-09-24)

Round-1 verifier verdict: FINDINGS (3 low; all ten plan §4 invariants PASS; gates green; DoD curl passed).

- **F1 `pages.tsx:751` + `app.tsx:214` → FIX REQUIRED (code).** The `/` hunk passes an
  already-parsed `parseSort(...)` while the prop is documented as the **raw** query string and
  HomePage re-parses at `:787`. Fix = route passes `context.req.query("sort")` raw; HomePage parses
  exactly once (direct-call tests pass raw/bogus strings and must keep falling back to `mtime`).
  `parseSort` stays imported in app.tsx — S3's `/d/*` hunk still uses it.
- **F2 folder count = direct docs → RULING: intended, no code change.** Count convention =
  `dirnameOf(doc.id) === folder.path`, the **same convention FolderPage's SubfolderRow uses** (that
  slice PASSed its verify). Badge count therefore always equals the rows actually shown — never a
  lie. A folder whose docs all live deeper intentionally still renders its header with 0
  (discoverability — code comment `pages.tsx:868-869`; test `home-sections.test.ts` "โฟลเดอร์นับ 0").
  Counting the subtree instead would either mismatch the rows shown or break the single-appearance
  partition (`plan.md` §4 #1-adjacent: no doc may vanish or double outside the sanctioned
  `ล่าสุด` highlight). Phase DoD is satisfied: the folder is browsable home → `/d/projects` →
  subfolder row shows the nested count.
- **F3 sort scope → RULING: intended, no code change.** Sections carry inherent orders (ปักหมุด =
  pinned-first · `ล่าสุด` = mtime by definition · folder sections = sidebar-mirror `folderRowOrder`
  incl. manual `order`); **`?sort=` governs the flat "ทั้งหมด" catalogue** — the list the SortControl
  is rendered inside, and it renders exactly when that list exists. Sorting folder sections by
  `?sort=` would discard manual `order` on default view (regression vs ticket 05/sidebar).
  Phase DoD "sort ทำงานทั้งสองหน้า" = home flat list + FolderPage, both curl-proven active-link +
  unit-tested row order. Ambiguity resolved here so round-2 verify judges against this spec.

## Amendment (controller · 2026-09-24)

- **Ownership extended:** also the `app.get(\"/\")` hunk in `packages/server/src/app.tsx` — read
  `?sort=` via `parseSort()` (already exported from `web/listing.ts`) and pass `sort` to `HomePage`.
  **Only that hunk.** The `/d/*` route hunk + `findFolderNode` import belong to S3 — do not touch.
  Reason: plan 3.5.4 requires SSR `?sort=` on **both** home and folder page; the query is read in the
  route, and `app.tsx` is S3's file — S3's implementer is already finished, so the hunk is assigned here.
- Sibling work already in the tree (uncommitted — do NOT revert or modify): `web/folder-page.tsx` ·
  `/d/*` hunk + `findFolderNode`/`FolderPage`/`parseSort` imports in `app.tsx` · `core/check.ts` ·
  `core/types.ts` · `core/test/check.test.ts` · `web/listing.ts` · `web/client.ts`.
