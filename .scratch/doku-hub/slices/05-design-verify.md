# S5 — design-verify

Status: open
Phase: M3.5
Files I may touch: none (screenshots to `var/shots/`, report only) — code fixes go back to the owning slice
Plan item: plan.md §5 → 3.5.6 (design pass + verify)
DoD check: `bun run shot` green (2 themes + a11y smoke + rhythm check) on home **and** folder page · CJK scan = 0 via `bash ~/.hermes/skills/doku-dev-verify/scripts/cjk-scan.sh ~/dch/doku` · visual review vs Digital Archivist (catalogue lists, hairline, no card grids/gradients)

## Notes

- Spawn only after S2, S3, S4 all PASS.
- Build prerequisites first if needed: `bun run build:css` + `bun run build:editor` (or `scripts/dev.sh`).
- If playwright browsers are missing: install once (`bunx playwright install chromium`), re-run;
  if still blocked → BLOCKED report, gate never silently dropped.
- Findings route back to the owning slice (S2/S3/S4) — this slice edits no product code.
