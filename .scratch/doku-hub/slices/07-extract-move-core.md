# 07 — extract-move-core

Status: open
Phase: M4
Files I may touch: `packages/core/src/` (new pure module, e.g. `move.ts`) + `packages/core/test/` (new test) + `packages/server/src/api.ts` (move handlers shrink to call core) + `packages/server/test/` (adjustments)
Plan item: plan.md §5 M4 — "logic `move` + auto-update links ตอนนี้อยู่ใน `api.ts` (server) → ต้องสกัดลง `core` ในรูปแบบ pure รับ fs adapter ก่อน CLI ใช้ได้ · มี test คู่ก่อน refactor"
DoD check: `bun test` + `bun run check` + `bun run typecheck` green; new core move tests pass **without importing server**; `api.ts` no longer contains the link-scan/update logic (imports it from core instead — grep evidence); behavior parity via curl on a temp vault: `POST /api/docs/<p>/move` still updates inbound links + writes `relations.moved_from` + `409 already_exists` on duplicate dest + `404` on missing source (quote outputs).

## Notes

- **Test pair BEFORE refactor** (plan §4/rules): write characterization tests for the current move
  behavior first (link forms: `[[path/x]]` · `/d/<path>` · relative `[x](./a.md)` · basename-wikilink
  ambiguity untouched → `doku check` warns), then extract.
- **core must stay isomorphic** (plan §4 #2): pure functions receiving a `VaultFs` adapter — no
  `node:fs`, no HTTP, no Hono imports. Dependency direction cli/server → core only (AGENTS.md).
- Keep every guard in `api.ts`: ETag/`If-Match` semantics, rate limit, revisions-before-write,
  `safeJoin`, trash rules stay server-side unless they are already core primitives.
- This module is the shared engine for slice 10 (`doku mv`) and slice 11 (`doc_move` MCP tool) —
  API shape must be callable with only core + fs-node.
- Forbidden: `packages/cli/**` · `packages/mcp/**` · `scripts/**` · `client.ts` · `pages.tsx` ·
  `folder-page.tsx` · `core/check.ts`.

## Verdict (2026-09-24)

Verifier: **PASS** (0 findings) — scope byte-identical to step-1 snapshot; all ten plan §4 invariants
accounted; DoD run for real (temp vault, DOKU_PORT=7685): move -> 200 `updated_links:1`, all 3 link
forms rewritten in the linked doc, `relations.moved_from` written -> dup dest = 409 `already_exists`,
missing source = 404 `not_found`; core move tests import no server code; grep
`rewriteMarkdownLinks|planMove|MovePlan|appendMovedFrom` in api.ts = 0 matches; gates 5 green + CJK 0
(quoted in verifier transcript). Controller notes accepted (non-blocking): readonly vault now answers
503 on move instead of a silent 200 no-op (improvement); `updated_links` counts files (HEAD semantics).
Commit split: move.ts + move.test.ts committed as `refactor(core): extract move...`; the api.ts/index.ts
wiring hunks ride the M4 server commit (interleaved with S2 in the same files).
