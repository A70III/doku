# S2 — home-sections

Status: open
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
- Forbidden: `client.ts` · `app.tsx` · `api.ts` · `core/**`.
