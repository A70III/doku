# 11 — mcp-package

Status: open
Phase: M4
Files I may touch: new `packages/mcp/**` (package.json, src, test) · root `package.json` ONLY if a workspace/dep entry is genuinely required (workspaces glob `packages/*` already covers the new package — expect NO root change)
Plan item: plan.md §5 M4 — `packages/mcp` stdio + tools per docs/05 §4 minus `doc_search` · `doku mcp` spawn (the CLI hunk lives in slice 10 — you ship only the package)
DoD check: `bun test packages/mcp` green + `bun run typecheck` includes/passes the new package; then a REAL stdio session: `printf` (or a small `var/` script) driving JSON-RPC 2.0 over stdin/stdout of `bun run packages/mcp/src/index.ts` (and via `bun run packages/cli/src/index.ts mcp` once slice 10's dispatch exists): `initialize` → `tools/list` returns exactly the docs/05 §4 tool set minus `doc_search` → `tools/call` of `folder_create` + `doc_write` on a temp vault (DOKU_VAULT env) → file exists with expected content → `doc_delete` → soft-deleted under `vault/.trash/` (NEVER purged; no tool can purge). Quote the JSON-RPC transcripts.

## Notes

- Tools (docs/05 §4, minus `doc_search`): `doc_list` `doc_read` `doc_write` `doc_move` `doc_delete`
  `folder_create` `folder_list` `doc_render` `doc_validate` `asset_put` `template_get` — flat inputs,
  names exactly as in the table; principle "tool น้อย, ชื่อตรง, input แบน".
- Architecture (plan §4): `packages/mcp` depends ONLY on `@doku/core` + `@doku/fs-node` — no import
  from `cli`/`server` (decision 25: `doku mcp` spawns it as a subprocess).
- **Controller ruling — zero new runtime dependency:** implement the MCP stdio protocol as a small
  JSON-RPC 2.0 subset (initialize / tools/list / tools/call, newline-delimited over stdio) instead
  of adding `@modelcontextprotocol/sdk`. Rationale: docs/04 locks the stack, the repo avoids
  libraries it can carry itself, and the surface we need is three methods. Record any friction you
  hit as a note in your report rather than adding the SDK.
- Writes reuse core write paths (soft-delete only — invariant 7; no purge tool, plan §4 #7/#9-ish
  agent policy in docs/06: "ลบถาวร = คนเท่านั้น").
- `doc_render`/`doc_validate` wrap the existing core functions; `template_get` returns the block
  registry-derived template + schema (reuse `/api/schema`'s source in core, don't fork it).
- Server-less operation: the package reads/writes the vault directly through a `VaultFs` adapter
  built from `DOKU_VAULT` (default `vault/`), same convention as the CLI.
- Forbidden: `packages/server/**` · `packages/cli/**` (slice 10 owns `doku mcp` dispatch) ·
  `packages/core/src/**` (consume only) · `scripts/**` · root `package.json` unless truly required.

## Verdict (2026-09-24)

Verifier: **PASS with 2 lows** — ownership byte-identical; DoD real: 27/27 checks on BOTH entry points
(direct `bun run packages/mcp/src/index.ts` and `bun run packages/cli/src/index.ts mcp`):
initialize -> tools/list = exactly docs/05 section 4 minus `doc_search` (11 names quoted) ->
folder_create/doc_write/doc_read round-trip -> doc_delete = soft-only (file intact in .trash, revision
saved); purge-class tool names all -> -32602 unknown tool; static grep: mcp never calls empty()/purge();
shutdown -> exit 0, protocol-pure stdout. Gates green — note: default-port `bun run shot` raced a
sibling verifier (port 7699); isolated re-run `scripts/shot.ts --port 7693` = green (lesson: concurrent
verifiers must use distinct shot ports). CJK 0.

### Controller rulings on the 2 lows
- **low tools.ts:188 (hand-written JSON Schema for tool inputs) — accepted as-is.** Tool input schemas
  are the transcription of the docs/05 section 4 contract table (decision-of-record); no Zod tool-input
  schema exists anywhere to derive from, runtime meta is still validated by core `MetaSchema`, and
  keys/enums are locked by `test/server.test.ts`. Follow-up (non-blocking): if M5 grows tool inputs,
  define Zod schemas in core and emit via `z.toJSONSchema()` (plan section 4 #8 letter).
- **low tools.ts:159 (fence message/code duplicated from core) — deferred as follow-up.**
  `describeFenceProblem` (core/src/blocks/fences.ts) + `fenceWarningCode` (core/src/check.ts) are not
  exported from @doku/core and core was outside this slice's ownership; export them from core and
  consume in mcp in a later (M5-adjacent) slice.
