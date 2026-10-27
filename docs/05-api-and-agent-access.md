# 05 — API & Agent Access

เป้าหมาย: **AI (Hermes/OpenClaw) อ่าน-เขียน-จัดโฟลเดอร์ได้เหมือนคน** — ทุกช่องทางแชร์ `@doku/core`
ชุดเดียวกัน (resolve → sanitize → render → path safety) ไม่มีทางลัดที่ข้ามกติกา

เอกสารนี้เป็น reference ของพื้นผิวที่ agent ใช้จริง: ไฟล์ใน vault · REST `/api/*` · CLI · MCP
ทุก field/endpoint ที่เขียนที่นี่มีอยู่ในโค้ด (`packages/server/src/api/*`, `packages/cli/src/index.ts`,
`packages/mcp/src/tools.ts`) — ไม่มีของที่แพลนไว้แต่ยังไม่ทำ

---

## 1. ภาพรวม — 4 ช่องทางเข้าถึงข้อมูล

| ช่องทาง | ใช้อะไร | เหมาะกับ | ข้อจำกัด |
|---|---|---|---|
| **ไฟล์ใน vault** | editor / `write` / `patch` / `mv` / `mkdir` | แก้ทีละไฟล์, งาน batch, git | ต้องรู้ path = id เอง · ไม่มี ETag/conflict |
| **REST `/api/*`** | HTTP + JSON | งานที่มี concurrency, UI, agent ที่ต้องการ ETag | rate limit write 60/min |
| **CLI `doku`** | คำสั่ง shell | งาน setup, validate, export, restore | เขียนไฟล์ตรง — ไม่มี ETag/conflict |
| **MCP (stdio)** | tool call | Hermes/agent ที่ต่อ tool โดยตรง | **ไม่มี If-Match** · ไม่มีลบถาวร |

### ไฟล์คือความจริง (ไม่มี state ใน DB)

- เนื้อหาอยู่ใน `vault/` — `design.md` + `design.meta.json` (optional sidecar)
- `var/` เก็บของที่ regenerate ได้: `var/index.db` (FTS), `var/revisions/`, `var/audit.log`
- ไม่มี database ที่เป็นเจ้าของเนื้อหา → เขียนไฟล์ตรง ๆ ก็ถูกต้องเท่ากับยิง API
- watcher เห็นการเปลี่ยน → invalidate tree → broadcast SSE (`/sse`) → หน้าเว็บ reload
  (watcher ข้าม `.trash/**`, `.media/**`, dotfile/dotfolder ทั้งหมด)
- mutate ผ่าน API ทุกครั้งจบด้วย `state.invalidate()` + broadcast — ไม่มี cache ค้าง

### ข้อควรระวัง

- **อย่าเขียนทับทั้งไฟล์เพื่อแก้บรรทัดเดียว** — ถ้าเป็นไปได้ใช้ `PATCH` หรือ patch ทีละจุด
  (ทุก write เก็บ revision ไว้ แต่ revision คือตาข่าย ไม่ใช่ใบอนุญาตให้เขียนมั่ว)
- **`.trash/` และ `.media/` เป็น dotfolder** — path safety ปฏิเสธทุก route ที่พยายามอ้างถึง
  (`.media` เข้าถึงได้ทาง `/media/:name` เท่านั้น, `.trash` ทาง `/api/trash`)
- vault ที่เปิดแบบ read-only → write ทุก route ตอบ `503 read_only` (อ่าน/ค้นหา/render ยังใช้ได้)
- `/api/*` ถูก mount ก็ต่อเมื่อ server มี `trash` + `revisions` (build ปกติมีครบ)

---

## 2. สัญญาพื้นฐาน

### 2.1 path = id

id ของเอกสาร = path ของไฟล์ relative จาก vault **ตัด `.md` ออก** (ดู [02](02-content-format.md#identity--path))

| ไฟล์จริง | id | URL หน้าเว็บ |
|---|---|---|
| `vault/design.md` | `design` | `/d/design` |
| `vault/projects/doku/design.md` | `projects/doku/design` | `/d/projects/doku/design` |

กติกาของ path (บังคับด้วย `normalizeVaultPath` + `isSafeVaultPath`):

- relative จาก vault root · ใช้ `/` เป็นตัวคั่นเสมอ · **ไม่มี** `/` นำหน้าหรือปิดท้าย
- ไม่มี segment ว่าง · ไม่มี `.` / `..` · ไม่มี segment ที่ขึ้นต้นด้วย `.` (dotfile/dotfolder)
- ห้ามอักขระควบคุม และ `<>:"|?*#\` (`#` ห้ามเพราะ HTTP ตัดเป็น fragment ไปแล้ว)
- ตัวตัด suffix ที่รับได้: `.md`, `.meta.json` (ตัดให้อัตโนมัติ) — และตัด prefix ที่ช่วยชีวิตได้:
  `/d/`, `./`, `vault/` (ชื่อ vault) ทิ้งให้
- โฟลเดอร์ใช้ path เดียวกันแต่ `stripSuffix = false` → ชื่อโฟลเดอร์ที่ลงท้าย `.md` เป็นเรื่องถูกกติกา

### 2.2 URL encoding

path ใน URL ต้อง encode **ทีละ segment** — server decode ทีละ segment เช่นกัน (`%2F` จึงไม่ถูกยุบเป็น `/`)

```text
projects/doku/design            → /api/docs/projects/doku/design
โปรเจกต์/ออกแบบ UX              → /api/docs/%E0%B9%82%E0%B8%9B%E0%B8%A3%E0%B9%80%E0%B8%88%E0%B8%81%E0%B8%95%E0%B9%8C/%E0%B8%AD%E0%B8%AD%E0%B8%81%E0%B9%81%E0%B8%9A%E0%B8%9A%20UX
```

- ช่องว่าง = `%20` (ไม่ใช่ `+` ใน path)
- ภาษาไทย encode เป็น UTF-8 percent-encoding ตามปกติ — `curl --data-urlencode` / `URL` ของ JS ทำให้
- ถ้า decode ไม่ผ่าน server คืน path ดิบแล้วปล่อยให้ path safety ปฏิเสธ → `400 path_invalid`

### 2.3 รูปของ response

สำเร็จ — ทุก route ห่อด้วย `ok: true` และใส่ field ที่ route นั้นคืน:

```json
{ "ok": true, "path": "projects/doku/design", "etag": "9f2c…" }
```

ล้มเหลว — รูปเดียวทั้งชุด:

```json
{ "ok": false, "error": { "code": "meta_invalid", "message": "meta ไม่ผ่าน schema", "fields": ["tags[2]"] } }
```

- `fields` มีเฉพาะ error ที่ชี้ field ได้ (path ของ Zod issue หรือชื่อ key ที่ไม่รู้จัก)
- error ที่หลุดถึง `onError` ของ API → ข้อความที่มีคำว่า symlink / ออกนอก vault / path escapes
  กลายเป็น `400 path_invalid` · ที่เหลือเป็น `500 internal_error` (ไม่ leak stack)
- สร้างใหม่ = `201` · สำเร็จทั่วไป = `200` · `204` ไม่ใช้เลย (client parse JSON เสมอได้)

### 2.4 ตาราง error code ทั้งหมด

| code | HTTP | ความหมาย | เกิดที่ |
|---|---|---|---|
| `invalid_json` | 400 | body ไม่ใช่ JSON object (หรือใหญ่เกิน md limit + 64 KB) | ทุก route ที่อ่าน body |
| `invalid_body` | 400 | body เป็น JSON แต่ field ผิดรูป (เช่นไม่มี `md`/`to`) หรือ multipart ผิด | docs/folders/assets/render/revisions |
| `path_invalid` | 400 | path ไม่ปลอดภัย/ผิดรูป · ชื่อไฟล์ asset ผิด charset หรือยาวเกิน 255 bytes | ทุก route ที่มี path |
| `meta_invalid` | 400 | meta ไม่ผ่าน `MetaSchema` / `FolderMetaSchema` หรือมี key ที่ไม่รู้จัก | docs/folders |
| `asset_type_rejected` | 400 | นามสกุลไม่อยู่ใน mime allowlist | upload asset, `DELETE /assets/*` |
| `not_found` | 404 | ไม่มีเอกสาร/โฟลเดอร์/asset/trash item/revision | อ่าน/แก้/ลบ/restore |
| `already_exists` | 409 | สร้างทับของที่มีอยู่ · ปลายทาง move ซ้ำ · restore ทับ path เดิม | create/move/trash restore |
| `folder_not_empty` | 409 | ลบโฟลเดอร์ที่ไม่ว่างโดยไม่ส่ง `?recursive=true` | `DELETE /folders/*` |
| `conflict` | 409 | `If-Match` ไม่ตรง ETag ปัจจุบัน (แถม header `etag` ของค่าล่าสุด) | `PUT`/`PATCH /docs/*` |
| `too_large` | 413 | md > 5 MB · asset > 25 MB | docs/render/assets |
| `precondition_required` | 428 | `PUT`/`PATCH` ไม่ได้ส่ง `If-Match` | `PUT`/`PATCH /docs/*` |
| `rate_limited` | 429 | เกิน write 60/min หรือ render 120/min | write ทุกตัว, `POST /render` |
| `read_only` | 503 | vault เปิด read-only หรือ adapter ไม่รองรับ media store | write ทุกตัว, upload |
| `internal_error` | 500 / 503 | bug ที่ไม่ถูกจับ (500) · search index ยังไม่พร้อม (503) | ที่เหลือ, `GET /search` |

`too_large` และ `rate_limited` เป็น 4xx ที่ **retry ได้** (หลังรอ/ลดขนาด) — `read_only` และ
`internal_error` (503) คือ "ปิดอยู่/ยังไม่พร้อม" ไม่ใช่ "พัง"

---

## 3. Concurrency & safety

### 3.1 ETag

- ETag = `sha256("doku-etag" \0 md \0 JSON.stringify(meta))` — hash ของ **md + meta ดิบจาก sidecar**
  (ไม่ใช่ meta ที่ resolve แล้ว ซึ่ง title อาจถูกแทนด้วย h1)
- ส่งกลับ 2 ที่พร้อมกัน: header `etag: "<hex>"` (quoted strong tag) และ field `etag` ใน JSON (hex ล้วน)
- route ที่คืน ETag: `GET /api/docs/*path` (ทั้ง md และ `?format=html`), `POST`/`PUT`/`PATCH /api/docs/*`,
  หน้าเว็บ `/d/*path`
- เอกสารที่ไม่มีไฟล์ = ไม่มี ETag (`404`)

### 3.2 `If-Match` (optimistic concurrency)

| สถานะ | ผล |
|---|---|
| ไม่ส่ง `If-Match` | `428 precondition_required` |
| ส่งแต่ไม่ตรง | `409 conflict` + header `etag` = ค่าปัจจุบัน (โหลดใหม่แล้วลองอีกครั้ง) |
| ตรง | ผ่าน — เขียนต่อ |
| `If-Match: *` | ผ่านถ้าเอกสารมีอยู่ (ไม่สนเนื้อหา) — ใช้เมื่อตั้งใจทับของใครก็ได้ |
| `If-Match: W/"<hex>"` | รับ (ตัด `W/` ทิ้ง) · ส่ง list คั่น comma ได้ ต้องมีตัวใดตัวหนึ่งตรง |

บังคับเฉพาะ **`PUT` และ `PATCH /api/docs/*path`** เท่านั้น ส่วน `POST` (create), `DELETE`,
`move`, folders, assets, revisions **ไม่ต้อง** ส่ง `If-Match` — เสี่ยงน้อยกว่าเพราะไม่ทับเนื้อหาเดิม
(แต่ delete/move ยังเก็บ revision ก่อนทำ)

### 3.3 revision (ตาข่ายกันพลาด)

- ก่อนทับ/ย้าย/ลบ ทุกครั้ง สำเนาเดิมไปที่ `var/revisions/<path>/<ts>.{md,meta.json}`
- `<ts>` = `20250912T100000000Z` (เรียงตามเวลาได้ เป็นชื่อไฟล์ปลอดภัย) · เก็บ 20 rev/doc (rotate)
- กู้ได้ 3 ทาง: `POST /api/revisions/*path`, `doku restore <path> [ts]`, ปุ่มใน UI
- restore เองก็เก็บ snapshot ปัจจุบันเป็น revision ก่อน → กู้ผิดตัวยังย้อนกลับได้

### 3.4 rate limit

in-memory counter (ไม่ต้อง Redis) · key = IP จริงจาก `x-forwarded-for` (ตัวแรก) หรือ `x-real-ip`
ไม่มี header = bucket เดียวชื่อ `lan` (ใช้ในบ้านจึงยอมรับได้)

| bucket | ตัวเลขจริง (`RATE_LIMITS`) | ครอบอะไร |
|---|---|---|
| `write` | **60 req/min** | ทุก write: docs create/update/patch/delete/move, folders, asset upload/delete, trash restore, revisions restore |
| `render` | **120 req/min** | `POST /api/render` (ไม่แตะ disk จึงแยก bucket) |

- เกิน = `429 rate_limited` (ข้อความบอกตัวเลข limit)
- upload asset **นับรวมใน write bucket** (60/min) — docs/06 เขียนว่า upload 10/min แต่โค้ดปัจจุบัน
  ยังไม่มี limiter แยก; ถ้าต้องการเพดาน upload จริงต้องเพิ่มที่ `assets.ts`
- อ่านทุกอย่าง (`GET`) ไม่มี rate limit

### 3.5 audit log

`var/audit.log` — JSONL append-only (ไม่มี route/CLI ไหน truncate หรือลบได้):

```json
{"ts":"2025-09-12T10:00:00Z","actor":"curl","action":"doc.update","path":"projects/doku/design","etag":"9f2c…","ip":"192.168.1.105"}
```

| field | ค่า |
|---|---|
| `ts` | ISO 8601 UTC (เวลาเขียน log) |
| `actor` | REST: `web` (UA เริ่ม `Mozilla/`), หัว UA (`curl/8.5.0` → `curl`), ไม่มี UA = `lan` · MCP = `mcp` · CLI = `cli` |
| `action` | `doc.create/update/delete/move/revision_restore` · `folder.create/update/delete/move` · `asset.upload/delete` · `<kind>.purge` / `<kind>.restore` (trash) |
| `path` | path id ของเป้าหมาย (asset = `.media/<name>`) |
| `etag` | ETag หลังเขียน (เฉพาะ doc create/update) |
| `to` | ปลายทาง (เฉพาะ move) |
| `ip` | มีเฉพาะเมื่อมาจาก proxy header จริง — ไม่มี = ไม่ใส่ field |

- 1 write = 1 บรรทัด เขียน **หลัง** สำเร็จ · log ล้มเหลว = stderr note แล้วเขียนต่อ (write ไม่พังเพราะ audit)
- `POST /api/trash/empty` ล็อก **ต่อ item** (`doc.purge` / `folder.purge` / `asset.purge`)
- อ่านย้อนหลัง: `doku audit [--path <p>] [--limit <n>] [--json]` (read-only)

---

## 4. REST reference

Base: `http://<host>:7667/api` (port default 7667, เปลี่ยนด้วย `DOKU_PORT`)
ทุก path ต่อท้ายด้วย path id — encode ตาม §2.2

### 4.1 Documents

| Method | Path | ทำอะไร | input | status |
|---|---|---|---|---|
| GET | `/docs` | list metadata ทั้ง vault เรียง mtime ใหม่ → เก่า | query: `tag`, `status`, `q` (path/title, case-insens.), `limit` | 200 |
| GET | `/docs/*path` | อ่านเอกสาร — คืน `md`, `meta` (resolved), `meta_raw` (sidecar ดิบ), `etag` | query: `format=html` → คืน `html` + `warnings` แทน `md` | 200 · 400 · 404 |
| POST | `/docs/*path` | สร้างเอกสารใหม่ | body: `{md, meta?}` | 201 · 400 · 409 · 413 · 429 · 503 |
| PUT | `/docs/*path` | แทนที่ทั้งไฟล์ (md และ/หรือ meta) | header `If-Match` · body: `{md?, meta?}` (`meta: null` = ลบ sidecar) | 200 · 400 · 404 · 409 · 413 · 428 · 429 · 503 |
| PATCH | `/docs/*path` | แก้ md และ merge meta บาง field | header `If-Match` · body: `{md?, meta?}` | 200 · 400 · 404 · 409 · 428 · 429 · 503 |
| DELETE | `/docs/*path` | ลบ = soft-delete เข้า `.trash/` (คืน `trash` item) | – | 200 · 404 · 429 · 503 |
| POST | `/docs/*path/move` | ย้าย + อัปเดตลิงก์ทั้ง vault + เขียน `relations.moved_from` | body: `{to, update_links?}` (default `true`) | 200 · 400 · 404 · 409 · 429 · 503 |

รายละเอียดที่ต้องรู้:

- `meta` ที่ส่งมาต้องผ่าน `MetaSchema` และ **ไม่มี key แปลกปลอม** (key ที่ไม่รู้จัก = `meta_invalid`
  พร้อม `fields`) — field ที่ใช้ได้ดู [02](02-content-format.md#field-reference)
- `PUT` รับ `meta: null` = **ลบ sidecar** (กลับไปใช้ค่าที่เดาจากไฟล์/h1) · `md` ไม่ส่ง = ไม่แตะ md
- `PATCH` merge แบบ shallow 1 ชั้น: top-level ทับตรง ๆ และ `theme`/`render`/`relations`/`agent`
  ทับเฉพาะ sub-key ที่ส่งมา (ส่ง `{"meta":{"agent":{"generated":true}}}` ไม่ลบ `last_editor`)
- `PATCH` ไม่รับ `meta: null` (ต้องใช้ `PUT` ถ้าจะลบ sidecar)
- `POST` create จะ `409 already_exists` ถ้ามี `.md` **หรือ** `.meta.json` **หรือ** โฟลเดอร์ชื่อเดียวกันอยู่แล้ว
- parent folder ถูกสร้างให้อัตโนมัติ (adapter `mkdir -p` ก่อน atomic write) — ไม่ต้อง `POST /folders/*` ก่อน
- `PATCH` ไม่ตรวจขนาด md (เฉพาะ `POST`/`PUT`/`POST /render` ที่บังคับ 5 MB) — client ต้องคุมเอง
- path ที่ลงท้าย `/move` หรือ `/assets` ใช้เป็น id ของเอกสารผ่าน `POST` ไม่ได้ (ถูก dispatch เป็น route
  พิเศษ) — ตั้งชื่อเลี่ยงคำเหล่านี้
- `?format=html` คืน fragment (ไม่ใช่ full page) พร้อม `warnings` — ใช้ตรวจก่อนเขียนได้

### 4.2 Folders

| Method | Path | ทำอะไร | input | status |
|---|---|---|---|---|
| POST | `/folders/*path` | สร้างโฟลเดอร์ (รวม parent) + `_folder.meta.json` ถ้าส่ง meta | body: `{meta?}` (ว่างได้) | 201 · 400 · 409 · 429 · 503 |
| PATCH | `/folders/*path` | merge `_folder.meta.json` | body: meta object (merge shallow) | 200 · 400 · 404 · 429 · 503 |
| DELETE | `/folders/*path` | soft-delete ทั้งโฟลเดอร์เข้า `.trash/` | query: `recursive=true` ถ้าไม่ว่าง | 200 · 400 · 404 · 409 · 429 · 503 |
| POST | `/folders/*path/move` | ย้ายทั้งโฟลเดอร์ + อัปเดตลิงก์ | body: `{to, update_links?}` | 200 · 400 · 404 · 409 · 429 · 503 |

- `409 already_exists` เมื่อมีโฟลเดอร์หรือ `<path>.md` อยู่แล้ว
- `409 folder_not_empty` = โฟลเดอร์มี entry อยู่; ส่ง `?recursive=true` เพื่อย้ายทั้งก้อนเข้า trash
- ก่อนลบโฟลเดอร์ ระบบเก็บ revision ของเอกสารทุกตัวข้างในก่อน
- meta ที่ไม่ผ่าน schema ตอบ `400` **หลัง** สร้างโฟลเดอร์แล้ว (`mkdir` เกิดก่อน validate) — เช่นเดียวกับ body
  ที่เป็น JSON เสีย (`invalid_json`) · ตรวจให้ถูกก่อนเรียกถ้าอยากได้ all-or-nothing

### 4.3 Assets / Media

| Method | Path | ทำอะไร | input | status |
|---|---|---|---|---|
| POST | `/docs/*path/assets` | อัปโหลด multipart เข้า media store | `multipart/form-data` ไฟล์ 1–20 ไฟล์ (ชื่อ field อะไรก็ได้) | 201 · 400 · 413 · 429 · 503 |
| DELETE | `/assets/*path` | ลบ asset = soft-delete เข้า `.trash/` | path ต้องมี segment `assets` | 200 · 400 · 404 · 429 · 503 |

อัปโหลด:

- เขียนที่ `.media/<sha256>.<ext>` — content-addressed: ไฟล์เดิม = ใช้ของเดิม (`deduped: true`)
  ไม่มีทาง collide/ทับกัน และลบโน้ตไม่ทำให้รูปหาย
- response: `{ok, path, assets:[{path:".media/<sha>.<ext>", url:"/media/<sha>.<ext>", bytes, content_type, deduped}]}`
- ชื่อไฟล์เดิมใช้แค่นามสกุล — ไม่ได้เก็บ (ดังนั้น `diagram.png` กับ `diagram-2.png` เนื้อหาเดียวกัน = ไฟล์เดียว)
- validate **ครบทุกไฟล์ก่อนเขียนไฟล์แรก** — พลาดไฟล์เดียว = ไม่มีอะไรลง disk
- ลิมิต: ≤ 20 ไฟล์/คำขอ (`ASSET_MAX_FILES`) · ≤ 25 MB/ไฟล์ (`ASSET_MAX_BYTES`) · ชื่อ ≤ 255 bytes (NAME_MAX)
- ชื่อไฟล์: latin letters, digits, `.` `_` `-`, ช่องว่าง และอักษรไทย (`U+0E00–U+0E7F`) เท่านั้น — regex `^[a-zA-Z0-9._\-\u0E00-\u0E7F ]+$` · ต้องมีนามสกุลใน allowlist
  (`png jpg jpeg webp gif svg mp4 webm mp3 json pdf`) ไม่งั้น `400 asset_type_rejected`
- ไม่เช็คว่าเอกสารปลายทางมีอยู่ — อัปโหลดก่อนเขียนเอกสารได้ (และ `path` ใช้อ้างอิงเท่านั้น)

ลบ: route นี้รับเฉพาะ path ที่มี segment ชื่อ `assets` ตรง ๆ (เช่น `projects/x/assets/pic.png`) และ
นามสกุลต้อง serve ได้ — sidecar `*.meta.json` / `_folder.meta.json` ลบผ่าน route นี้ไม่ได้ (404)

### 4.4 Context

| Method | Path | ทำอะไร | input | status |
|---|---|---|---|---|
| GET | `/context/*path` | md + meta สรุปสั้น สำหรับยัดใส่ prompt | – | 200 · 400 · 404 |

คืน `{ok, path, md, words, bytes, meta:{title, summary, tags, status, created, pinned, authors, agent, relations}}`
— ตัด `theme`/`render` ออกเพราะไม่เกี่ยวกับเนื้อหา · อ่านอย่างเดียว ไม่กิน write rate limit และใช้ได้ใน read-only

### 4.5 Search

| Method | Path | ทำอะไร | input | status |
|---|---|---|---|---|
| GET | `/search` | FTS5 trigram จาก `var/index.db` (ไทย/อังกฤษ, ชื่อ+เนื้อหา) | query: `q` (ไม่ส่ง/ว่าง = ผลว่าง), `limit` (default 20, cap 100), `tag` | 200 · 503 |

คืน `{ok, query, count, hits:[{path, title, tags, snippet, mtimeMs, bytes}]}` · `snippet` มี `[]` รอบคำที่ match
· `q` ว่าง = `hits: []` · index ยังไม่พร้อม = `503 internal_error` (ไม่ใช่ 500 — client แยก "ปิด" จาก "พัง" ได้)
· หลายคำ = AND

### 4.6 System

| Method | Path | ทำอะไร | input | status |
|---|---|---|---|---|
| GET | `/tree` | โครงสร้างโฟลเดอร์/เอกสาร (sidebar) | query: `depth` (≤ 0 = ไม่จำกัด, 1 = ชั้นบนสุด) | 200 |
| POST | `/render` | render md ที่ยังไม่บันทึก (stateless) | body: `{md, path?}` | 200 · 400 · 413 · 429 |
| GET | `/schema` | block registry สำหรับ slash menu / agent | – | 200 |

- `/tree` node โฟลเดอร์: `{type:"folder", path, name, title?, icon?, color?, order?, children[]}` ·
  node เอกสาร: `{type:"doc", id, name, title, pinned, order?}`
- `/render` คืน `{ok, html (fragment), meta, warnings}` — `path` ใช้ resolve relative link/asset ให้ตรงโฟลเดอร์
  (ไม่ส่ง = `untitled`) · ไม่เขียน disk แต่กิน rate limit render 120/min
- `/schema` คืน `{ok, colors, variants, blocks:[{name, kind, attributes, values, example}]}`
  (เฉพาะ block ที่ `implemented` แล้ว)

### 4.7 Trash

| Method | Path | ทำอะไร | input | status |
|---|---|---|---|---|
| GET | `/trash` | list รายการในถัง (purge ของเก่า > 30 วันก่อน) | – | 200 |
| POST | `/trash/:id/restore` | คืนไฟล์กลับที่เดิม | – | 200 · 404 · 409 · 503 |
| POST | `/trash/empty` | **ลบถาวรทั้งถัง** — คนเท่านั้น | – | 200 |

- `TrashItem` = `{id, label, kind (doc/folder/asset), sources:[path เดิม], deletedAt, bytes}`
- `:id` คือ id ของรายการ (ไม่ใช่ path) — เอามาจาก `GET /trash`
- restore ไม่ทับของเดิม: ถ้า path เดิมมีอยู่แล้ว = `409 already_exists` (ต้องย้ายของที่ขวางออกก่อน)
- `empty` ไม่มี MCP tool และไม่มี route ลบถาวรรายรายการ (invariant: ลบถาวร = คนกดเอง)
- retention 30 วัน (`TRASH_RETENTION_DAYS`) — purge เกิดตอนเรียก `GET /trash` และ server purge เองตอนบูต + ทุกชั่วโมง

### 4.8 Revisions

| Method | Path | ทำอะไร | input | status |
|---|---|---|---|---|
| GET | `/revisions/*path` | list revision ของเอกสาร | – | 200 · 400 |
| POST | `/revisions/*path` | กู้ snapshot กลับเป็นไฟล์จริง | body: `{ts?}` (ไม่ส่ง = ล่าสุด) | 200 · 400 · 404 · 429 · 503 |

- list คืน `{ok, path, items:[{ts, at, hasMeta, bytes}]}` เรียงใหม่ → เก่า
- restore เก็บ snapshot ปัจจุบันเป็น revision ก่อนทับ · ไม่ต้องส่ง `If-Match` · กิน rate limit write
- เอกสารไม่เคยถูกแก้ (ไม่มี revision) = `404 not_found`

### 4.9 Health

`GET /health` (นอก `/api`) → `{ok:true}` — liveness เท่านั้น ไม่ตรวจ vault/index

---

## 5. ตัวอย่างจริงด้วย curl

```bash
BASE=http://localhost:7667

# ── อ่านเอกสาร (ได้ md + meta + etag) ─────────────────────────────
curl -s "$BASE/api/docs/projects/doku/design" | jq '{path, etag, title: .meta.title}'

# อ่านแบบ HTML fragment (ตรวจ warning ก่อนเขียน)
curl -s "$BASE/api/docs/projects/doku/design?format=html" | jq '.warnings'

# ── สร้างโฟลเดอร์ + เอกสารใหม่ ────────────────────────────────────
curl -sX POST "$BASE/api/folders/projects/doku"
curl -sX POST "$BASE/api/docs/projects/doku/design" \
  -H 'content-type: application/json' \
  -d '{"md":"# Doku Design\n\nเนื้อหา\n","meta":{"title":"Doku Design","tags":["design"],"status":"active"}}'
# → 201 {"ok":true,"path":"projects/doku/design","etag":"…"}
```

```bash
# ── แก้ทั้งไฟล์ด้วย If-Match ──────────────────────────────────────
ETAG=$(curl -s -D - -o /dev/null "$BASE/api/docs/projects/doku/design" \
  | awk -F': ' 'tolower($1)=="etag"{print $2}' | tr -d '\r')

curl -sX PUT "$BASE/api/docs/projects/doku/design" \
  -H "if-match: $ETAG" -H 'content-type: application/json' \
  -d '{"md":"# Doku Design\n\nเขียนใหม่ทั้งไฟล์\n"}'

# คนอื่นแก้ไปก่อน → 409 + header etag ของค่าล่าสุด
# ไม่ส่ง If-Match → 428 precondition_required
```

```bash
# ── patch: แก้ md + merge meta บาง field ──────────────────────────
# PUT ข้างบนคืน etag ใหม่ → ต้องอ่าน ETag ใหม่ก่อน PATCH (อย่าใช้ตัวเก่า)
ETAG=$(curl -s -D - -o /dev/null "$BASE/api/docs/projects/doku/design" \
  | awk -F': ' 'tolower($1)=="etag"{print $2}' | tr -d '\r')

curl -sX PATCH "$BASE/api/docs/projects/doku/design" \
  -H "if-match: $ETAG" -H 'content-type: application/json' \
  -d '{"meta":{"tags":["design","api"],"agent":{"last_editor":"hermes","generated":true}}}'

# ── อัปโหลด asset (multipart) ─────────────────────────────────────
curl -sX POST "$BASE/api/docs/projects/doku/design/assets" \
  -F "file=@./diagram.png" | jq '.assets[0]'
# → {"path":".media/<sha256>.png","url":"/media/<sha256>.png","bytes":12345,
#    "content_type":"image/png","deduped":false}
# เอา url ไปแทรกใน md:  ![diagram](/media/<sha256>.png)
```

```bash
# ── ค้นหา (FTS) ───────────────────────────────────────────────────
curl -sG "$BASE/api/search" --data-urlencode 'q=ออกแบบ' --data-urlencode 'limit=5' \
  | jq '{count, hits: [.hits[] | {path, title}]}'

# ── ย้ายเอกสาร (อัปเดตลิงก์ทั้ง vault) ────────────────────────────
curl -sX POST "$BASE/api/docs/projects/doku/design/move" \
  -H 'content-type: application/json' \
  -d '{"to":"projects/doku/design-v2","update_links":true}'
# → {"ok":true,"from":"projects/doku/design","to":"projects/doku/design-v2","updated_links":3}
```

```bash
# ── trash: list + restore ─────────────────────────────────────────
curl -sX DELETE "$BASE/api/docs/projects/doku/design-v2" | jq '.trash.id'

curl -s "$BASE/api/trash" | jq '.items[] | {id, label, kind, deletedAt}'

curl -sX POST "$BASE/api/trash/<id>/restore"
# path เดิมมีของอยู่แล้ว → 409 already_exists

# ── revisions: list + restore ────────────────────────────────────
curl -s "$BASE/api/revisions/projects/doku/design-v2" | jq '.items[0:3]'
curl -sX POST "$BASE/api/revisions/projects/doku/design-v2" \
  -H 'content-type: application/json' -d '{"ts":"20250912T100000000Z"}'
```

---

## 6. HTML routes (ไม่ใช่ API — แต่ agent เปิดได้)

env ของ server: `DOKU_VAULT` (default `vault`) · `DOKU_PORT` (7667) · `DOKU_HOST` (0.0.0.0) ·
`DOKU_VAR` (`var`) · `DOKU_NAME` (ชื่อที่แสดง) · `DOKU_CACHE=off` (ปิด disk fragment cache) ·
`DOKU_RESCAN_MS` (fallback rescan index, 0 = ปิด)

| Method | Path | คืนอะไร | หมายเหตุ |
|---|---|---|---|
| GET | `/` | หน้า hub (tree + รายการเอกสาร) | query: `tag`, `sort` |
| GET | `/d/*path` | หน้าเอกสาร (render เต็มหน้า) | header `etag` = `docEtag` · ถ้า path เป็นโฟลเดอร์จริง → หน้าโฟลเดอร์ · ไม่มีอะไร → 404 page |
| GET | `/trash` | หน้าถังขยะ | ไม่มี trash store = 404 |
| GET | `/styleguide` | block showcase + palette | – |
| GET | `/assets/*path` | serve asset path เดิมใน vault | mime allowlist · `?h=<sha256>` ตรงจริง = `immutable` · ไม่งั้น `no-cache` + ETag/304 · CSP `default-src 'none'` |
| GET | `/media/:name` | serve media store | ชื่อต้องเป็น `<64 hex>.<ext>` · `immutable` 1 ปี (ชื่อ = hash) |
| GET | `/static/:name` | `client.js`, `content.css`, `katex.css`, `app.css`, `editor.js` | `?v=<hash>` = immutable 1 ปี · ไม่งั้น `no-cache` + ETag/304 |
| GET | `/sse` | SSE stream | event `reload` = vault เปลี่ยน · `ping` ทุก 25 วินาที |
| GET | `/health` | `{ok:true}` JSON | liveness |

- HTML ทุกหน้าติด CSP (raw script ภายนอกไม่ได้, `frame-src` เฉพาะ YouTube nocookie)
- หน้าที่เป็น HTML เท่านั้นที่ได้ header CSP — SSE/asset/media ไม่
- `GET /d/*path` เป็นทางเดียวที่ได้ ETag แบบหน้าเว็บ — ใช้เป็น fingerprint ว่าเนื้อหาเปลี่ยนไหมได้
- 404 ของ route ที่ไม่รู้จักคืน HTML ไม่ใช่ JSON — agent ที่ parse JSON ต้องยิง `/api/*` เท่านั้น

---

## 7. CLI

`doku <command> [positional…] [--flag value]` — flag แบบมีค่าคือ
`--vault --var --out --meta --port --host --title --tag --path --limit` (ที่เหลือเป็น boolean)

| คำสั่ง | ทำอะไร | flags สำคัญ |
|---|---|---|
| `doku new <path>` | สร้างเอกสารใหม่ (`# title` + `meta.json` ถ้ามี `--title`) | `--title`, `--vault`, `--json` |
| `doku mkdir <path>` | สร้างโฟลเดอร์ (รวม parent) | `--vault`, `--json` |
| `doku render <path>` | render เอกสาร → HTML (stdout) | `--fragment`, `--out`, `--vault`, `--json` |
| `doku render --stdin` | render md จาก stdin (stateless) | `--meta <file>`, `--fragment`, `--vault` |
| `doku check [path]` | validate vault / เอกสารเดียว | `--strict`, `--vault`, `--json` |
| `doku tree` | โครงสร้าง vault (nested + รายการแบน) | `--vault`, `--json` |
| `doku list` | list เอกสาร (mtime ใหม่ → เก่า) | `--tag`, `--vault`, `--json` |
| `doku mv <from> <to>` | ย้ายเอกสาร/โฟลเดอร์ + อัปเดตลิงก์ + `moved_from` | `--vault`, `--var`, `--json` |
| `doku search <q>` | ค้น FTS จาก `var/index.db` (sync ก่อนค้น) | `--tag`, `--limit`, `--vault`, `--var`, `--json` |
| `doku restore <path> [ts]` | กู้จาก revision (ไม่ระบุ ts = ล่าสุด) | `--list`, `--var`, `--vault`, `--json` |
| `doku audit` | อ่าน `var/audit.log` (read-only) | `--path`, `--limit`, `--var`, `--json` |
| `doku build --out <dir>` | export vault → HTML อ่าน offline | `--out` (จำเป็น), `--vault`, `--json` |
| `doku serve` | เปิด web server (spawn server subprocess) | `--port` (7667), `--host` (0.0.0.0), `--vault` |
| `doku mcp` | spawn MCP server ทาง stdio | `--vault` (ส่งเป็น `DOKU_VAULT`) |
| `doku help` / `--version` | usage / `doku 0.0.0` | – |

env ที่ใช้แทน flag ได้: `DOKU_VAULT` (default `vault`), `DOKU_VAR` (default `var`),
`DOKU_PORT` (7667), `DOKU_HOST` (0.0.0.0)

ตัวอย่าง:

```bash
doku new projects/doku/design --title "Doku Design" --json
doku list --tag design --json | jq '.docs[].id'
doku mv projects/doku/design projects/doku/design-v2
doku search "ออกแบบ" --limit 5 --json
doku restore projects/doku/design --list
doku restore projects/doku/design 20250912T100000000Z --json
doku check --strict
doku serve --port 7667
```

### หมายเหตุ `--json`

- **สัญญาคือ parse ได้ทั้ง success และ error** — ไม่ใช่เฉพาะเวลาสำเร็จ
- success: object ที่มี `ok: true` + field ของคำสั่งนั้น เช่น
  `{ok:true, path, title, md}` (new) · `{ok:true, docs:[…]}` (list) · `{ok:true, query, count, hits}` (search)
  · `{ok:true, bytes, content}` (render ไป stdout) · `{ok:true, out, bytes}` (render ด้วย `--out`)
- error: `{ok:false, code, error}` — `code` เป็น vocabulary เดียวกับ API (`already_exists`, `not_found`,
  `path_invalid`, `usage`, `unknown_command`, `internal_error`)
- exit code: `0` สำเร็จ · `1` ทำงานไม่สำเร็จ (`check` เจอ error, ไม่มี revision) · `2` usage ผิด
- `check --json` คืน `{ok, stats, errors, warnings, docs}` — `--strict` ทำให้ warning มีผลต่อ exit code
- `audit --json` คืน `{ok, file, path, count, entries}` · `build --json` คืน `{ok, out, docs, assets, index}`

---

## 8. MCP

`doku mcp` เปิด stdio MCP (newline-delimited JSON-RPC 2.0 · protocol `2024-11-05` · server name `doku`)
env: `DOKU_VAULT` (default `vault`), `DOKU_VAR` (default `var`)
stdout มีเฉพาะ JSON-RPC — log ลง stderr · สำหรับ Hermes ใช้ `bun run packages/mcp/src/index.ts` ตรงก็ได้

| tool | ทำอะไร | พารามิเตอร์ |
|---|---|---|
| `doc_list` | metadata ทั้ง vault (ใหม่ → เก่า) | `folder?`, `tag?`, `q?` (path/title) |
| `doc_read` | อ่านเอกสาร 1 ตัว | `path` (บังคับ), `format` = `md` หรือ `html` (บังคับ) |
| `doc_write` | เขียนเอกสาร | `path`, `md`, `mode` = `create` / `replace` / `patch`, `meta?` |
| `doc_move` | ย้ายเอกสาร + อัปเดตลิงก์ + `moved_from` | `from`, `to`, `update_links?` (default true) |
| `doc_delete` | soft-delete เข้า `.trash/` | `path` |
| `folder_create` | สร้างโฟลเดอร์ (รวม parent) | `path` |
| `folder_list` | tree ของโฟลเดอร์/เอกสาร (ไม่มี dotfile/.trash) | `path?` (ไม่ส่ง = root) |
| `doc_search` | FTS trigram (sync index ก่อนค้น) | `q` (บังคับ), `limit?` (default 20, cap 100) |
| `doc_render` | render md → HTML fragment + warnings | `md` (บังคับ), `meta?` |
| `doc_validate` | validate เอกสารใน vault หรือ md+meta | `path` **หรือ** (`md` + `meta`) |
| `asset_put` | วางไฟล์ลง `.media/<sha256>.<ext>` | `path` (เอกสารเป้าหมาย), `filename`, `content_base64` |
| `template_get` | โครง md ตัวอย่าง + block schema (เหมือน `GET /api/schema`) | – |

พฤติกรรม:

- `doc_write mode=create` = ต้องยังไม่มี (มี `.md`/`.meta.json`/โฟลเดอร์ชื่อเดียวกัน = `already_exists`)
  · `replace` = ทับทั้งไฟล์ (ต้องมีอยู่) · `patch` = ทับ md + merge meta shallow (ต้องมีอยู่)
- `doc_write` (replace/patch) / `doc_delete` / `doc_move` เก็บ revision ของสภาพเดิมก่อนทุกครั้ง (กู้ด้วย `doku restore`)
- `doc_read format=md` คืน `md`, `meta`, `meta_raw`, `etag` · `format=html` คืน `html`, `meta`, `warnings`, `etag`
- `asset_put` คืน `assets:[{path, url, bytes, content_type, deduped}]` — เอา `url` ไปใส่ใน md
  (ตัว `path` ใช้บอกบริบทว่า asset นี้เป็นของเอกสารไหน; ไฟล์ไม่ได้ไปอยู่ใน `assets/` ข้างเอกสารแล้ว)
- `folder_list` คืนเฉพาะโฟลเดอร์ + เอกสาร (asset/sidecar ไม่ขึ้น — ตรงกับ sidebar)
- error ของ tool = ผลลัพธ์ปกติที่ `isError: true` พร้อม `{ok:false, error:{code, message}}`
  (ไม่ใช่ JSON-RPC error) · JSON-RPC error ใช้เฉพาะ protocol (-32600/-32601/-32602/-32603)

ข้อจำกัดที่ **ตั้งใจ** ให้เป็นแบบนี้:

| ทำไม่ได้ผ่าน MCP | ทำได้ทางไหน |
|---|---|
| ลบถาวร / empty trash | ไม่มีทางสำหรับ agent — คนกดในเว็บ (`POST /api/trash/empty`) เท่านั้น (CLI ไม่มีคำสั่งนี้) |
| restore จาก trash หรือ revision | เว็บ / `POST /api/trash/:id/restore` / `doku restore` |
| `If-Match` / ตรวจ version ก่อนเขียน | REST `PUT`/`PATCH` เท่านั้น (MCP = last-write-wins + revision) |
| อ่าน audit log | `doku audit` / อ่าน `var/audit.log` |

---

## 9. สำหรับ AI agent

### ลำดับที่ควรใช้

1. **หาเป้า** — `doc_search` (เนื้อหา) แล้ว `folder_list`/`doc_list` (โครงสร้าง) · ได้ path id มา
2. **อ่านก่อนเขียนเสมอ** — `doc_read format=md` หรือ `GET /api/docs/*path` → ได้ `md` + `meta` + **`etag`**
3. **ตรวจของที่จะเขียน** — `doc_render` / `POST /api/render` (stateless, ได้ warnings) หรือ
   `doc_validate` ถ้าอยากได้ error จริง
4. **เขียน** — เล็กน้อย: `patch` / `PATCH` (md บางส่วน + meta บาง field) ·
   ทั้งไฟล์: `replace` / `PUT` · ใหม่: `create` / `POST`
5. **ยืนยันผล** — response มี `etag` ใหม่; ถ้าต้องเชื่อใจตัวเองอีกชั้น อ่านกลับมาดู `md`

### จัดการ ETag ให้ถูก

- อ่าน ETag จาก header `etag` หรือ field `etag` ใน response **ทุกครั้งก่อน PUT/PATCH**
- เก็บ ETag ไว้ *คู่กับ* เนื้อหาที่อ่านมา — อย่าอ่าน md จากที่หนึ่งแล้วส่ง If-Match จากอีกที่หนึ่ง
- `428` = ลืมส่ง header (แก้ที่ client) · `409` = มีคนแก้ระหว่างนั้น → **อ่านใหม่ รวมการแก้ของเรา
  ลงไป แล้วยิงใหม่ด้วย ETag ใหม่** ห้าม retry ด้วย ETag เก่าและห้ามใช้ `If-Match: *` เพื่อให้ผ่าน
  (นั่นคือการทับงานคนอื่น)
- ถ้าตั้งใจทับจริง ๆ (เช่น regenerate ทั้งไฟล์จาก source อื่น) ใช้ `If-Match: *` อย่าง conscious —
  revision ยังกู้ได้ แต่จะไม่รู้ว่าทับอะไรไป
- REST ที่ไม่มี If-Match (`DELETE`, `move`, folders, assets) ไม่มี conflict detection — ตรวจ existence
  ก่อนเรียกถ้าจำเป็น

### ข้อห้าม / ข้อควรระวัง

- **ห้ามลบถาวร** — ไม่มี route/tool ให้ และไม่ควรพยายามอ้าง `.trash/` ตรง ๆ (path safety ปฏิเสธ)
- **ห้ามเขียนทับโฟลเดอร์ด้วยไฟล์ชื่อเดียวกันแบบไม่ตั้งใจ** — `x.md` กับโฟลเดอร์ `x` อยู่ร่วมกันได้
  แต่ `/d/x` จะเปิดเอกสารเสมอ (doc wins) — ตั้งชื่อให้ต่างกัน
- **ห้ามเดา field ของ meta** — key ที่ไม่รู้จัก = `meta_invalid` ทั้งก้อน; field ที่ใช้ได้มีจำกัด
  ([02](02-content-format.md#field-reference))
- **อย่าใช้ `POST /api/render` แทน `GET /api/docs/*path?format=html`** — render เป็น stateless
  (ไม่ได้อ่าน md/meta จริงจาก vault · `path` ช่วยแค่ resolve link) และกิน rate limit 120/min
- **md > 5 MB / asset > 25 MB จะถูกปฏิเสธ** — แยกเอกสารหรือย่อรูปก่อน
- **อย่าเขียน `.media` เอง** — ให้ upload/`asset_put` เป็นคนคำนวณ sha256 และวางชื่อไฟล์
- **ทุก write มีร่องรอย** — `actor` จะเป็น `mcp`/`curl`/UA ของ client และ `ip` ถ้ามี proxy header;
  ใส่นามของตัวเองใน `meta.agent.last_editor` และ `agent.generated: true` เมื่อสร้างเนื้อหาใหม่
- **SSE ช่วยได้** — ต่อ `/sse` ไว้ถ้าอยากรู้ว่า vault เปลี่ยนระหว่างที่ทำงานอยู่ (event `reload`)

### flow ตัวอย่าง (REST, concurrency-safe)

```bash
# 1) อ่าน + เก็บ ETag
RESP=$(curl -s -D /tmp/h "$BASE/api/docs/projects/doku/design")
ETAG=$(awk -F': ' 'tolower($1)=="etag"{print $2}' /tmp/h | tr -d '\r')
echo "$RESP" | jq -r .md > /tmp/design.md

# 2) แก้ไฟล์ในเครื่อง (patch ทีละจุด)
# ...

# 3) เขียนกลับพร้อม If-Match
curl -sX PUT "$BASE/api/docs/projects/doku/design" \
  -H "if-match: $ETAG" -H 'content-type: application/json' \
  -d "$(jq -n --rawfile md /tmp/design.md '{md:$md}')"
# 409 → กลับไปข้อ 1 (อ่านใหม่) แล้ว merge อีกครั้ง
```
