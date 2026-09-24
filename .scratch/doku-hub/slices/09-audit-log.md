# 09 — audit-log

Status: open
Phase: M4
Files I may touch: new `packages/server/src/audit.ts` (+ minimal hook lines inside `packages/server/src/api.ts` write handlers) · `packages/cli/src/index.ts` (the `doku audit` command ONLY) · tests under `packages/server/test/` and `packages/cli/test/`
Plan item: plan.md §5 M4 — audit log `var/audit.log` JSONL + `doku audit [--path] [--json]` (docs/06)
DoD check: start a server (`DOKU_PORT=7682`) on a temp vault, perform ≥3 writes (create doc, update doc, move) → `var/audit.log` gains one JSONL line per write with fields `ts, actor, action, path` (+ `etag`/`ip` where available) matching docs/06's shape; `bun run packages/cli/src/index.ts audit --json --path <p>` prints only that path's entries, exit 0; **no route or CLI subcommand can truncate/purge the log**; `bun test` + `check` + `typecheck` green. Quote outputs.

## Notes

- Spec: docs/06 "Audit log" (JSONL line shape) + docs/05 "Identity" (what `actor` can be known as
  on LAN — no auth; use the honest value for web vs agent-originated calls, do not invent tokens).
- Append-only writer: one line per write op, flush-safe (append + newline), never throws into the
  request path (log failure must not fail a write — best-effort with stderr note).
- Actions to cover: doc create/update/delete(soft)/move/restore + folder create/move/delete +
  asset upload/delete. Server owns writing; CLI only reads (`doku audit`, `--json` contract like
  every other command, `--path` filter, optional `--limit`).
- Path convention: same `var/` root the server already uses for `var/revisions` (follow how that
  resolves in dev/serve) so writer and reader see the same file.
- Forbidden: `pages.tsx` · `client.ts` · `app.tsx` · `scripts/**` · `packages/mcp/**` ·
  `core/check.ts` · any api.ts hunk that is not the audit hook call sites · **the rest of
  `packages/cli/src/index.ts` (slice 10 owns it — coordinate by touching only the `audit`
  subcommand block, and remember slice 10 may be editing the same file in the same batch: keep
  your hunks small and self-contained)**.
