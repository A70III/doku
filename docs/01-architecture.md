# 01 — สถาปัตยกรรม (Architecture)

เอกสารนี้อธิบายว่า Doku ประกอบจากอะไร แต่ละชั้นรับผิดชอบอะไร ข้อมูลไหลอย่างไร
และอะไรคือข้อตกลงที่ห้ามละเมิด — พอสำหรับให้คนใหม่ (หรือ AI) เปิดอ่านแล้วแก้โค้ดได้อย่างไม่พังของ

- ภาพรวมแบบเร็ว: [README](../README.md)
- ลงมือแก้โค้ด: [10-development](10-development.md)
- สัญญา API: [05-api-and-agent-access](05-api-and-agent-access.md)

---

## 1. หลักการหกข้อที่ตัดสินทุกอย่าง

1. **ไฟล์คือความจริง** — `vault/` เป็น plain Markdown + sidecar ที่ git/backup/editor อื่นอ่านได้
   ฐานข้อมูล (`var/index.db`) และ cache ทั้งหมดเป็น *ดัชนีที่สร้างใหม่ได้* ถ้าลบ `var/` ระบบยังทำงาน
2. **path คือ id** — ตัวระบุเอกสาร = path relative จากราก vault ตัด `.md` ออก
   ไม่มีฟิลด์ `id`/`category` ใน meta — ย้ายโฟลเดอร์ = เปลี่ยน id และระบบ rewrite ลิงก์ให้
3. **render on demand + cache** — ไม่มีขั้น build เนื้อหา เปิดหน้าไหน render หน้านั้นแล้ว cache ตาม hash
4. **sanitize เสมอ** — Markdown ถูกเขียนโดย AI ได้ จึงผ่าน allowlist ทุกครั้ง (รายละเอียด [06](06-security.md))
5. **ลบ = soft delete** — ย้ายเข้า `vault/.trash/` กู้คืนได้ · ลบถาวรมีเฉพาะคน สั่งผ่าน UI/CLI
6. **เขียนแบบ atomic + เก็บ revision ก่อนทับ** — temp → rename และ snapshot ไฟล์เดิมไว้ก่อนทุกครั้ง

---

## 2. องค์ประกอบและทิศทาง dependency

```
packages/core        @doku/core        render · blocks · validate · path · tokens   (isomorphic)
packages/fs-node     @doku/fs-node     VaultFs adapter (node:fs) · index · revisions · audit
packages/server      @doku/server      Hono · SSR pages · REST · SSE · watcher · cache
packages/cli         @doku/cli         คำสั่ง doku (ทุกตัวมี --json)
packages/mcp         @doku/mcp         MCP stdio server
```

**กติกา:** `cli` / `server` / `mcp` → `core` (+ `fs-node`) เท่านั้น
- ห้าม `core` import แพ็กเกจอื่น หรือรู้จัก HTTP / `node:fs`
- ห้าม `cli` / `server` / `mcp` import ข้ามกันเอง
- `fs-node` เป็น leaf: core เรียกผ่าน interface `VaultFs` ที่ประกาศไว้ใน `core/src/fs.ts`

เหตุผล: ทำให้ core ถูกรันได้ทั้งใน test (in-memory fs), CLI, server และ MCP โดยไม่มี side effect

```
      Human UI (SSR)          REST /api/*          CLI             MCP (stdio)
            └──────────────────────┬───────────────┴────────────────┘
                                   ▼
                        ┌─────────────────────┐
                        │  @doku/server       │  routes · SSR · SSE · watcher · cache
                        └──────┬───────┬──────┘
                               ▼       ▼
                  ┌────────────────┐  ┌───────────────────────┐
                  │  @doku/core    │  │  @doku/fs-node        │
                  │  render/blocks │  │  VaultFs (node:fs)    │
                  │  (no HTTP/fs)  │  │  index · revisions    │
                  └────────────────┘  │  audit · trash        │
                                      └──────────┬────────────┘
                                                 ▼
                                      ┌─────────────────────┐
                                      │  vault/ (ไฟล์จริง)  │
                                      │  + var/ (ดัชนี)     │
                                      └─────────────────────┘
```

---

## 3. เส้นทางการไหลของข้อมูล

### 3.1 เปิดหน้าเอกสาร (SSR)

```
GET /d/projects/doku/design
  │
  ├─ app.tsx: normalizeVaultPath()  ← กัน path escape + ตัดชื่อ vault
  │
  ├─ VaultState.get()              ← tree + docs ทั้ง vault (snapshot ใน memory)
  │     └─ ถ้า snapshot ว่าง = walkVault ใหม่ (ข้าม dotfile / .trash)
  │
  ├─ DocRenderer.render(id)
  │     ├─ อ่าน .md + .meta.json
  │     ├─ cache key = sha256(id + md + meta + metaSource + warnings + rendererVersion + theme + listingHash)
  │     ├─ hit  → คืน fragment ที่ render แล้ว
  │     └─ miss → pipeline (§4) แล้วเก็บลง memory LRU + var/cache/
  │
  ├─ DocPage (Hono JSX) → Layout + Sidebar + prose + TOC + colophon
  │
  └─ compress() → gzip → ส่งกลับ (HTML ไม่มี ETag; asset มี)
```

### 3.2 เขียนเอกสาร (REST / MCP / CLI)

```
PUT /api/docs/*path  (ต้องมี If-Match)
  │
  ├─ rate limit (write 60/นาที)
  ├─ ตรวจ ETag ปัจจุบัน → ไม่ตรง = 409 + etag ล่าสุด · ไม่ส่ง = 428
  ├─ fs.writeAtomic(id.md, content)
  │     ├─ อ่านไฟล์เดิม → เก็บ revision (var/revisions/<path>/<ts>.md, rotate 20)
  │     └─ เขียน temp → rename
  ├─ audit.log 1 บรรทัด (append-only)
  ├─ watcher เห็นการเปลี่ยน → VaultState.invalidate() + index sync + SSE broadcast
  └─ คืน { ok, etag ใหม่ }
```

### 3.3 ค้นหา

```
พิมพ์ใน palette
  ├─ กรองในเครื่อง: title + path + tags (paletteDocs จาก /api/docs)
  └─ FTS: GET /api/search?q=…  (debounce 200ms)
        └─ index.db (SQLite FTS5 trigram) → hits[{path,title,snippet}]
```

index ถูก sync แบบ **stat-first**: เทียบ `stamp = mtimeMs:bytes` ของ `.md` + `.meta.json`
ถ้าไม่เปลี่ยน = ไม่เปิดไฟล์ ไม่ hash · sync ห้ามซ้อน (มี `running`/`queued` guard)

---

## 4. Render pipeline (core)

```
markdown text
  → resolve     (wikilink, ลิงก์ .md, asset path)
  → blocks      (remark-directive → registry: callout/figure/tabs/…)
  → sanitize    (rehype-sanitize allowlist)
  → assets      (/media/<hash>, ?h= verification)
  → math/code   (KaTeX เฉพาะเมื่อมีสมการ · Shiki highlight)
  → HTML fragment
```

- **block registry** อยู่ที่ `core/src/blocks/` — 1 ไฟล์ = 1 กลุ่ม block, คืน hast (ไม่ใช่ string)
- **เนื้อหาที่ render แล้ว** ใช้ CSS layer `.doku-prose` / `.doku-block` จาก `core/src/styles/`
  (ไม่ใช้ Tailwind กับเนื้อหา — Tailwind ใช้กับ chrome เท่านั้น)
- **ห้าม block ทำเนื้อหาหาย** — ถ้า parse ไม่ได้ ต้องคงข้อความเดิมไว้ (decision 67–68)

---

## 5. โครงสร้างข้อมูลบนดิสก์

```
vault/
  <folder>/<doc>.md                เอกสาร
  <folder>/<doc>.meta.json         (optional) title/summary/tags/theme/order/pinned/toc
  <folder>/_folder.meta.json       (optional) title/icon/color/order/collapsed
  .media/<sha256>.<ext>            ไฟล์แนบ — content-addressed, dedupe, immutable
  .trash/<id>/<timestamp>/…        ของที่ลบ (manifest + md + meta)
var/
  index.db (+ -wal, -shm)          FTS5 trigram
  cache/<hash>.json                fragment cache (envelope มี rendererVersion)
  revisions/<path>/<ts>.md         ประวัติก่อนทับ
  audit.log                        append-only (ห้าม truncate จาก route/CLI)
```

**ทุกอย่างใต้ `vault/` ที่ขึ้นต้นด้วย `.` คือของระบบ** — watcher/tree/index ข้ามทั้งหมด

---

## 6. Cache และชั้นความเร็ว

| ชั้น | เก็บอะไร | อายุ / การล้าง | ผลถ้าหาย |
|---|---|---|---|
| `VaultState.snapshot` | tree + doc summaries ทั้ง vault | invalidate เมื่อ watcher เห็นการเปลี่ยน | walk ใหม่ (เร็ว) |
| Fragment cache (memory) | HTML ที่ render แล้ว | LRU 200 ชิ้น | render ใหม่ |
| Fragment cache (disk) | เหมือนกัน แบบ JSON | ตาม `rendererVersion` | render ใหม่ |
| Search index | token/trigram ของ md | sync ตาม stamp | rebuild (schema version) |
| Static assets | app.css/content.css/client.js | `?v=<hash>` + immutable 1 ปี | โหลดใหม่ |
| KaTeX CSS | 380KB (เฉพาะหน้าสมการ) | memory หลังโหลดครั้งแรก | อ่านไฟล์ใหม่ |

`DOKU_CACHE=off` ใช้ตอน dev เพื่อไม่ให้ disk cache บังการเปลี่ยน CSS/block

---

## 7. Concurrency และความสอดคล้อง

- **ETag/If-Match**: ทุก write ต้องมี If-Match · ไม่ตรง = 409 พร้อม ETag ปัจจุบัน · ไม่ส่ง = 428
- **atomic write**: เขียน temp แล้ว rename → ผู้อ่านไม่เห็นไฟล์ครึ่ง ๆ กลาง ๆ
- **revision ก่อนทับ**: กู้คืนได้ด้วย `doku restore <path> [ts]` หรือ `POST /api/revisions/*`
- **index sync แบบ serialized**: timer + watcher อาจชนกัน → ใช้ `running`/`queued`
- **SSE**: หลัง write สำเร็จ broadcast ให้หน้าเว็บที่เปิดอยู่ reload ข้อมูล
- **watcher debounce**: 200ms ฝั่ง VaultState + `awaitWriteFinish` ฝั่ง chokidar

---

## 8. ชั้นความปลอดภัย (สรุป — รายละเอียดที่ [06](06-security.md))

```
path จากผู้ใช้ → normalizeVaultPath → safeJoin (resolve + prefix + realpath) → fs
HTML ที่ render → rehype-sanitize (allowlist) → CSP
ไฟล์แนบ → .media/<sha256>.<ext> (ชื่อที่ระบบสร้างเอง ไม่รับชื่อจากผู้ใช้)
การเขียน → rate limit + audit + revision
การลบ → .trash (กู้คืนได้) · purge เฉพาะคน
```

**ไม่มี auth** — ระบบออกแบบสำหรับ LAN เท่านั้น อย่า expose พอร์ตออกอินเทอร์เน็ต

---

## 9. Invariants (ห้ามละเมิด)

1. ไฟล์ใน vault คือความจริง — ทุก cache/index ต้องสร้างใหม่ได้
2. path = id — relative จาก vault, ตัด `.md`, ห้ามมี `#` ในชื่อไฟล์
3. meta เป็น optional sidecar — ไม่มีก็ใช้ค่า default
4. render on demand + cache ตาม hash (md + meta + rendererVersion + theme + …)
5. sanitize ทุก HTML ที่มาจาก markdown (allowlist) — ห้ามเปิด raw HTML
6. path ทุกเส้นผ่าน `safeJoin` (resolve + prefix + realpath)
7. ลบ = soft delete → `.trash` · ลบถาวรเฉพาะคน
8. write atomic + เก็บ revision ก่อนทับ
9. watcher/tree/index ข้าม `.trash` และ dotfile/dotfolder ทั้งหมด

> เพิ่ม invariant ใหม่ → บันทึกใน [08-decisions](08-decisions.md) และอัปเดต [`AGENTS.md`](../AGENTS.md)

---

## 10. จุดขยาย (ถ้าจะเพิ่มของ)

| อยากเพิ่ม | แตะไฟล์ | ต้องอัปเดตอะไรอีก |
|---|---|---|
| หน้าเว็บใหม่ | `web/pages/*.tsx` + route ใน `app.tsx` | a11y (`bun run shot`), `docs/05` ถ้ามี public route |
| REST endpoint | `api/<หมวด>.ts` + `api/index.ts` | `docs/05`, เทสต์ ETag/error |
| Block ใหม่ | `core/src/blocks/<ชื่อ>.ts` | `docs/03`, `/styleguide`, เทสต์ block |
| ไอคอนใหม่ | `bun run gen:icons` | `web/sprite.ts` ถ้าใช้ซ้ำมาก |
| คำสั่ง CLI | `packages/cli/src/index.ts` | `docs/05` §CLI, `--json` contract |
| MCP tool | `packages/mcp/src/tools.ts` | `docs/05` §MCP |
| ค่า config ใหม่ | `packages/server/src/index.ts` | `docs/09` ตาราง env |

---

## 11. ข้อจำกัดที่รู้อยู่

- ไม่มี auth / multi-user — LAN only by design
- `.media/` ไม่มี garbage collection (ไฟล์กำพร้าค้างได้ถ้าเขียน markdown ทิ้งรูป)
- Markdown ที่อ้าง `/media/<hash>` ไม่ portable ไป Obsidian โดยตรง
- MCP ลบถาวรไม่ได้ (โดยเจตนา) — ต้องให้คนสั่ง
- `main` branch อาจล้าหลัง branch ที่ deploy อยู่ — ดู [11-handoff](11-handoff.md)
