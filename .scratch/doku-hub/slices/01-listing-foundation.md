# S1 — listing-foundation

Status: done
Phase: M3.5
Files I may touch: `packages/server/src/tree.ts` · the DocSummary builder in `packages/server/src` (locate via grep) · new `packages/server/src/web/listing.ts` · new `packages/server/test/listing.test.ts` · `packages/core/src/fs.ts` + `packages/fs-node/src/index.ts` **only** if `VaultStat` lacks a size field
Plan item: plan.md §5 → 3.5.4 (`bytes`) + 3.5.3 (date-group/sort helpers)
DoD check: `bun test packages/server/test/listing.test.ts` green + `bun run check` + `bun run typecheck` clean; helpers covered: dateGroupKey boundaries, parseSort whitelist, sortDocs ×3, groupDocsByDate ordering

## Verdict (2026-09-24)

Verifier: FINDINGS — the only `high` finding is the phase-level `bun run shot` red, proven
pre-existing at clean HEAD (clean-control run) and routed to slice `06-a11y-overflow`.
Slice work itself: ownership respected, ten invariants pass, DoD executed for real
(11 new tests; full suite 334 pass / 0 fail; check + typecheck exit 0).

## Notes

- S2 (home) and S3 (folder page) consume `listing.ts` — API must exist before they spawn: export
  `SortKey`, `parseSort`, `dateGroupKey`, `DATE_GROUP_LABELS` (Thai), `groupDocsByDate`, `sortDocs`.
- Date groups: `today` = same local date · `yesterday` = 1 calendar day · `week` ≤ 7d · `month` ≤ 30d · else `older`.
- Sort: `mtime` newest-first (default) · `name` localeCompare (`th`) · `size` descending.
- Forbidden in this slice: `pages.tsx` · `client.ts` · `app.tsx` · `api.ts`.
