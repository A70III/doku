# Answer Digest — doku dev-team skill suite

Status: approved
Date: 2026-09-24
Approved: 2026-09-24
Target agent/harness: Hermes (main session = controller, children via delegate_task)
Deliverable: new skill package (2 skills + references)

## 1. Objective

Turn the approved effort plan (`~/dch/doku/.scratch/doku-hub/plan.md` v1.1, phases M3.5 → M4 → M5)
into executed-and-verified work by orchestrating sub-agents as a simulated dev team: the controller
decomposes a phase into non-overlapping slices, spawns implementers, routes each result to an
independent verifier, and closes a phase only when all four completion layers pass.
Strictly one effort: the doku repo at `~/dch/doku`, branch `feat/hub-browse`.

## 2. Success criteria

- Controller takes a phase name and produces slice tickets whose file-ownership sets are disjoint
  (or explicitly sequenced), spawns implementers, and never closes a phase with any layer red.
- Verifier returns findings as `file:line + violated rule + severity` (or a clean pass) and **never edits code**.
- Both skills pass `scripts/validate-skill.sh`, a description-only trigger test, and a dry walkthrough
  against a real M3.5 slice (e.g. "palette ค้น tags").
- Crash-safe: after an interrupted session, the controller resumes from `slices/` `Status:` lines
  without redoing resolved slices.

## 3. Triggers and anti-triggers

**Must fire when:**
- The user asks to start/continue doku development from the plan (e.g. "เริ่ม M3.5", "ทำตามแผน doku",
  "ต่อ hub-browse", "แตกงานให้ sub-agent ทำ").
- The agent is about to implement a work item that lives in `plan.md` §5 inside `~/dch/doku`.

**Must NOT fire when:**
- Any repo other than `~/dch/doku` — even if the task looks identical (SiteBox and everything else).
- Work outside `plan.md` scope or inside `map.md` → Out of scope (migration, publish/auth, prefix grouping, …).
- A one-off question, bug triage, or prose/doc writing that is not a slice of a phase.
- Refining these skills themselves (that is `yumia-skill-writer` territory).

## 4. Invocation and package shape

- Invocation: **model-invoked** (both skills) — the controller must arrive unaided when doku dev work
  comes up; the verifier is reached when the controller names it in a child's goal, which requires a
  registry-visible description. `disable-model-invocation` omitted.
- Shape: **split by invocation** — `doku-dev-team` (controller: decompose → assign → verify loop →
  phase close) + `doku-dev-verify` (verifier primitive: read-only review a child runs when told
  "Call the skill `doku-dev-verify`"). Phase playbook lives as `references/phases.md` owned by the
  controller — phases differ in content, not invocation, so they are not separate skills.
- Dependencies: controller names `project-orientation` (orientation layer = `AGENTS.md`) and
  `doku-dev-verify` (per spawn). One skill per call.
- Preconditions: `~/dch/doku/.scratch/doku-hub/plan.md` exists and its tickets are resolved ·
  branch `feat/hub-browse` exists · `bun` on PATH (`~/.local/bin/bun`) and `bun install` done.
  Remediation if missing: stop and ask the user — never reconstruct the plan from memory.

## 5. Inputs

| Input | Shape | Source | Notes |
|---|---|---|---|
| Phase to run | name: `M3.5` / `M4` / `M5` | user | default = first phase not yet closed |
| Work items | §5 tables + DoD | `plan.md` | decision of record for scope |
| Invariants | §4 list of 10 | `plan.md` | verifier checks these verbatim |
| Orientation | invariants/hotspots/gates | `AGENTS.md` (## Profile) | read first every session |
| Decisions | 7 resolved tickets | `map.md` → Decisions so far | never re-decide |
| Diff + status | `git diff`, gates output | repo / terminal | verifier evidence |
| Child reports | summary + files touched | delegate_task results | self-reported, must be verified |

## 6. Outputs

| Output | Format | Destination | Example |
|---|---|---|---|
| Slice tickets | `NN-slug.md` + `Status: open/claimed/done` | `.scratch/doku-hub/slices/` | `01-home-sections.md` |
| Spawn goals | goal text (scope, files, invariants pointer, DoD, no-commit) | delegate_task | child context |
| Findings report | `file:line + rule + severity` or PASS | child → controller | `pages.tsx:701 — inv-9 — high` |
| Phase-close report | 4 layers + quoted gate output + updated checkboxes | controller → user | chat + `plan.md` |
| Resume state | `Status:` lines | `slices/` on disk | survives crash |

## 7. Pipeline (ordered)

**Controller (`doku-dev-team`):**
1. Orient → read `AGENTS.md` + `plan.md` §4/§5/§8 + `map.md` → done when: you can restate the phase DoD and the 10 invariants without opening a file.
2. Decompose → every §5 work item maps to **exactly one** slice ticket with an explicit "files I may touch" list → done when: no work item is uncovered and no file appears in two slices scheduled together.
3. Schedule → group slices into batches: parallel only inside a batch whose file sets are disjoint; anything touching `pages.tsx`/`client.ts` (hotspots) is its own sequential slice → done when: each batch passes the disjointness check by inspection.
4. Spawn implementer(s) → goal = task + files owned + pointer to invariants (`plan.md` §4) + phase DoD + "report files touched; do NOT run git commit" → done when: child returns a summary naming every file it changed.
5. Cross-verify → spawn a **different** child with: "Call the skill `doku-dev-verify`" + the slice ticket → done when: findings (or PASS) come back with file:line evidence.
6. Fix loop → route findings to a fresh implementer (never the verifier) → done when: verifier returns PASS. **After 2 failed rounds on the same slice: stop and escalate to the user with both rounds of findings.**
7. Deterministic gates → controller runs: `bun test`, `bun run check`, `bun run typecheck`, `bun run shot`, `bun run doku check --vault examples/vault`, plus CJK scan (regex `[\u4e00-\u9fff]`) = 0 → done when: all green, output quoted into the report.
8. Phase close → run the phase DoD **for real** (start server / `doku render` / curl — never judge from diff alone), mark slices `done`, tick `plan.md` §5 checkboxes, perform docs sync per `plan.md` §8 → done when: report sent to user and next phase named as unlocked.

**Verifier (`doku-dev-verify`):**
1. Scope the diff → confirm every changed file was in the slice's ownership list → else finding `scope-creep`.
2. Check the 10 invariants (`plan.md` §4) against the diff → each pass/fail with file:line.
3. Check design conformance (Digital Archivist, `docs/03` Part B: no card grids, no gradient decoration, hairline+typography) for any UI change.
4. Run the gates + CJK scan yourself (don't trust the implementer's claim).
5. Attempt the DoD action for real where runnable.
6. Report → `PASS` or findings list (`file:line + rule + severity`), then stop. **Never edit files, never fix findings.**

## 8. Decision rules

| Condition | Action | Tie-breaker / default |
|---|---|---|
| Two wanted slices touch the same file | merge into one slice OR sequence them | hotspot file (`pages.tsx`, `client.ts`, `api.ts`) owner goes first |
| Verifier finds an invariant violation | block the slice; route to a new implementer | severity high = phase cannot close |
| Implementer touched files outside ownership | finding `scope-creep`; re-spawn tighter | default: reject the work, don't patch it in |
| Code conflicts with `plan.md`/`docs/08` | plan/decision of record wins; stop and report | never silently pick the code's way |
| A genuinely new decision appears mid-work | put it to the user (grilling-style question) | agent never decides architecture alone |
| Gates red after 2 fix rounds | escalate to user with both rounds of findings | stop; no third blind round |
| Session interrupted | resume from `slices/` `Status:` lines | never redo a `done` slice; never re-run Phase 1 of yumia |
| Work request outside `plan.md` | do not start; say it's out of scope | map.md → Out of scope is the list |
| `bun run shot` blocked (playwright browsers missing) | install browsers once; if still blocked, escalate | never silently drop a gate |

## 9. Constraints

- Environment: Linux; bun at `~/.local/bin/bun` (may need `export PATH`); repo `~/dch/doku`; branch `feat/hub-browse`.
- Verification set is fixed: 5 gates + CJK scan + 10 invariants + phase DoD (4 layers — Q7).
- Policies (must never happen): sub-agent commits (`git commit` is controller/user only, English
  Conventional Commits); verifier edits files; agent makes architecture decisions alone; CJK
  characters in shipped files; work on other repos under this suite.

## 10. Failure handling

| Failure | Symptom | Response |
|---|---|---|
| Child times out / interrupted | partial summary, some files changed | treat slice as `claimed` not `done`; re-verify before resuming |
| Verifier spawn fails | no cross-verify result | retry once; second failure → escalate (never self-verify as final) |
| Ownership overlap discovered late | two children changed same file | stop batch; diff both; sequence remaining work |
| `plan.md` / tickets missing | precondition unmet | stop and ask; never reconstruct from memory |
| Gates environment broken (no bun/PATH) | command not found | remediate once (install/export); then escalate |

## 11. Quality bar

- Good output: every slice has an explicit file list; every finding has file:line + rule + severity;
  phase-close quotes real gate output and a real DoD run; reports to the user in Thai.
- Reject when: "done" is claimed from a diff without gate output; a verdict lacks file:line;
  scope drifted beyond ownership; any of the 4 layers unverified.

## 12. Assumptions (unconfirmed)

- ASSUMPTION: children can `skill_view` registry skills (so `doku-dev-verify` loads) and read repo files directly.
- ASSUMPTION: children never run git commits; commits happen at phase close (controller, after user's go).
- ASSUMPTION: `bun run shot` is runnable in this environment (playwright browsers installable once).
- ASSUMPTION: "Q1 mode invoked" means **model-invoked** (typo of "model").
- ASSUMPTION: phases run strictly sequentially M3.5 → M4 → M5; parallelism only within a phase.
- ASSUMPTION: skill bodies + references in English; user-facing reports in Thai (feminine particles).

## 13. Open questions

- OPEN: none — remaining unknowns are recorded as assumptions above.

## 14. Rejected framings

- One mega-skill holding all roles — implementer and verifier roles would share context, defeating cross-verify.
- One skill per phase (doku-m35/m4/m5) — same invocation, triples maintenance; phases are content, not entry points.
- Controller as its own verifier — no second pair of eyes; child self-reports are untrusted by design.
- Worktree/branch per slice — single effort, no concurrent-branch conflict to solve.
- Single STATUS.md or chat-only progress — rejected in Q6 in favor of resumable slice tickets.
- Gates-only completion — rejected in Q7; diff/invariant/design review needs a human-equivalent second reader.

## 15. Out of scope

- Everything in `map.md` → Out of scope (content migration, publish/auth, prefix grouping, DH-STANDARD meta, …).
- Any repository other than `~/dch/doku`.
- Changing decisions already recorded in the 7 resolved tickets / `docs/08`.
- Maintaining or refining this skill suite after the effort ends (re-enter `yumia-skill-writer` then).
