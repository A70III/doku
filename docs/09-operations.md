# 09 — Operations (คู่มือปฏิบัติการ)

หน้านี้สำหรับ**คนดูแลเครื่อง** — รันให้ขึ้น, deploy, ตั้ง env, backup, กู้คืน, ดูสุขภาพ, อัปเกรด, แก้ปัญหา
ไม่ต้องอ่านโค้ดก็ทำตามได้ครบ

- ภาพรวมระบบ/การไหลของข้อมูล → [01-architecture](01-architecture.md)
- ระบบป้องกันอะไรไว้บ้าง (และอะไรที่ไม่ได้ป้องกัน) → [06-security](06-security.md)
- ไฟล์/โฟลเดอร์ใน vault หน้าตาอย่างไร → [02-content-format](02-content-format.md)
- แก้โค้ด/รัน gate → [10-development](10-development.md)

---

## 1. สิ่งที่ต้องมี

| สิ่งที่ต้องมี | เวอร์ชันที่ใช้จริง | หมายเหตุ |
|---|---|---|
| Bun | 1.4.2 (ขั้นต่ำ 1.2) | runtime + test runner + package manager — ไม่ต้องมี Node · deploy ด้วย Docker ไม่ต้องมี Bun บน host |
| Docker + Compose v2 | compose plugin (`docker compose`) | เฉพาะตอน deploy บน home server |
| ผู้ใช้ uid 1000 | `l2s` = 1000 | container รันเป็น uid นี้ ไฟล์ใน vault จึงไม่กลายเป็นของ root |
| พื้นที่ดิสก์ | vault + `var/` (index/cache/revisions) | `var/` โตตามจำนวนเอกสารและจำนวนครั้งที่แก้ |
| Git | ใช้โดย `scripts/backup.sh` (ใน vault) | ไม่ต้องมี remote ก็ backup ได้ (commit บนดิสก์) |

- **ไม่ต้องมี** ฐานข้อมูลแยก — SQLite (FTS5) ฝังมาใน Bun แล้ว เก็บที่ `var/index.db`
- **ไม่ต้องมี** reverse proxy สำหรับใช้ในบ้าน — server ฟังพอร์ต `7667` ตรง ๆ
- ถ้าจะเปิดออกนอก LAN ต้องเพิ่ม token + HTTPS เอง (ยังไม่มีในโค้ด — ดู [06](06-security.md))

---

## 2. รันในเครื่อง (dev)

```bash
bun install                 # ติดตั้ง workspace ทั้งหมด
bun run dev                 # server (bun --hot) + Tailwind watch → http://localhost:7667
```

`bun run dev` ทำงาน 3 อย่างตาม [`scripts/dev.sh`](../scripts/dev.sh):

1. `bun run build:editor` — bundle CodeMirror 6 → `packages/server/public/editor.js` (ครั้งเดียวตอนเปิด)
2. `bun x @tailwindcss/cli … --watch` — build `packages/server/public/app.css` แบบเฝ้าไฟล์
3. `DOKU_CACHE=off bun run --hot packages/server/src/index.ts` — dev ปิด **disk cache** (memory cache ยังทำงาน)

เปิดครั้งแรกต้องมี vault:

```bash
mkdir -p vault                       # vault จริง (gitignore)
# หรือลองกับ vault ตัวอย่างที่ commit ไว้:
DOKU_VAULT=examples/vault bun run dev
```

ถ้าไม่พบ vault server จะจบด้วย exit code `2` พร้อมข้อความบอก path ที่หาไม่เจอ

### พอร์ตและ artifact ที่ต้อง build

| ของ | ที่อยู่ | เกิดจาก | ถ้าไม่มี |
|---|---|---|---|
| `app.css` | `packages/server/public/app.css` | `bun run build:css` (หรือ Tailwind watch ของ `dev`) | **หน้าเว็บไม่มีสไตล์ทั้งแอป** (chrome/layout พัง) |
| `editor.js` | `packages/server/public/editor.js` | `bun run build:editor` | โหมดเขียนถอยเป็น `<textarea>` ธรรมดา (ยังใช้งานได้) |
| `schema/` | `schema/*.json` | `bun run gen:schema` | ไม่กระทบ runtime — artifact สำหรับคนอื่นอ่าน |
| vault | `vault/` หรือ `$DOKU_VAULT` | คนสร้างเอง | server ออกทันที (exit 2) |

> `packages/server/public/` ถูก **gitignore** — clone ใหม่แล้วต้อง build ก่อนเปิด
> (ทั้งสองไฟล์ build ตอนสร้าง Docker image ให้อัตโนมัติ ไม่ต้อง build บน host ตอน deploy)

### ตรวจว่า dev ขึ้นจริง

```bash
curl -s http://127.0.0.1:7667/health      # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7667/        # 200
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7667/daily/2025-09-12   # 200
```

ตอนบูตจะเห็นบรรทัดนี้ที่ stderr — ใช้ยืนยันว่า server อ่าน vault ถูกที่:

```
doku serve → http://0.0.0.0:7667  (vault: /path/to/vault)
```

---

## 3. Deploy บน home server (Docker)

```bash
cd /path/to/doku
docker compose up -d --build      # build image (build:css + build:editor อยู่ใน image) + ขึ้น container
docker compose ps                 # ต้องเห็นสถานะ healthy
docker compose logs -f --tail 50  # ดูบรรทัด "doku serve → …"
```

- **healthcheck**: `wget -qO- http://127.0.0.1:7667/health` ทุก 30s · timeout 5s · retries 3 · `start_period` 15s
  → `healthy` = HTTP 200 จาก `/health` ใน container
- **restart policy**: `unless-stopped` (รีบูตเครื่องแล้วขึ้นเอง)
- **port**: `7667:7667` (host:container) — เปิดจากเครื่องอื่นในบ้านที่ `http://<host-ip>:7667`

### ตำแหน่งข้อมูล

| ใน container | บน host | ชนิด | ลบแล้วเกิดอะไร |
|---|---|---|---|
| `/data/vault` | `./vault` (bind mount) | โฟลเดอร์จริงบน host | เอกสารหาย — **นี่คือ source of truth** |
| `/data/var` | named volume `doku-var` | docker volume | index/cache หาย (สร้างใหม่ได้) · **revision + audit หายถาวร** |

- `./vault` แก้/git/สำรองจาก host ได้ตรง ๆ — watcher ใน container เห็นการเปลี่ยนและอัปเดต index เอง
- ชื่อ volume จริงมักเป็น `<ชื่อโฟลเดอร์>_doku-var` (เช่น `doku_doku-var`) — ดูด้วย `docker volume ls`
- `docker compose down` = หยุด+ลบ container (ข้อมูลอยู่ครบ) · `docker compose down -v` = **ลบ named volume ด้วย** (revision/audit หาย)

### uid 1000 — ทำให้ไฟล์ไม่กลายเป็นของ root

Dockerfile `chown -R bun:bun /data` แล้ว `USER bun` (uid 1000 = user บน host)
ดังนั้นไฟล์ที่ server เขียนลง `/data/vault` จะเป็นของ `l2s` บน host — แก้ต่อ/`git add` ได้ทันที

ถ้าเจอ `permission denied` ให้เช็คว่า vault บน host เป็นของ uid 1000 จริง:

```bash
ls -ld vault
sudo chown -R 1000:1000 vault     # ถ้าเคยรันด้วย root มาก่อน
```

### ทรัพยากรที่จำกัดไว้

`docker-compose.yml` ตั้ง `mem_limit: 768m` + `memswap_limit: 768m`
เพราะ heap ของ Bun **ไม่คืนหน่วยความจำให้ OS** — RSS จะไต่ตาม uptime (วัดจริง 30 วัน: ~500MB)
cap ไว้เพื่อให้ GC ทำงานและ**ห้ามไปกิน swap ของ host**

---

## 4. Environment variables

อ่าน**ครั้งเดียวตอน boot** — เปลี่ยนแล้วต้อง restart (`docker compose up -d` หรือ `bun run dev` ใหม่)

| ชื่อ | ค่าเริ่มต้น | ผล | ตัวอย่าง |
|---|---|---|---|
| `DOKU_VAULT` | `vault` | รากของ vault (path ของเอกสารทั้งหมด) — resolve เป็น absolute | `DOKU_VAULT=/home/l2s/doku/vault` |
| `DOKU_VAR` | `var` | ที่เก็บ runtime data: `index.db` · `cache/` · `revisions/` · `audit.log` | `DOKU_VAR=/data/var` |
| `DOKU_PORT` | `7667` | พอร์ตที่ Bun ฟัง — ชนกับโปรเซสอื่น = exit 2 พร้อมบอกวิธีหาเจ้าของพอร์ต | `DOKU_PORT=7700 bun run dev` |
| `DOKU_HOST` | `0.0.0.0` | interface ที่ฟัง · `0.0.0.0` = เปิดให้เครื่องอื่นใน LAN เห็น | `DOKU_HOST=127.0.0.1` (เฉพาะเครื่องนี้) |
| `DOKU_CACHE` | (ไม่ตั้ง = เปิด) | `off` = ปิด **disk cache** (memory cache ยังใช้) — ใช้ตอนแก้ CSS/block แล้วอยากเห็นผลทันที | `DOKU_CACHE=off bun run dev` |
| `DOKU_RESCAN_MS` | `60000` | ระยะ rescan fallback ของ search index (ms) · `0` = ปิด พึ่ง watcher อย่างเดียว · ค่าที่ไม่ใช่ตัวเลข = ใช้ค่าเริ่มต้น | `DOKU_RESCAN_MS=0` |
| `DOKU_NAME` | `doku` | ชื่อแบรนด์บนหัว sidebar + ชื่อแท็บ (ไม่ต้องแก้โค้ดเวลาอยากเปลี่ยนชื่อ) | `DOKU_NAME=คลังเอกสาร` |

ตัวอย่างชุดครบ (ใน `docker-compose.yml` ตั้งไว้แล้ว):

```yaml
environment:
  DOKU_VAULT: /data/vault
  DOKU_VAR: /data/var
  DOKU_PORT: "7667"
  DOKU_HOST: 0.0.0.0
  DOKU_RESCAN_MS: "60000"
  # DOKU_CACHE: off      # เปิดเฉพาะตอน debug
  # DOKU_NAME: doku
```

> `DOKU_RESCAN_MS=0` เหมาะกับ vault บน bind mount ที่ watcher ทำงานปกติ — ประหยัด CPU
> แต่ถ้าไฟล์ถูกแก้จากช่องทางอื่น (rsync, git checkout) ที่ watcher พลาด event จะไม่มีอะไรตามเก็บให้

---

## 5. ข้อมูลอยู่ไหน — อะไรคือความจริง อะไรลบได้

| path | คืออะไร | ต้อง backup | ลบได้ |
|---|---|---|---|
| `vault/<folder>/<doc>.md` | **เอกสาร — source of truth** | ✅ | ❌ (นี่คืองานจริง) |
| `vault/<folder>/<doc>.meta.json` | sidecar ของเอกสาร (title/tags/theme/order, optional) | ✅ | ได้ (กลับไปใช้ default) |
| `vault/<folder>/_folder.meta.json` | ตั้งค่าโฟลเดอร์ (ชื่อ/ไอคอน/สี/order, optional) | ✅ | ได้ |
| `vault/.media/<sha256>.<ext>` | ไฟล์แนบแบบ content-addressed (ชื่อไฟล์ = hash ของเนื้อหา) | ✅ | ❌ ถ้ายังมีเอกสารอ้างถึง (รูปจะหาย) |
| `vault/.trash/<id>/` | ของที่ลบแบบ soft-delete + manifest (auto-purge 30 วัน) | ไม่จำเป็น | ได้ (แต่กู้ไม่ได้อีก) |
| `vault/.git/` | repo ที่ `scripts/backup.sh` สร้าง (dotfolder — watcher/tree/index ข้าม) | — | ได้ (เสียประวัติ backup) |
| `var/index.db` (+`-wal`, `-shm`) | FTS5 trigram ของ search/backlink | ไม่จำเป็น | ✅ rebuild เองตอนบูต |
| `var/cache/<hash>.json` | fragment cache (envelope ตาม `rendererVersion`) | ไม่จำเป็น | ✅ render ใหม่ |
| `var/revisions/<path>/<ts>.md` | เนื้อหาก่อนถูกทับ (หมุน 20 ต่อเอกสาร) | ⚠️ ถ้าอยากได้ประวัติ | ✅ แต่กู้คืนไม่ได้ |
| `var/audit.log` | JSONL append-only ของทุก write (REST/MCP/CLI) | ⚠️ ถ้าต้องการร่องรอย | ✅ แต่ไม่มีใครสร้างคืน |
| `packages/server/public/app.css`, `editor.js` | artifact ที่ build ใหม่ได้ | ไม่ | ✅ build ใหม่ |

**หลักคิดเดียวที่ต้องจำ:** `vault/` คือความจริง · `var/` คือดัชนีที่สร้างใหม่ได้
ยกเว้นสองอย่างใน `var/` ที่ **กู้ไม่ได้** — `revisions/` และ `audit.log`
ถ้าสองอย่างนี้สำคัญกับคุณ ต้อง snapshot `var/` ด้วย (ข้อ 6.3)

เอกสารที่ถูกลบ = ย้ายเข้า `.trash` (ไม่หายจากดิสก์ทันที) · ลบถาวรทำได้เฉพาะคนผ่าน `POST /api/trash/empty`
(agent/MCP ไม่มี route นี้) · purge อัตโนมัติตอนบูตและทุกชั่วโมง เมื่อครบ 30 วัน

---

## 6. Backup / restore

### 6.1 `scripts/backup.sh` — auto-git ใน vault (ค่าเริ่มต้น)

```bash
bash scripts/backup.sh                    # ใช้ ./vault
DOKU_VAULT=/path/to/vault bash scripts/backup.sh
```

สคริปต์ทำตามลำดับนี้ (อ่านจากโค้ดจริง):

1. เช็คว่า vault มีอยู่ — ไม่มี = exit `2` พร้อมข้อความ
2. `cd` เข้า vault · ถ้ายังไม่มี `.git` → `git init -q`
3. ตั้ง identity เฉพาะ repo ถ้ายังไม่มี (`doku backup` / `doku@localhost`) — ไม่แตะ git config global (cron/headless commit ได้)
4. `git add -A` → ถ้า staging ว่าง = `ไม่มีการเปลี่ยนแปลง — ข้าม commit` แล้ว exit `0` (idempotent, เรียกซ้ำได้)
5. commit ข้อความ `backup <ISO8601 UTC>` แล้วพิมพ์จำนวนไฟล์
6. ถ้ามี remote `origin` → `git push` ให้ · push ล้มเหลว = เตือนที่ stderr แต่ **commit อยู่บนดิสก์แล้ว**

ข้อควรรู้:

- `.media/` ถูก commit ด้วย (`git add -A`) — รูป/ไฟล์แนบไปกับ backup ครบ
- `.trash/` ก็ถูก commit ด้วย ถ้าไม่ต้องการเก็บของที่ลบแล้วในประวัติ ให้ใส่ไฟล์ `vault/.gitignore` ที่มีบรรทัด `.trash/`
- dotfolder ไม่กระทบ doku — watcher/tree/index ข้าม dotfolder ทุกตัวอยู่แล้ว

**ตั้งเวลา (ยังไม่ได้ตั้งไว้บนเครื่องนี้ — `crontab -l` ว่างตอนตรวจ):**

```cron
*/15 * * * * cd /path/to/doku && DOKU_VAULT=/path/to/doku/vault bash scripts/backup.sh >> /path/to/doku/var/backup.log 2>&1
```

> ทุก 15 นาที = งานที่แก้ล่าสุดหายไม่เกิน 15 นาที และ commit ที่ไม่มีอะไรเปลี่ยนถูกข้าม (ไม่บวม)
> ถ้าใส่ใน crontab แล้วมี `%` ในคำสั่ง ต้อง escape เป็น `\%`

### 6.2 snapshot ทั้ง vault ด้วย tar (กัน git พัง/กันดิสก์หาย)

```bash
mkdir -p ~/backups
tar -czf ~/backups/doku-vault-$(date +%F-%H%M).tar.gz -C /home/l2s/doku vault
```

กู้คืน (ระวัง: เขียนทับ vault ปัจจุบัน):

```bash
cd /home/l2s/doku
docker compose down
mv vault vault.broken-$(date +%F-%H%M)          # เก็บของเดิมไว้ก่อน
tar -xzf ~/backups/doku-vault-2025-01-01-0400.tar.gz -C .
docker compose up -d
```

### 6.3 snapshot `var/` (เฉพาะเมื่อต้องเก็บ revision/audit)

`var` อยู่ใน named volume ไม่ใช่โฟลเดอร์บน host — ต้องอ่านผ่าน container ชั่วคราว:

```bash
docker volume ls | grep doku-var          # ยืนยันชื่อ volume จริง (มักเป็น doku_doku-var)
docker run --rm -v doku_doku-var:/data -v "$HOME/backups:/out" alpine \
  tar -czf /out/doku-var-$(date +%F).tar.gz -C /data .
```

กู้คือกลับทาง: `docker run --rm -v doku_doku-var:/data -v "$HOME/backups:/out" alpine tar -xzf /out/doku-var-<ts>.tar.gz -C /data`
(ทำตอน container หยุด — `docker compose stop` ก่อน กัน WAL เขียนทับระหว่างแตกไฟล์)

### 6.4 กู้คืนเป็นรายไฟล์ / รายเอกสาร

**จาก git (ใน vault):**

```bash
cd vault
git log --oneline | head                 # หา commit ที่ต้องการ
git show <sha>:projects/doku/design.md   # ดูเนื้อหาก่อน
git checkout <sha> -- projects/doku/design.md
```

**จาก revision store (เนื้อหาก่อนถูกทับ — ไม่ต้องมี backup):**

```bash
# ใน container (path/var ตรงกับที่ container ใช้)
docker compose exec doku bun run packages/cli/src/index.ts \
  restore projects/doku/design --vault /data/vault --var /data/var --list

docker compose exec doku bun run packages/cli/src/index.ts \
  restore projects/doku/design 20260101T030405000Z --vault /data/vault --var /data/var
```

บนเครื่อง dev ใช้ `bun run doku restore <path> [ts] [--list]` ได้เลย
(ไม่ระบุ `ts` = เอา revision ล่าสุด · เก็บ 20 อันล่าสุดต่อเอกสาร)

### 6.5 ความถี่ที่แนะนำ

| ข้อมูล | วิธี | ความถี่ | เก็บนาน |
|---|---|---|---|
| `vault/` | `backup.sh` (git commit) | ทุก 15 นาที | ตลอด (ประวัติเต็ม) |
| `vault/` | tar เต็มก้อน | สัปดาห์ละครั้ง | 8 สัปดาห์ |
| `vault/` | copy ออกนอกเครื่อง (USB/เครื่องอื่น) | เดือนละครั้ง | ตามต้องการ |
| `var/` | tar (revision + audit) | เดือนละครั้ง | 3 เดือน |

กฎเดียว: **backup ที่ไม่เคยทดสอบ restore ไม่ใช่ backup** — ทดสอบปีละครั้งว่ากู้ไฟล์หนึ่งได้จริง

---

## 7. สุขภาพระบบ (monitoring)

### 7.1 health endpoint

```bash
curl -s http://127.0.0.1:7667/health          # {"ok":true}
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" http://127.0.0.1:7667/health
```

`/health` ตอบ `{"ok":true}` แบบคงที่ (ไม่แตะดิสก์/DB) — ใช้ตอบคำถามเดียว: **โปรเซสยังรับ request ได้ไหม**
ไม่ใช่ตัววัดว่าข้อมูลถูกต้อง · ถ้าอยากรู้ว่าข้อมูลยังอ่านได้ ให้เปิดหน้าเอกสารจริงหนึ่งหน้า

### 7.2 `docker stats` ที่คาดหวัง

```bash
docker stats --no-stream doku
```

| ตัวชี้วัด | ค่าปกติ | ที่มา |
|---|---|---|
| RAM หลัง start ใหม่ | ~60–120MB | วัดจริง: 111–123MB (โปรเซสใหม่) · 60→74MB หลัง 180 request |
| RAM หลังรันยาว | ไต่ช้า ๆ ถึง ~500MB ใน 30 วัน | heap ของ Bun ไม่คืน OS — ไม่ใช่ leak (cache มีขอบเขต: fragment 200 · static 2) |
| CPU ตอน idle | < 2% | หลังแก้ rescan เป็น stat-first (ของเดิมกิน ~40% ของ 1 core) |
| CPU ตอน sync ครั้งแรก | กระชากสั้น ๆ | boot sync อ่าน vault ทั้งก้อนครั้งเดียว |

### 7.3 สัญญาณผิดปกติ → ไปดูอะไร

| อาการ | น่าจะเป็น | ตรวจ |
|---|---|---|
| CPU ค้าง 30–40% ตลอด | rescan ถี่เกิน/vault ใหญ่มาก | `DOKU_RESCAN_MS` · ขนาด `var/index.db` · log `index: sync ไม่สำเร็จ` |
| RSS แตะ 768MB แล้วถูก OOM kill | vault โต/ไฟล์ใหญ่ผิดปกติ หรือ sync ซ้อน | `docker inspect -f '{{.State.OOMKilled}}' doku` · ขนาด md |
| `/health` ค้าง/timeout แต่ container ยัง up | event loop ถูกบล็อก (sync ใหญ่/ดิสก์ช้า) | `docker compose logs --tail 100` · `docker stats` |
| `audit.log` โตเร็วผิดปกติ | มี agent เขียนถี่ (60/min limit) | `tail var/audit.log` · `doku audit --limit 50` |
| รูป 404 ทั้งหน้า | `.media` ไม่ครบหลัง restore | `find vault/.media -type f` นับเทียบกับจำนวนที่อ้าง |
| หน้าเอกสารเก่าค้าง | asset `?v=` ไม่เปลี่ยน / disk cache ค้าง | hard reload · `DOKU_CACHE=off` · ลบ `var/cache/` |

log ที่ควรเห็นตอนปกติ: `doku serve → http://0.0.0.0:7667  (vault: …)`
log ที่ **ไม่ควร** เห็นซ้ำ ๆ: `index: sync ไม่สำเร็จ` · `audit: append ไม่สำเร็จ`

---

## 8. อัปเกรด

```bash
cd /path/to/doku
git pull                          # คนรันเอง — agent ไม่แตะ git
docker compose up -d --build      # build image ใหม่ (รวม app.css + editor.js)
docker compose ps                 # รอ healthy
```

ตรวจหลังอัปเกรด (1 นาที):

```bash
curl -s http://127.0.0.1:7667/health                       # {"ok":true}
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7667/   # 200
docker compose exec doku bun run packages/cli/src/index.ts check --vault /data/vault   # 0 errors
```

แล้ว **เปิดหน้าเอกสารจริง 1 หน้า** + ค้นหาคำหนึ่งคำในช่องค้นหา (palette) — สองอย่างนี้จับปัญหาที่ `/health` มองไม่เห็น

หมายเหตุ:

- index schema เปลี่ยนระหว่างเวอร์ชัน → `PRAGMA user_version` ไม่ตรง = **drop แล้ว rebuild จาก vault เอง** (ไม่ต้อง migrate มือ · ครั้งแรกอาจช้าเป็นนาที)
- `var/cache` เป็น envelope ที่ผูกกับ `rendererVersion` → cache เก่าถูกเมิน ไม่ต้องล้าง
- rollback: `git checkout <commit เดิม>` แล้ว `docker compose up -d --build` (image เป็น `doku:local` ที่ build จาก source ปัจจุบัน ไม่มี tag ย้อนหลัง)
- **ก่อนอัปเกรดทุกครั้ง**: `bash scripts/backup.sh` (หรือรอ cron รอบล่าสุด) — 1 วินาที แลกกับความสบายใจ

---

## 9. Troubleshooting

| อาการ | สาเหตุ | วิธีแก้ |
|---|---|---|
| RAM บวมขึ้นเรื่อย ๆ | heap Bun ไม่คืน OS + rescan/sync ทำงานเปล่า | คง `mem_limit: 768m` · ตั้ง `DOKU_RESCAN_MS=0` ถ้า watcher ทำงานดี · restart เป็นรอบถ้าจำเป็น (ข้อมูลไม่หาย) |
| หน้าโหลดช้า/คลิกสลับเอกสารแล้วหน่วง | static ถูก revalidate ทุกครั้ง หรือ artifact เก่า | build ใหม่ (`build:css`, `build:editor`) · ตรวจว่า URL มี `?v=<hash>` (immutable) · ดู Network ว่า 304/0B |
| หน้าเว็บไม่มีสไตล์ (CSS หาย) | ยังไม่ build `app.css` (`public/` เป็น gitignore) | `bun run build:css` · ถ้าอยู่บน Docker ให้ rebuild image (image build ให้อยู่แล้ว) |
| โหมดเขียนไม่ขึ้น (กลายเป็น textarea) | `editor.js` ไม่ถูก build/โหลดไม่ได้ | `bun run build:editor` · ดู console ว่า `/static/editor.js` 200 · ตรวจ CSP ไม่มี violation |
| ค้นหาไม่เจอคำที่ควรเจอ | `index.db` เพี้ยน/สกีมาเก่า หรือ watcher พลาดและ rescan ปิด | หยุด container → ลบ `var/index.db` → เริ่มใหม่ (rebuild จาก vault) · ตรวจว่า `DOKU_RESCAN_MS` ไม่ใช่ 0 ตอนไฟล์ถูกแก้จากภายนอก |
| `permission denied` ตอนเขียนเอกสาร | vault บน host ไม่ได้เป็นของ uid 1000 | `ls -ld vault` · `sudo chown -R 1000:1000 vault` · ยืนยันว่า container รันด้วย `USER bun` |
| `port 7667 ถูกใช้อยู่` (exit 2) | มีโปรเซสอื่นถือพอร์ต | `ss -tlnp 'sport = :7667'` · เปลี่ยน `DOKU_PORT` หรือแก้ mapping ใน compose (แก้ทีละที่ ไม่ใช่ทั้งคู่) |
| ผลค้นหา/backlink เพี้ยน (ซ้ำ/ชี้ผิด) | index sync ไม่จบ หรือ DB ถูกเขียนพร้อมกันตอน copy | ลบ `var/index.db` แล้ว restart · อย่า copy DB ระหว่าง container ทำงาน (WAL) |
| หน้าไม่อัปเดตเองหลังแก้ไฟล์ (SSE หลุด) | proxy/เน็ตตัด idle หรือ container เพิ่ง restart | เบราว์เซอร์ reconnect เอง (server ส่ง ping ทุก 25s) — ถ้าไม่ ให้ refresh · ตรวจ `/sse` ตอบ 200 |
| autosave ขึ้น 409 | ไฟล์ถูกแก้จากช่องอื่น (CLI/MCP/`git checkout`) | โหลดหน้าใหม่แล้วเลือกว่าจะเก็บอันไหน — ระบบไม่ทับให้เงียบ ๆ |
| API ตอบ `428 precondition_required` | client/agent ไม่ส่ง `If-Match` | ส่ง ETag ที่ได้จาก GET ล่าสุดใน header `If-Match` |
| API ตอบ `429 rate_limited` | เขียนเกิน 60 ครั้ง/นาที (render 120/นาที) | เว้นจังหวะ หรือรวม write เป็นชุดเดียว |
| รูปไม่ขึ้น (404 `/media/…`) | ไฟล์ใน `.media` หาย หรือชื่อไม่ตรงรูปแบบ `<64 hex>.<ext>` | `ls vault/.media` · อัปโหลดใหม่ (content-addressed = อัปซ้ำได้ ไม่ทับใคร) |
| server ออกทันทีพร้อม `ไม่พบ vault` | `DOKU_VAULT` ชี้ผิดที่ | ตรวจ path ใน container (`/data/vault`) และ bind mount ใน compose |
| container `unhealthy` แต่ log ปกติ | healthcheck ยิงไม่ถึง (host/port ผิด) หรือ start ช้า | `docker compose exec doku wget -qO- http://127.0.0.1:7667/health` · เพิ่ม `start_period` |

---

## 10. สรุปคำสั่งที่ใช้บ่อย

```bash
# dev
bun install && bun run dev
bun run build:css && bun run build:editor

# deploy
docker compose up -d --build
docker compose ps
docker compose logs -f --tail 100

# สุขภาพ
curl -s http://127.0.0.1:7667/health
docker stats --no-stream doku

# backup / กู้
bash scripts/backup.sh
bun run doku restore <path> --list
bun run doku check --vault vault

# ค้น/ตรวจจาก CLI (อ่านอย่างเดียว)
bun run doku search "คำค้น" --limit 10
bun run doku audit --limit 20
```

เอกสารที่ต้องอ่านคู่กัน: [06-security](06-security.md) (ข้อจำกัดด้านความปลอดภัย) · [02-content-format](02-content-format.md) (ไฟล์ใน vault) · [11-handoff](11-handoff.md) (สถานะปัจจุบัน)
