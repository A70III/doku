#!/usr/bin/env bash
# bun run dev — dev server (bun --hot) + Tailwind watch (docs/08 ข้อ 21)
set -euo pipefail
cd "$(dirname "$0")/.."

# bundle CodeMirror 6 → public/editor.js (docs/08 ข้อ 17) — ครั้งเดียวตอนเปิด
bun run build:editor

bun x @tailwindcss/cli \
  -i packages/server/src/web/styles/app.css \
  -o packages/server/public/app.css --watch &
css_pid=$!
trap 'kill "$css_pid" 2>/dev/null || true' EXIT

# dev ปิด disk cache (docs/01) — memory cache ยังใช้ได้เพราะ key จาก content hash
DOKU_CACHE="${DOKU_CACHE:-off}" exec bun run --hot packages/server/src/index.ts
