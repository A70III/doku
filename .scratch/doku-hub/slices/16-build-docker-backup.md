# 16 — build-docker-backup
Status: open
Phase: M5
Files I may touch: `packages/cli/src/index.ts` (บล็อก `build` เท่านั้น — ไฟล์ร่วมกับ ticket 09/14 ที่ sequential) · `packages/cli/test/build.test.ts` (new) · `Dockerfile` (new) · `docker-compose.yml` (new) · `.dockerignore` (new) · `scripts/backup.sh` (new)
Plan item: plan.md §5 M5 — `doku build --out` + Dockerfile/compose skeleton + backup script (auto-git vault)
DoD check: `bun test packages/cli/test/build.test.ts` → 2 เขียว (export ครบ · URL ภายใน = relative ทั้งหมดไม่มี `/d/`·`/assets/` · asset bytes เท่ากัน · index.html · usage exit 2 · รันซ้ำได้) · backup: `DOKU_VAULT=<temp> bash scripts/backup.sh` → init+commit → rerun = "ข้าม commit" → เพิ่มไฟล์ = commit ใหม่ · ไม่มี vault = exit 2

## Notes
- `doku build` ไม่ลบไฟล์เดิมใน `--out` (ไม่มีคำสั่งลบจาก CLI — decision ข้อ 80) ·หน้าเปิด offline ด้วย preview shell เดียวกับ `doku render`
- docker = **โครงเท่านั้น** ยังไม่ build/run (docs/08 ข้อ 3: docker มาหลัง M4 นิ่ง)
- backup = auto-git ใน vault เอง (`vault/.git` = dotfolder → watcher/tree/index ข้ามอยู่แล้ว invariant 9) · identity fallback เฉพาะ repo เมื่อยังไม่มี config
