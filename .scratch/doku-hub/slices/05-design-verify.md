# S5 — design-verify

Status: done
Phase: M3.5
Files I may touch: none (screenshots to `var/shots/`, report only) — code fixes go back to the owning slice
Plan item: plan.md §5 → 3.5.6 (design pass + verify)
DoD check: `bun run shot` green (2 themes + a11y smoke + rhythm check) on home **and** folder page · CJK scan = 0 via `bash ~/.hermes/skills/doku-dev-verify/scripts/cjk-scan.sh ~/dch/doku` · visual review vs Digital Archivist (catalogue lists, hairline, no card grids/gradients)

## Controller rulings on round-1 findings (2026-09-24)

Round-1 verdict: **PASS** (0 high · 0 med · 2 low; all six gates green; ten invariants pass;
design review pass on every docs/03 Part B rule).

- **low `scripts/shot.ts:217-224` (shot page list has no `/d/<folder>`) → RULING: accepted as a
  documented post-phase follow-up, NOT fixed now.** `scripts/**` is gate territory this batch; a
  modified gate script would taint every future verifier's scope check (high finding risk) for a
  coverage gain S5 already closed by other means (`var/s5-folder-shots.ts` evidence + DoD curls on
  `/d/projects`, `/d/projects/doku`, `/d/projects/doku/design`). Adding the folder route to the shot
  page list belongs to a later phase where the gate is deliberately opened — record, don't touch.
- **low `folder-page.tsx:255` (no `?sort=` control on a doc-less folder `/d/projects`) → RULING:
  intended.** Same principle as home's F3 ruling: the control renders exactly with the list it
  sorts; a folder with zero direct docs has no list, so no dead chrome. `/d/projects/doku` (which
  has docs) SSRs all three sort hrefs — curl-proven in this verify. `?sort=` DoD = the pages that
  have lists (home flat list + FolderPage with docs), both demonstrated.

## Notes

- Spawn only after S2, S3, S4 all PASS.
- Build prerequisites first if needed: `bun run build:css` + `bun run build:editor` (or `scripts/dev.sh`).
- If playwright browsers are missing: install once (`bunx playwright install chromium`), re-run;
  if still blocked → BLOCKED report, gate never silently dropped.
- Findings route back to the owning slice (S2/S3/S4) — this slice edits no product code.
