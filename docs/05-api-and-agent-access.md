# 05 — API & Agent Access

เป้าหมาย: **AI (Hermes/OpenClaw) อ่าน-เขียน-จัดโฟลเดอร์ได้เหมือนคน**
ทุกทางแชร์ `@kairn/core` เดียวกัน

## Identity

ทุก operation อ้างเอกสารด้วย **path ใน vault** เช่น `projects/kairn/design`
ไม่ใช่ slug แบน (ดู [02](02-content-format.md#identity--path))

---

## 1. Filesystem (source of truth)

Agent เขียนไฟล์ตรงๆ ได้เลย:

```
vault/projects/kairn/design.md
vault/projects/kairn/design.meta.json
vault/projects/kairn/assets/diagram.png
```

watcher เห็น → index อัปเดต → หน้าเว็บเปลี่ยนทันที (watcher ข้าม `.trash/**` และ dotfile/dotfolder)
ใช้ tool ที่มีอยู่ (`write`, `patch`, `mv`, `mkdir`) ได้เลย

---

## 2. CLI

```bash
kairn new projects/kairn/design --title "Kairn Design"
kairn mkdir projects/kairn/assets
kairn render projects/kairn/design            # md → html (stdout)
kairn render --stdin                          # stateless
kairn check [path]                            # validate
kairn tree --json                             # โครงสร้าง vault
kairn list --tag design --json
kairn search "คำค้น"
kairn mv old/path new/path                    # ย้าย (เขียน moved_from ให้)
kairn serve --port 7667
kairn build --out dist/                       # export ไว้อ่าน offline
```

ทุกคำสั่งสำคัญมี `--json` ให้ agent parse

---

## 3. REST API

Base: `http://<host>:7667/api`

### Documents

| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/docs?tag=&status=&q=&limit=` | list metadata (ทุก path) |
| GET | `/docs/*path` | คืน `{md, meta}` |
| GET | `/docs/*path?format=html` | rendered HTML fragment |
| POST | `/docs/*path` | สร้างใหม่ `{md, meta?}` |
| PUT | `/docs/*path` | แทนที่ทั้ง doc (ต้องมี `If-Match`) |
| PATCH | `/docs/*path` | แก้ meta บาง field |
| DELETE | `/docs/*path` | ลบ |
| POST | `/docs/*path/move` | `{to, update_links?}` |

### Folders

| Method | Path | ทำอะไร |
|---|---|---|
| GET | `/tree?depth=` | โครงสร้างโฟลเดอร์/ไฟล์ (สำหรับ sidebar) |
| POST | `/folders/*path` | สร้างโฟลเดอร์ |
| PATCH | `/folders/*path` | แก้ `_folder.meta.json` |
| DELETE | `/folders/*path` | ลบ (ต้องว่าง หรือ `?recursive=true`) |
| POST | `/folders/*path/move` | ย้ายทั้งโฟลเดอร์ |

### Assets / อื่นๆ

| Method | Path | ทำอะไร |
|---|---|---|
| POST | `/docs/*path/assets` | upload multipart |
| GET | `/assets/*path` | serve asset (web route ไม่มี `/api` prefix) |
| DELETE | `/api/assets/*path` | ลบ asset |
| POST | `/render` | stateless: `{md, meta?}` → `{html, warnings}` |
| GET | `/search?q=` | FTS search |
| GET | `/schema` | JSON Schema ของ meta + block syntax |
| GET | `/context/*path` | md + meta สรุปสั้น สำหรับใส่ prompt |
| GET | `/health` | liveness |

### ตัวอย่าง

```bash
# อ่าน
curl -s localhost:7667/api/docs/projects/kairn/design | jq

# สร้างโฟลเดอร์ + เอกสาร
curl -sX POST localhost:7667/api/folders/projects/kairn
curl -sX POST localhost:7667/api/docs/projects/kairn/design \
  -H 'Content-Type: application/json' \
  -d '{"md":"# Design\n...","meta":{"title":"Kairn Design","tags":["design"]}}'

# แก้ (optimistic concurrency)
ETAG=$(curl -sI localhost:7667/api/docs/projects/kairn/design | grep -i etag | cut -d'"' -f2)
curl -sX PUT localhost:7667/api/docs/projects/kairn/design \
  -H "If-Match: $ETAG" -H 'Content-Type: application/json' \
  -d '{"md":"# Design (updated)\n..."}'
# 409 ถ้าคนอื่นแก้ไปแล้ว

# preview ก่อนเขียน
curl -sX POST localhost:7667/api/render \
  -d '{"md":":::note{title=\"hi\"}\nhello\n:::}"}' | jq -r .html
```

### Error format

```json
{ "ok": false, "error": { "code": "meta_invalid", "message": "...", "fields": ["tags[2]"] } }
```

codes: `not_found` `already_exists` `meta_invalid` `too_large` `conflict` `asset_type_rejected` `folder_not_empty`

### Concurrency

- ทุก GET คืน `ETag` = hash `{md, meta}`
- PUT/PATCH ต้องส่ง `If-Match` → ไม่ตรง `409` + ETag ปัจจุบัน
- write เป็น atomic: temp → `rename`
- เก็บ revision ก่อนทับที่ `var/revisions/<path>/<ts>.md`

---

## 4. MCP Server

`kairn mcp` เปิด stdio MCP ให้ Hermes เรียกเป็น tool

| tool | input | output |
|---|---|---|
| `doc_list` | `{folder?, tag?, q?}` | list metadata |
| `doc_read` | `{path, format: md\|html}` | เนื้อหา |
| `doc_write` | `{path, md, meta?, mode: create\|replace\|patch}` | result + etag |
| `doc_move` | `{from, to, update_links?}` | result |
| `doc_delete` | `{path}` | result |
| `folder_create` | `{path}` | result |
| `folder_list` | `{path?}` | tree |
| `doc_search` | `{q, limit?}` | hits + snippet |
| `doc_render` | `{md, meta?}` | html + warnings |
| `doc_validate` | `{path}` หรือ `{md, meta}` | errors/warnings |
| `asset_put` | `{path, filename, content_base64}` | url |
| `template_get` | `{}` | โครงตัวอย่าง + schema |

หลักการ: tool น้อย, ชื่อตรง, input แบน — agent ผิดพลาดน้อย

---

## Agent policy

ใช้เองในบ้าน → **AI เขียนได้ตรงๆ ไม่มี publish gate**
ความปลอดภัยพึ่ง 3 อย่างแทน: revision/undo, audit log, ETag conflict

| policy | ค่า |
|---|---|
| AI สร้าง/แก้/ย้าย/ลบไฟล์ | ✅ ผ่าน token (ยกเว้นถ้าปิด write) |
| `agent.last_editor` เติมอัตโนมัติ | ✅ |
| แสดง badge "AI-generated" เมื่อ `agent.generated=true` | ✅ |
| จำกัดขนาด md | 5 MB |
| จำกัด asset/ครั้ง | 25 MB, ≤ 20 ไฟล์/คำขอ |
| ลบ (soft) | AI ลบได้ → ย้ายเข้า `.trash/` (กู้ได้เสมอ) |
| ลบถาวร (empty trash) | **AI ทำไม่ได้** — เฉพาะคนกดในเว็บ/CLI |
| ก่อนทับทุกครั้ง | เก็บ revision → `kairn restore` ได้ |

flow ปกติของ Hermes:
1. `folder_list` / `doc_search` หาเป้า
2. `doc_read` เอา md + meta
3. `doc_render` เช็คก่อน (ได้ warnings)
4. `doc_write mode=patch`
5. ถ้าพลาด → `kairn restore` หรือ `doc_write` ทับกลับ (มี revision)

---

## ตัดสินแล้ว

- MCP = **stdio** (Hermes spawn)
- `move` **auto-update links** + เขียน `moved_from`
- ลบ = **soft-delete** เข้า `.trash/`; ลบถาวรเฉพาะคน
- auth = **ไม่มี** (LAN only) — เผื่อโครงเพิ่ม token ทีหลัง
- port = **7667**

## แพลนไว้ (ยังไม่ทำ)

- webhook แจ้ง agent เมื่อคนแก้เอกสาร
- MCP over HTTP (ถ้าต้องรันเป็น service)
