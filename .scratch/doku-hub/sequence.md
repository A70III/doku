# Sequence — doku dev effort (master checklist)

Controller: `doku-dev-team` · verifier: `doku-dev-verify` · source of truth: `plan.md` §5
Run order: **M3.5 → M4 → M5** · branch `feat/hub-browse` · user pre-authorized the full run — no
mid-run questions; record decisions in `docs/08` at phase close (plan §8 docs sync).

**How to use:** check a box the moment its sequence closes, with a one-line evidence note under it.
A phase closes only through the 4 layers (gates green · CJK 0 · all verifiers PASS · DoD run for real).

**Push rule (user 2026-09-24):** `feat/hub-browse` is published to `origin`
(github.com/A70III/doku) — **push after EVERY controller commit** from now on
(`git push`, branch already tracks origin), not just at phase close. M3.5's five commits
were pushed together as the first push.

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

- [x] **S1 extract-move-core** — `api.ts` move fns → `core` (pure) + test pair before refactor _(gate for S2/S4)_
  ✓ 2026-09-24 — verifier **PASS** (0 findings; DoD curl on :7685: move → 200 `updated_links:1` + all 3 link forms rewritten + `moved_from` · dup dest 409 · missing src 404; core tests import no server; link-scan grep in api.ts = 0; gates 6 green + CJK 0) · committed+pushed `9cd333a` (api.ts/core-index wiring rides the server commit — hunks interleave with S2 in the same files)
- [x] **S2 rest-assets-context** — assets upload/delete + `GET /context/*path` + enforce docs/06 charset (closes docs/08 Q7) _(after S1)_
  ✓ 2026-09-24 — verifier round-2 **PASS** (round-1: 3 med + 1 low → fresh fixer: pre-write target-path + NAME_MAX 255 validation & no-500 write guard · DELETE scoped to exact `assets` segment so sidecars are 404-safe · `?h=` = full sha256 → immutable per ข้อ 58 · observable mime-parity test locks the 11-ext allowlist vs serve) · DoD 44/44 on DOKU_PORT=7686 · gates quoted green (`426 pass` · check rc0 · tsc ×5 rc0 · shot --port 7701 rc0 a11y ผ่านทุกข้อ · doku check 0/0) · CJK 0 · Q7 closed as docs/08 ข้อ 74
- [x] **S3 audit-log** — `var/audit.log` JSONL + `doku audit [--json]` _(after S2)_
  ✓ 2026-09-24 — batch cross-verify **PASS** (round-2; round-1's 12 scope-creep highs = controller scoping error: one ticket checked against a tree carrying sibling M5 slices — corrected via batch attribution to tickets 12–16) · DoD real: server :7682, writes → exactly 1 line/write with ts/actor/action/path + honest etag/ip, `audit --json --path` exit 0 = only that path, no-purge proven 3 ways (sha identical after hostile flags · unknown_command exit 2 · module has zero delete calls) · gates 5 + CJK 0 · 2 lows ruled follow-up (revision-restore/trash-empty = outside ticket's enumerated hook list) · commit `36558db`
- [x] **S4 cli-commands** — `new` `mkdir` `tree --json` `list --tag` `mv` (uses core from S1) _(after S1 · parallel S2)_
  ✓ 2026-09-24 — verifier round-2 FINDINGS→**resolved** (1 low = stale JSDoc above `emitJsonError` deleted by controller, comment-only; med fix + ONE flat `--json` error shape across dispatch/command layers verified via 6-case runtime matrix; all round-1 lows adjudicated) · DoD real on temp vault (mv link rewrite + `moved_from` + revision + 409/404 + `--json` success AND error + existing commands byte-unchanged) · gates 6 green (`426 pass` · build+shot --port 7702 a11y ผ่านทุกข้อ · `doku check` 0/0) + CJK 0 · AGENTS CLI list synced (ticket 07) · 4 pre-existing observations logged as follow-ups in ticket 10
- [x] **S5 mcp-package** — `packages/mcp` stdio + tools per docs/05 §4 minus `doc_search` + `doku mcp` spawn _(parallel)_
  ✓ 2026-09-24 — verifier **PASS with 2 lows**, both controller-ruled in ticket 11 (hand-written tool JSON Schema accepted as the docs/05 §4 contract transcription + Zod-derived follow-up noted · fence-message dup deferred to a future core-export follow-up) · DoD real: 27/27 checks × both entry points (initialize → tools/list = exactly docs/05 §4 minus `doc_search` → folder_create/doc_write/doc_read round-trip · doc_delete soft-only + revision saved · all purge-class tool names → -32602 · shutdown exit 0) · gates green on isolated shot `--port 7693` (lesson: concurrent verifiers use distinct shot ports) + CJK 0 · `doku mcp` dispatch hunk belongs to slice 10
- [x] **Phase M4 close** — 4 layers + DoD: create/edit/move/folders via MCP, soft-delete only · `doku audit` reads history · AGENTS.md CLI list matches reality · docs sync + commit
  ✓ 2026-09-24 — **4 layers**: (1) gates in one controller run (`458 pass / 0 fail` · check rc0 · tsc ×5 rc0 · shot --port 7714 rc0 `a11y: ผ่านทุกข้อ` · `doku check` 0/0) (2) CJK `clean (0 hits)` rc0 (3) verifier 6/6 PASS (09/13/14/15 batch round-2 · 12/16 round-2 after one fix round) (4) DoD run real: MCP stdio session = 12 tools, create/edit/move/folder + soft-delete-to-`.trash/` only, shutdown exit 0 · `doku audit` reads REST-written history (1 write = 1 line) · docs/AGENTS/plan synced in this close commit (docs/05 +docs/07 M4 + docs/08 ข้อ 75 + AGENTS CLI/status) · commits `b091d2e` `fd6fb64` `36558db` `02f468d` `15b47f2` `7589f0d` + docs close

## Phase M5 — Index, search, deploy (plan §5 M5)

- [x] **S1 drizzle-index** — Drizzle + `bun:sqlite` FTS5 + incremental index ตาม file hash
  ✓ 2026-09-24 — round-2 **PASS** after 1-fix-round (low: hash comment said NUL, code = space separator → comment aligned to code) · trigram Thai substring + LIKE <3-char fallback + hash-skip incremental + user_version rebuild all tested (7 tests) · commit `fd6fb64`
- [x] **S2 search-api** — `GET /api/search` + palette full-text _(after S1 + any api.ts slice)_
  ✓ 2026-09-24 — batch cross-verify **PASS** · live DoD: `GET /api/search` EN+mid-sentence Thai hit with snippet · palette debounce/seq/merge in served client.js · watcher-triggered new doc searchable ~1.5s · 4 tests · commit `02f468d`
- [x] **S3 search-facets** — MCP `doc_search` + CLI `search` / `list --tag` _(after S1)_
  ✓ 2026-09-24 — batch cross-verify **PASS** · `tools/list` = exact 12-row docs/05 §4 table (stdio DoD includes doc_search hit + miss) · `doku search` envelope/AND/Thai/tag/limit/usage tested (3 tests) · `list --tag` unchanged from ticket 10 · commit `15b47f2`
- [x] **S4 backlinks** — core link table + backlinks render _(after S1)_
  ✓ 2026-09-24 — batch cross-verify **PASS** + design PASS (hairline/token-only/Thai-first `เชื่อมโยงมาจาก`) · links stored raw (wiki/doc/dpath) + resolve-at-query (ambiguous = first, self-link excluded) · live `/d/<doc>` section shown / absent when unlinked · commit `02f468d`
- [x] **S5 build-docker-backup** — `doku build --out` + Dockerfile/compose skeleton + backup script _(after S3)_
  ✓ 2026-09-24 — round-2 **PASS** after 1-fix-round (low: Dockerfile CMD now builds editor.js in-image since public/ is ignored) · live: export = 0 root-absolute URLs (offline-openable), backup init→skip→commit→exit 2, no delete-in---out locked by tests · commit `7589f0d`
- [x] **Phase M5 close** — 4 layers + DoD: FTS returns hits · backlinks render · `doku build` opens offline · docker skeleton + backup exist · docs sync + commit
  ✓ 2026-09-24 — **4 layers**: (1) gates one run: `458 pass / 0 fail` · check rc0 (2 pre-existing infos in zen-exit-writing) · tsc ×5 rc0 · shot --port 7714 rc0 `a11y: ผ่านทุกข้อ` · `doku check` 0/0 (2) CJK 0 rc0 (3) S1–S5 all verifier PASS (S1/S5 after one fix round; zero red rounds beyond that) (4) DoD real: FTS EN+Thai substring + watcher-trigger · backlinks section live · `doku build` export 0 root-absolute URLs · docker skeleton exists (build intentionally skipped per docs/08 ข้อ 3) · backup 4/4 · docs sync (docs/07 M5 + docs/08 ข้อ 75–80 + plan §5) in this close commit · commits `fd6fb64` `02f468d` `15b47f2` `7589f0d` + docs close

## Final

- [x] **Full-suite final** — `bun test` + check + typecheck + shot + `doku check examples/vault` + CJK all green in one run
  ✓ 2026-09-24 — one controller run, all quoted: `458 pass / 0 fail (35 files)` rc0 · `Checked 140 files … Found 2 infos` rc0 · tsc ×5 rc0 · `shot --port 7714` rc0 `ถ่าย 2 ธีม × 6 หน้า` + `a11y: ผ่านทุกข้อ` · `doku check: 3 docs · 3 assets · 23 blocks · 0 errors · 0 warnings` rc0 · `CJK scan: clean (0 hits)` rc0
- [x] **Final report to user** (Thai) — what shipped, evidence, decisions logged
  ✓ 2026-09-24 — รายงานไทยส่งในแชททันทีหลังปิด checklist ใบนี้: สิ่งที่ ship (S3 + M5 S1–S5) · evidence (verdicts 6/6 · gates · DoD) · decisions docs/08 ข้อ 75–80 + follow-ups (audit coverage, หน้า /search)

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
- M4-S3 + M5 batch [09, 12–16] → work carried in-session → cross-verify round-1 for ticket 09 alone returned
  12 scope-creep highs (controller error: one ticket checked against a tree carrying sibling slices) →
  re-scoped via full ticket set + batch verify round-2 = **6/6 PASS on 09/13/14/15** → 2 low fix round
  (hash comment · Dockerfile CMD editor build) → round-2 **PASS on 12/16** → **M4 + M5 closed 2026-09-24**.
- lesson: a cross-verify child must receive the FULL sibling ticket set — scoping one ticket against a
  multi-slice tree manufactures false scope-creep (12 highs, all mis-attribution, zero real ownership breaks).
- decisions logged: docs/08 ข้อ 75 (trigram FTS + <3-char LIKE fallback) · 76 (engine in fs-node) ·
  77 (user_version migration, no drizzle-kit) · 78 (links raw + resolve at query) · 79 (palette = "หน้า search") ·
  80 (build never deletes --out · docker skeleton · auto-git backup). Follow-ups: audit hooks for
  revision-restore/trash-empty + MCP/CLI direct-fs writes · standalone /search page · shot.ts `/d/<folder>`.
