# Sequence — doku dev effort (master checklist)

Controller: `doku-dev-team` · verifier: `doku-dev-verify` · source of truth: `plan.md` §5
Run order: **M3.5 → M4 → M5** · branch `feat/hub-browse` · user pre-authorized the full run — no
mid-run questions; record decisions in `docs/08` at phase close (plan §8 docs sync).

**How to use:** check a box the moment its sequence closes, with a one-line evidence note under it.
A phase closes only through the 4 layers (gates green · CJK 0 · all verifiers PASS · DoD run for real).

---

## Phase M3.5 — Hub browse (plan §5, items 3.5.1–3.5.6)

- [ ] **S1 listing-foundation** — `bytes` in DocSummary + `web/listing.ts` (date-group/sort helpers) + tests → `slices/01-listing-foundation.md`
- [ ] **S2 home-sections** — `pages.tsx`: folder sections on home (3.5.1) → `slices/02-home-sections.md` _(after S1)_
- [ ] **S3 folder-page** — `app.tsx` branch + `web/folder-page.tsx` + duplicate-name check in `core/check.ts` (3.5.2) → `slices/03-folder-page.md` _(after S1 · parallel S2)_
- [ ] **S4 palette-tags** — `client.ts`: palette matches tags (3.5.5) → `slices/04-palette-tags.md` _(parallel)_
- [ ] **S5 design-verify** — `bun run shot` 2 themes + a11y + rhythm + CJK = 0 (3.5.6) → `slices/05-design-verify.md` _(after S2–S4)_
- [ ] **Phase M3.5 close** — 4 layers + DoD: 3-level folder browsable from home & folder page · date groups + `?sort=` both pages · Ctrl+K finds a tag · docs sync (plan §8) + commit

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
