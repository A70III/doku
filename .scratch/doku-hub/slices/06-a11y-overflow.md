# S6 — a11y-overflow (pre-existing shot red)

Status: done
Phase: M3.5 (added at batch-1 cross-verify)
Files I may touch: `packages/core/src/styles/**` (+ a regression test under `packages/core/`)
Plan item: plan.md §5 → 3.5.6 + §4 invariant 10 (5 gates green) — **blocker for M3.5 close**
DoD check: `bun run shot` exits 0 with all 5 issues gone · `bun test` + `bun run check` + `bun run typecheck` green · CJK scan 0

## The 5 issues (identical in two independent clean-control runs at HEAD fa4f1dc — pre-existing)

- `styleguide`: horizontal overflow 1480px > 1440px viewport
- `styleguide`: horizontal overflow at 200% zoom
- `/d/projects/doku/design`: horizontal overflow 1480px > 1440px viewport
- `/d/projects/doku/design`: horizontal overflow at 200% zoom
- `styleguide` at 360px: horizontal overflow 916px > 360px

## Controller record — round-1 verify + fixes (2026-09-24)

Round-1 verifier verdict: **FINDINGS** (1 med · 3 low; all ten plan §4 invariants PASS; five gates
green; design check n/a — zero tracked diff). Causality independently reproduced by that verifier:
removing only `public/app.css` → exactly the ticket's 5 issues, exit 1; restoring → exit 0; plus the
`bunx: command not found` / exit-127 simulation. Step 4 independently agreed **no sound content-CSS
fix exists** (containment would clip the designed gutter hang · specimen `<pre>` sits outside
`.doku-prose` so content CSS cannot reach it) — verdict accepted on the design call.

- **med `package.json` → FIXED (controller).** `build:css` used `bunx` (absent in this environment)
  → now `bun x @tailwindcss/cli …` (bun's builtin — zero environment dependency). Proven with the
  temporary `~/.local/bin/bunx` symlink **deleted** (`which bunx` = empty): `bun run build:css`
  exit 0 · `bun run build:editor` exit 0 · `bun run check` exit 0 · `bun run typecheck` exit 0.
  The environment is back to its original state — the repo is now self-sufficient.
- **low `var/diag-overflow.ts` heuristic → FIXED.** Elements whose `overflow-x` is
  `auto/scroll/hidden/clip` (content contained by the box) are no longer counted as offenders;
  only genuinely spilling content counts. Re-run: **offenders = 0 in all 5 conditions**
  (1440 styleguide + design · 200% zoom both · 360px styleguide), document
  `scrollWidth ≤ innerWidth` throughout (1425/1440 · 345/360). The earlier 1/7 counts were the
  correctly-scrolling specimen `<pre>`'s inner scrollWidth — measurement artifact, not overflow.
- **low stale citation → CORRECTED.** Specimen `<pre class="mb-4 overflow-auto …">` =
  `packages/server/src/web/pages.tsx:971` at HEAD · `:1145` in the current worktree
  (the round-1 `:1122` was a transient sibling-edit state). Mechanism verified by the verifier:
  the `<pre>` sits outside `.doku-prose`.
- **low arithmetic → CLARIFIED.** 1480 = content box right edge **1432** (= 1440 − 8px UA body
  margin at the right; the box spans 8…1432, width 1424) + 48px hang (`var(--d-space-12)`) →
  1480. At 200% zoom the rem-based hang doubles to 96px → 1528. Numbers in the ticket
  (1480/916/2243) all reproduced verbatim in the control run.

- **med `scripts/dev.sh:9` → FIXED (controller; narrow, documented exception to the batch's
  "don't touch `scripts/`" rule).** That rule targets **gate tampering** (`scripts/shot.ts` checks =
  abort). `dev.sh` is the documented dev entry (`AGENTS.md` → `bun run dev`), measures nothing, and
  every gate script stays untouched (`git diff HEAD -- scripts/shot.ts` = empty). The line was the
  last real `bunx` invocation in the repo (same defect class as the package.json med):
  `bunx @tailwindcss/cli … --watch &` → `bun x @tailwindcss/cli … --watch &`.
  Proven: `bash -n scripts/dev.sh` rc=0 · repo grep → **zero `bunx` in `scripts/` + `package.json`**
  (only `.scratch/**` prose mentions it) · the exact watch invocation runs and stays alive (below).
- **stdin nuance (MUST know before re-testing — otherwise a false finding):** Tailwind v4 `--watch`
  **exits silently rc=0 when its stdin closes** — identical for the old `bunx`, the new `bun x`, and
  even the direct `./node_modules/.bin/tailwindcss` binary (all three verified: stdin held open →
  `ALIVE` + `Done in 118ms/99ms` + output written; `< /dev/null` → `DEAD`, banner only). In real
  `bun run dev` from an interactive terminal stdin is a tty → the watcher stays alive. Test with a
  held-open stdin, never by bare backgrounding in a non-interactive shell:
  `sleep 20 | bun x @tailwindcss/cli -i packages/server/src/web/styles/app.css -o /tmp/x.css --minify --watch`
  (expect ALIVE after ~4s + `/tmp/x.css` written), then kill it.
- **low ticket arithmetic phrasing → CORRECTED** (see the CLARIFIED bullet above: 1432 = 1440 − 8
  right margin; box spans 8…1432; +48 → 1480, +96 → 1528).

Round-2 verify: confirm the `package.json` fix + green state. **Do NOT repeat the control
experiment** (artifacts must not move — sibling verifiers run `bun run shot` concurrently);
causality was already independently proven in round 1 and is quoted above.

## Notes

- You fix a bug that was already there — nobody's slice introduced it. Do not touch slice files.
- **Gate tampering forbidden**: `scripts/shot.ts` and its checks stay exactly as they are — fix the
  layout, not the measurement.
- Diagnose with `bun run shot` (prints element/viewport measurements), find the widest offending
  element on those pages (content blocks: table/pre/figure/katex are the usual suspects per docs/03).
- CSS fixes live in `packages/core/src/styles/**` using design tokens only (no hardcoded
  color/spacing — invariant: tokens + `tokens.test.ts`/`contrast.test.ts` must stay green).
- **You are the only slice in this batch allowed to run `bun run shot`** (port 7699 — concurrent
  runs caused a known flake).
- If the root cause is markup inside `packages/server/src/web/pages.tsx` (styleguide JSX, owned by
  S2): do NOT edit it — prefer a CSS containment fix; if impossible, STOP and report the exact
  `file:line` + proposed markup patch for the controller to sequence after S2.
- Forbidden: `pages.tsx` · `client.ts` · `app.tsx` · `api.ts` · `tree.ts` · `listing.ts` · `scripts/**`.
