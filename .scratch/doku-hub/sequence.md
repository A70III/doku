# Sequence — doku dev effort (master checklist)

Controller: `doku-dev-team` · verifier: `doku-dev-verify` · source of truth: `plan.md` §5
Run order: **M3.5 → M4 → M5** · branch `feat/hub-browse` · user pre-authorized the full run — no
mid-run questions; record decisions in `docs/08` at phase close (plan §8 docs sync).

**How to use:** check a box the moment its sequence closes, with a one-line evidence note under it.
A phase closes only through the 4 layers (gates green · CJK 0 · all verifiers PASS · DoD run for real).

---

## Phase M3.5 — Hub browse (plan §5, items 3.5.1–3.5.6)

- [x] **S1 listing-foundation** — `bytes` in DocSummary + `web/listing.ts` (date-group/sort helpers) + tests → `slices/01-listing-foundation.md`
  ✓ 2026-09-24 — verifier: slice DoD/ownership/invariants all pass (334 tests green); high finding = pre-existing shot red → routed to S6
- [x] **S2 home-sections** — `pages.tsx`: folder sections on home (3.5.1) → `slices/02-home-sections.md` _(after S1)_
  ✓ 2026-09-24 — verifier round-2 **PASS** (0 findings; 10/10 invariants; DoD curl: home sections + date group + `?sort=name/size/bogus`) · F1 raw-query fix applied · F2/F3 controller rulings recorded in ticket
- [x] **S3 folder-page** — `app.tsx` branch + `web/folder-page.tsx` + duplicate-name check in `core/check.ts` (3.5.2) → `slices/03-folder-page.md` _(after S1 · parallel S2)_
  ✓ 2026-09-24 — verifier **PASS** (0 high/med; DoD: `/d/projects` 200 was 404 · doc-wins `/d/x` · `folder_file_name_clash` on temp vault, exit 0 · `.trash`/dotfolder skipped · 3 lows ruled/deferred in ticket)
- [x] **S4 palette-tags** — `client.ts`: palette matches tags (3.5.5) → `slices/04-palette-tags.md` _(parallel)_
  ✓ 2026-09-24 — verifier: 2 hunks exactly (client.ts:1700 tags join, :1709 filter), guards ok, UX unchanged; only finding = pre-existing shot red → S6
- [x] **S6 a11y-overflow** — fix the 5 pre-existing `bun run shot` a11y issues (blocks M3.5 close) → `slices/06-a11y-overflow.md` _(added at batch-1 cross-verify; proven pre-existing at HEAD via two clean-control runs)_
  ✓ 2026-09-24 — verifier round-3 **PASS** · root cause = missing built `public/app.css` because `build:css` used absent `bunx` (exit 127), NOT a CSS bug (control: rm app.css → exact 5 issues ×2 independent runs) · fix = `bun x` in `package.json` + `scripts/dev.sh` (env symlink removed, repo self-sufficient) · `bun run shot` exit 0, 5 issues gone · `packages/core/src/styles/**` untouched (containment would clip the margin-note gutter hang)
- [x] **S5 design-verify** — `bun run shot` 2 themes + a11y + rhythm + CJK = 0 (3.5.6) → `slices/05-design-verify.md` _(after S2–S4 + S6)_
  ✓ 2026-09-24 — verifier **PASS** (6 gates quoted green; design review pass on every docs/03 Part B rule incl. no-gradients/token-colors/Thai-first; folder-page shots `var/shots/s5/` since shot.ts page list lacks `/d/<folder>` — that gap ruled a post-phase follow-up)
- [x] **Phase M3.5 close** — 4 layers + DoD: 3-level folder browsable from home & folder page · date groups + `?sort=` both pages · Ctrl+K finds a tag · docs sync (plan §8) + commit
  ✓ 2026-09-24 — **4 layers**: (1) gates 5 green in one run (`356 pass/0 fail` · check `Found 2 infos` rc0 · tsc rc0 · shot rc0 `a11y: ผ่านทุกข้อ` · `doku check` 0/0) (2) CJK 0 (3) 6/6 verifier PASS (S1 S4 batch1 · S3 · S2 r2 · S6 r3 · S5) (4) DoD executed real: **15/15** via `var/m35-dod.ts` (browse chain `/`→`/d/projects`→`/d/projects/doku`→`/d/projects/doku/design` all 200 · date groups · `?sort=` both pages incl. bogus→mtime · **Ctrl+K `demo` → Doku Design → Enter opens doc**) · docs sync: plan §5 status + tickets 01–06 `done` + docs/07 M3.5 section + docs/08 ข้อ 72–73 + AGENTS status · commits: feat/fix/docs on `feat/hub-browse`

## Phase M4 — AI access (plan §5 M4)

- [ ] **S1 extract-move-core** — `api.ts` move fns → `core` (pure) + test pair before refactor _(gate for S2/S4)_
- [ ] **S2 rest-assets-context** — assets upload/delete + `GET /context/*path` + enforce docs/06 charset (closes docs/08 Q7) _(after S1)_
- [ ] **S3 audit-log** — `var/audit.log` JSONL + `doku audit [--json]` _(after S2)_
- [ ] **S4 cli-commands** — `new` `mkdir` `tree --json` `list --tag` `mv` (uses core from S1) _(after S1 · parallel S2)_
- [ ] **S5 mcp-package** — `packages/mcp` stdio + tools per docs/05 §4 minus `doc_search` + `doku mcp` spawn _(parallel)_
- [ ] **Phase M4 close** — 4 layers + DoD: create/edit/move/folders via MCP, soft-delete only · `doku audit` reads history · AGENTS.md CLI list matches reality · docs sync + commit

## Phase M5 — Index, search, deploy (plan §5 M5)

- [ ] **S1 drizzle-index** — Drizzle + `bun:sqlite` FTS5 + incremental index by file hash
- [ ] **S2 search-api** — `GET /api/search` + palette full-text _(after S1 + any api.ts slice)_
- [ ] **S3 search-facets** — MCP `doc_search` + CLI `search` / `list --tag` _(after S1)_
- [ ] **S4 backlinks** — core link table + backlinks render _(after S1)_
- [ ] **S5 build-docker-backup** — `doku build --out` + Dockerfile/compose skeleton + backup script _(after S3)_
- [ ] **Phase M5 close** — 4 layers + DoD: FTS returns hits · backlinks render · `doku build` opens offline · docker skeleton + backup exist · docs sync + commit

## Final

- [ ] **Full-suite final** — `bun test` + check + typecheck + shot + `doku check examples/vault` + CJK all green in one run
- [ ] **Final report to user** (Thai) — what shipped, evidence, decisions logged

---

## Log

(started 2026-09-24 · branch feat/hub-browse · baseline gates: 323 tests green, biome clean, tsc clean, doku check 0/0)

- batch 1 [S1, S4] → implementers green (334 tests) → cross-verify returned FINDINGS = pre-existing
  `shot` red (5 a11y overflow issues, proven at clean HEAD by both verifiers) → new slice S6 owns the fix.
  Controller ruling: S1/S4 slice work is done; the phase-level gate stays red until S6+S5 close it.
- lesson recorded: never run two `bun run shot` at once (port 7699 collision caused one flake) — S6 is
  the only shot runner in batch 2.
- batch 2 [S2, S3, S6] + S5 → all verifiers PASS (S2/S6 needed fix rounds; rulings recorded in
  tickets) → **Phase M3.5 closed 2026-09-24**: 4 layers green, DoD 15/15 (`var/m35-dod.ts`),
  docs sync (plan/07/08/AGENTS), commits feat+fix+docs on feat/hub-browse.
- lesson: phase gate was red at origin because a **gitignored build artifact** (`public/app.css`)
  was never built (`bunx` absent → exit 127) — build prerequisites before any `bun run shot`,
  and prefer `bun x` (bun builtin) over the `bunx` binary in scripts.
- follow-up recorded (not in this phase): `scripts/shot.ts` page list has no `/d/<folder>` route.
