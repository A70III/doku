# S4 — palette-tags

Status: open
Phase: M3.5
Files I may touch: `packages/server/src/web/client.ts` (only)
Plan item: plan.md §5 → 3.5.5 (palette matches tags — ticket 04 decision)
DoD check: `bun run check` + `bun run typecheck` + `bun test` green · filter evidence reported as `file:line` where tags join the match text · live Ctrl+K confirmation deferred to S5

## Notes

- Fully disjoint — may run in parallel with S1/S2/S3.
- `paletteDocs` comes from `GET /api/docs` → each entry already carries `tags: string[]` (DocSummary).
- Behavior: Ctrl+K query should match title, id/path, **and tags** (case-insensitive, same as now).
  Missing/empty `tags` must not throw. Keep the current UX (list, hints, keyboard) unchanged.
- No new files, no tests required beyond gates (DOM code — S5 verifies live).
