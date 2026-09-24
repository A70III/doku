# S3 — folder-page

Status: done
Phase: M3.5
Files I may touch: `packages/server/src/app.tsx` (route branch) · new `packages/server/src/web/folder-page.tsx` · `packages/core/src/check.ts` + `packages/core` warning-code/type files (duplicate-name check) · a test under `packages/core/test/` or `packages/server/test/`
Plan item: plan.md §5 → 3.5.2 (FolderPage + duplicate-name `x/` vs `x.md` check — ticket 06 decision)
DoD check: `curl localhost:7667/d/<folder>` → 200 with subfolder rows + doc listing (was 404) · `doku check` on a temp vault containing `x/` + `x.md` reports the new clash warning · `bun test` + `check` + `typecheck` green

## Notes

- Depends on S1 (`web/listing.ts`) — spawn in the same batch as S2 (disjoint files).
- Route logic: in `GET /d/*`, after `normalizeVaultPath`, when no `<path>.md` exists but the path is
  a directory in tree/state → render FolderPage; doc path keeps winning when `x.md` exists (ticket 06c).
- FolderPage header = breadcrumb + title (from `_folder.meta.json`, fallback folder name) + stats —
  no action buttons (ticket 06b) · order: pinned → subfolders → date groups (ticket 06a).
- Skip `.trash`/dotfolders (invariant 9) — reuse existing tree/state data which already skips them.
- Never expose `.trash` or dotfolders in listings (invariant 9).
- Forbidden: `pages.tsx` · `client.ts` · `api.ts`.
