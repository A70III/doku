# 08 — rest-assets-context

Status: done
Phase: M4
Files I may touch: `packages/server/src/api.ts` (asset/context routes only) · a helper under `packages/core/src/` ONLY if the charset rule must be shared (keep isomorphic) · `packages/server/test/` (new tests) · `docs/08-decisions.md` (close Q7 — add the decision row)
Plan item: plan.md §5 M4 — assets upload/delete + `GET /context/*path` + enforce docs/06 asset charset (closes docs/08 Q7)
DoD check: on a temp vault server (`DOKU_PORT=7681`): (1) multipart upload `POST /api/docs/<path>/assets` with a valid filename → asset served back by `GET /assets/<...>`; (2) filename violating docs/06's `[a-zA-Z0-9._\-\u0E00-\u0E7F ]+` (e.g. `../evil.png`, `a<b>.png`, `a!b.png`) → 4xx using an **existing** error code (`path_invalid`) and **no file on disk**; (3) `DELETE /api/assets/<path>` → 200 then `GET /assets/...` → 404; (4) `GET /api/context/projects/doku/design` → md + meta summary JSON suitable for a prompt; (5) `bun test` + `check` + `typecheck` green; (6) `doku check --vault examples/vault` still 0/0. Quote all outputs.

## Notes

- Specs: docs/05 §3 "Assets / อื่นๆ" (routes + error-code vocabulary — reuse `path_invalid`,
  `not_found`, `asset_type_rejected`… do NOT invent new codes unless forced) · docs/06 path-safety
  block (normalize `..`, leading `/`, control chars, `<>:"|?*`; charset `[a-zA-Z0-9._\-0E00-0E7F ]+`).
- Upload must go through existing write discipline: `safeJoin` + atomic write; mime allowlist =
  reuse whatever the existing `GET /assets/*` serve path already accepts (do not widen it).
- Q7 closure: add the decision row to `docs/08` (next number after 73) stating the enforced
  charset + which route enforces it, and remove the "รอเคาะ Q7" row from its รอเคาะ table.
- Rate limit: reuse the existing write limit; no new limiter.
- Forbidden: `pages.tsx` · `client.ts` · `scripts/**` · `packages/cli/**` · `packages/mcp/**` ·
  `app.tsx` · `folder-page.tsx` · `core/check.ts` · api.ts hunks outside asset/context routes
  (S1's move refactor is already landed in the tree — do not restructure it).

## Verdict (2026-09-24)

Round-1 (fresh verifier): **FINDINGS** — 3 med + 1 low, no high; DoD itself ran green.
- med: pre-write validation missed path-safety/length failures -> mixed [good, .hidden.png] wrote
  the good file before 400; 300-char name -> ENAMETOOLONG surfaced as 500
- med: DELETE accepted any serve-able extension -> could strip design.meta.json (json allowlisted)
- med: upload mime allowlist was an unlocked COPY of serve's ASSET_MIME (app.tsx forbidden to touch)
- low: upload url used shortHash (12-hex) but serve compares full sha256 -> ?h= never immutable

Round-2 (fresh verifier): **PASS** — all 4 findings FIXED with code + runtime evidence: target path
now pre-checked via isSafeVaultPath + NAME_MAX 255 (ASSET_NAME_MAX_BYTES) before any write + write
loop try/caught to 400 path_invalid (repro writes NOTHING; 304-char -> 400 not 500) - DELETE gated
on exact `assets` path segment (sidecar -> 404, file intact, context still returns meta.title; normal
asset-store delete still 200 -> 404 kind=asset) - url ?h= = sha256Hex 64-hex == serve's hash ->
`immutable` confirmed live - new parity test locks all 11 allowlisted exts (201+200) and rejects
html/txt/exe/md (400 + serve 404); `git status packages/server/src/app.tsx` empty.
Ticket DoD 44/44 (DOD_EXIT=0, temp vault DOKU_PORT=7686) - gates quoted: `bun test` 426/0 -
`bun run check` rc0 (2 pre-existing infos) - tsc x5 rc0 - shot --port 7701 rc0 (a11y ผ่านทุกข้อ) -
doku check 0/0 - CJK scan clean - plan §4 all ten PASS - no scope creep.
Controller: fixes + follow-ups accepted; docs/08 row 74 wording validated by round-2.
