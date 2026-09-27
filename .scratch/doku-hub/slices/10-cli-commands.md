# 10 — cli-commands

Status: done
Phase: M4
Files I may touch: `packages/cli/src/index.ts` · `packages/cli/test/` · **narrow**: the command list block in `AGENTS.md` (when these commands become real — plan M4 "sync AGENTS.md ในคอมมิตเดียวกับที่คำสั่งเป็นจริง (ticket 07)") · read-only consumption of S1's core move module
Plan item: plan.md §5 M4 — `doku new` `mkdir` `tree --json` `list --tag` `mv` (uses core from S1)
DoD check: against a temp vault (copy of examples or mktemp): `doku new projects/x/y --title "..."` creates the doc (+ parent folders as needed? — spec says `new` creates doc, `mkdir` creates folders: follow docs/05 §2 exactly); `doku mkdir a/b/c`; `doku tree --json` → parses as JSON and lists the new paths; `doku list --tag design --json` → JSON array; `doku mv old new` → file moved, `relations.moved_from` written, inbound links updated (verify a linked doc), dest exists → exit ≠ 0 with `already_exists` in `--json`; **every one of the five supports `--json`** and existing `render/check/serve/restore` behavior is unchanged; `bun test` + `check` + `typecheck` green. Quote outputs.

## Notes

- Spec: docs/05 §2 CLI — command syntax + "ทุกคำสั่งสำคัญมี `--json`" · write discipline (plan §4 #4):
  all writes go through the core helpers (S1's move module for `mv`; existing core write paths for
  `new`/`mkdir`) — never hand-roll fs writes; `safeJoin`, atomic write, revision-before-overwrite.
- `search`, `build`, `audit`, `mcp` are OTHER slices (M5 / 09 / 11) — do not implement them here.
- Also add the `mcp` subcommand stub dispatch for slice 11: `doku mcp` spawns the MCP package like
  `doku serve` spawns the server (decision 25 pattern — subprocess, stdio inherited). It may fail
  at runtime until slice 11 lands; your DoD does NOT cover it, but the subcommand + `--help` entry
  must exist so slice 11 only ships `packages/mcp/**`.
- AGENTS.md: update ONLY the command-list lines (`doku` 4 คำสั่ง → the real set after this slice)
  to satisfy ticket-07 drift rule; do not rewrite other sections.
- Forbidden: `packages/server/**` · `packages/core/src/**` (consume, don't edit) ·
  `packages/mcp/**` · `scripts/**` · `client.ts` · `pages.tsx` · `app.tsx`.

## Verdict (2026-09-24)

Round-1 (fresh verifier): **FINDINGS** — 1 med + 4 lows; ticket DoD itself ran green.
- med: dispatch/parse-layer errors bypassed the --json envelope (usage / unknown-command / generic
  errors -> empty stdout, plain stderr) while the file header promised JSON on error too
- lows: AGENTS command list (deferred to controller AT this slice's commit - since synced at
  AGENTS.md:27-28) - ticket DoD wording "JSON array" vs envelope (reconciled HERE: `list --tag
  design --json` returns {ok,tag,docs:[...]} mirroring REST GET /api/docs - envelope by design, no
  code change) - unreachable `if (tagFlag === true)` branch - new/mkdir beside existing x.md =
  decision-72 design (doku check warns folder_file_name_clash; mkdir at the clash path itself
  refuses with already_exists)

Fix round (fresh fixer): dispatch layer emits JSON on stdout when --json is present (usage -> code
usage exit 2 - unknown -> unknown_command exit 2 - generic -> the error's own code exit 1), stderr
suppressed in json mode, non--json byte-identical; dead branch removed. Controller alignment: the
fixer emitted the NESTED shape while command-level emitFailure is flat -> controller aligned
emitJsonError to flat {ok,code,error} + updated the 5 new assertions (ONE --json error shape across
the whole CLI).

Round-2 (fresh verifier): **FINDINGS -> resolved by controller = accepted PASS.**
- med fix VERIFIED: 6-case runtime matrix x with/without --json (exact stdout/exit/stderr bytes
  quoted in transcript); grep: only two ok:false emitters remain (emitFailure + emitJsonError), both
  flat; controller edit verified (all 5 tests pass)
- all round-1 lows adjudicated (dead code confirmed gone; AGENTS/ticket/mkdir-clash acknowledged)
- ticket DoD executed for real on temp vault: new/mkdir/tree/list/mv with link rewrite + moved_from +
  revision + 409/404 + --json on success AND error + --help lists all 10 commands + existing
  render/check/restore/serve byte-unchanged (git hunks)
- gates 6 exit 0: 426 tests - check rc0 (2 pre-existing infos) - tsc x5 rc0 - build:css/build:editor
  + shot --port 7702 rc0 (a11y ผ่านทุกข้อ) - doku check 0/0 - CJK 0 - plan section 4 all ten PASS -
  no scope creep
- **low (round-2): stale JSDoc above emitJsonError still documented the REMOVED nested envelope
  (cli/src/index.ts:112-116) -> controller deleted the stale block** (comment-only, zero behavior
  change; no round-3 needed - the verified runtime matrix stands)

Observations logged (PRE-EXISTING, not S4, candidate follow-ups - not findings): restore's
no-revision error paths stay non-JSON even with --json (identical at HEAD) - `doku check --json`
failing report has no top-level code field (report envelope by design) - single-dash -h never parsed
though usage lists it (identical at HEAD) - links.ts RELATIVE_LINK misses card-directive href="..."
(core/S1 scope, parity with the REST move - decision 41 covers wikilink basename only).
