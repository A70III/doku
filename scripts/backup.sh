#!/usr/bin/env bash
# backup vault ด้วย auto-git (plan §5 M5 — "backup script (auto-git vault)")
#
# vault เป็น plain text + git ได้ (invariant 1) แต่ `/vault/` ถูก gitignore ใน repo หลัก
# → script นี้ commit ลง repo ของ vault เอง (init .git ใน vault ถ้ายังไม่มี)
# - ไม่มีการเปลี่ยนแปลง = ข้าม (idempotent · รันกับ cron ได้)
# - ตั้ง remote `origin` แล้ว = push ให้ด้วย (ล้มเหลว = เตือน แต่ commit อยู่บน disk แล้ว)
# - `.git` ใน vault ไม่กระทบ doku: watcher/tree/index ข้าม dotfolder ทุกตัว (invariant 9)
set -euo pipefail

VAULT="${DOKU_VAULT:-vault}"

if [ ! -d "$VAULT" ]; then
  echo "ไม่พบ vault: $VAULT (รันจาก root ของ repo หรือระบุ DOKU_VAULT=<dir>)" >&2
  exit 2
fi

cd "$VAULT"

if [ ! -d .git ]; then
  git init -q
  echo "init .git ใหม่ใน $VAULT"
fi

# identity ของ repo นี้ยังไม่มี = ตั้ง fallback เฉพาะ repo (headless/cron commit ได้ ไม่แตะ config ระดับ global)
if ! git config user.name >/dev/null 2>&1; then
  git config user.name "doku backup"
fi
if ! git config user.email >/dev/null 2>&1; then
  git config user.email "doku@localhost"
fi

git add -A

if git diff --cached --quiet; then
  echo "ไม่มีการเปลี่ยนแปลง — ข้าม commit"
  exit 0
fi

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git commit -q -m "backup $STAMP"
COUNT="$(git ls-files | wc -l | tr -d ' ')"
echo "backup แล้ว: $STAMP (${COUNT} ไฟล์ใน vault)"

if git remote get-url origin >/dev/null 2>&1; then
  if ! git push -q origin HEAD; then
    echo "warn: push origin ไม่สำเร็จ — commit อยู่บน disk แล้ว ( retry รอบหน้า )" >&2
  fi
fi
