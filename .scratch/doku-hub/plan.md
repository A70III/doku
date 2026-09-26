# แผนพัฒนา doku — จาก M3.1 สู่ document hub ที่หมวดไม่จำกัด (v1.1 — round 1 resolve แล้ว)

> อ่านคู่กับ [map.md](map.md) (wayfinder) · tickets อยู่ที่ `issues/` · orientation + gates verify 2026-09-24
> สถานะ: **tickets 01–07 resolve ครบแล้ว — frontier ว่าง = แผนพร้อม implement** (M3.5 เป็นด่านถัดไป)

## 1. จุดหมาย (เคาะแล้ว)

**doku = document hub หลักของบ้าน** — browse ตามหมวดไม่จำกัดผ่านโฟลเดอร์/ซับโฟลเดอร์ · ค้น/pin/sort/tag ·
AI agent ครบ CLI + MCP โดย **format vault และ architecture ของ doku ไม่เปลี่ยน**

- doku นำหน้า — document-hub เป็นแค่ inspiration ไม่ใช่ parity target (ticket 02)
- เนื้อหาเดิมไม่ย้าย — ทำระบบ doku ล้วน (ticket 03) · ลำดับ: M3.5 → M4 → M5
- search: tags ใน palette เลย · FTS ที่ M5 · ไม่ทำ linear-scan (ticket 04)

## 2. ตั้งต้น — doku วันนี้ (ตรวจจากโค้ด + รัน gates จริงแล้ว)

- **เสร็จแล้ว (M0–M3.1):** render pipeline · server + tree + SSE · design system + blocks · folder mgmt + editor + trash + revision + ETag · reading room/writing surface
- **Gates ผลวันนี้:** `bun test` = **323 pass / 0 fail** · `bun run check` = clean · `bun run typecheck` = 4 packages ผ่าน · `doku check examples/vault` = 0 errors / 0 warnings · `doku render` ทำงานจริง
- **Drift ที่พบ:** `AGENTS.md` + `docs/05` สัญญา CLI 13 คำสั่ง (`new mkdir tree list search mv build audit mcp` …) แต่โค้ดมีจริงแค่ **4**: `render check serve restore` → ticket `07-agents-cli-drift`
- **ยังไม่มี:** `packages/mcp` · audit log · REST assets upload/delete + `/context/*path` · index/search (M5) · **หน้าโฟลเดอร์** (`/d/<folder>` ตอนนี้ = 404 เพราะ `resolveDoc` อ่าน `.md` ไม่เจอ) · date grouping · sort controls
- **document-hub (Python :7654):** static HTML 2 คอลัมน์คงที่ (research/docs) · pins ต่อคอลัมน์ (`.pins.json`) · จัดกลุ่มตามวันที่ (วันนี้/เมื่อวาน/สัปดาห์/เดือน/เก่ากว่า) · จัดกลุ่ม topic จาก filename prefix · ค้น filename/title/tags real-time (Ctrl+K) · tag cloud + นับจำนวน · sort (date/name/size) · live stats · word count · auto-TOC · dark mode · meta tags บังคับ 3 ตัว · Lucide · Docker · **ไม่มี orientation layer** (ไม่มี AGENTS.md/decision log)

## 3. Gap analysis — เทียบ document-hub ↔ doku

### มีแล้วเทียบเท่า / ดีกว่า (ไม่ต้องสร้าง)

- tag cloud + นับจำนวน + filter → home มี (`/?tag=`) · live stats → "N เอกสาร · M แท็ก"
- word count + reading time → colophon · auto-TOC → sticky TOC · dark mode → theme cycle/auto
- pin → `meta.pinned` + section "ปักหมุด" (folder sort = pinned → order → name อยู่แล้ว)
- meta tags → `*.meta.json` (richer) · **category = โฟลเดอร์** (path = id — ไม่ใช่ field)
- REST → `/api/docs`, `/api/tree` ฯลฯ (ครอบคลุมกว่า `/api/list` + `/api/pins`)
- **สองคอลัมน์หมวดคงที่ → โฟลเดอร์ไม่จำกัดอยู่แล้วใน sidebar tree** — สิ่งที่ขาดคือ "หน้า" สำหรับ browse ตามหมวด
- blocks · design system · a11y · sanitize · trash/revision/ETag · web editor — document-hub ไม่มี (doku เหนือกว่า)

### ต้องสร้าง (gap จริง)

- **A. หน้าแรกไม่จัดกลุ่มตามหมวด** — flat (ปักหมุด/ล่าสุด/ที่เหลือ) → เพิ่ม sections ต่อโฟลเดอร์ระดับบน
- **B. ไม่มีหน้าโฟลเดอร์** — URL ชี้โฟลเดอร์ = 404, sidebar toggle อย่างเดียว → `FolderPage` ไล่ได้ทุกความลึก (หัวใจของ "หมวดไม่จำกัด")
- **C. ไม่มี date grouping** labels (วันนี้/เมื่อวาน/…)
- **D. ไม่มี sort controls** (date/name/size — size ต้องเพิ่ม `bytes` ใน `DocSummary` ซึ่งตอนนี้ไม่มี)
- **E. palette ไม่ค้น tags** (document-hub ค้น; `paletteDocs` มี tags อยู่แล้ว — แก้ client อย่างเดียว)
- **F. CLI ขาด 9 คำสั่ง** ที่ docs สัญญา (`new mkdir tree list search mv audit mcp` + `build`)
- **G. ไม่มี MCP** (`packages/mcp` ยังไม่เกิด)
- **H. REST ขาด** assets upload/delete + `/context/*path`
- **I. ไม่มี audit log** (`var/audit.log` JSONL ตาม docs/06)
- **J. search เต็มรูปแบบ** (FTS) → M5
- **K. docker/backup** → M5 (decision 3: docker หลัง M4 นิ่ง)

### ไม่เอา (พร้อมเหตุผล)

- จัดกลุ่มด้วย filename prefix — hack ของระบบที่ไม่มีโฟลเดอร์; โฟลเดอร์ทำแทนแล้ว (ชน invariant path = id ถ้าเพิ่ม field)
- สีคอลัมน์ไล่เฉดม่วง/น้ำเงิน + การ์ดกริดหน้าแรก — ขัด docs/08 ข้อ 31–33 (Digital Archivist) และเป็น tell ของ AI design
- คอลัมน์คงที่ 2 ช่อง — ต้อง scale เป็น N; ใช้ sections/catalogue ตามทิศทางที่ล็อกไว้แทน
- meta tags บังคับแบบ DH-STANDARD — `meta.json` optional คือ invariant ข้อ 3
- no-build/vanilla constraint — doku คง stack ที่ล็อกใน docs/04

## 4. หลัก architecture safety — checklist บังคับกับทุกงานในแผนนี้

1. **path = id · หมวด = โฟลเดอร์เท่านั้น** — grouping = derive จาก tree ที่มีอยู่ ห้ามเพิ่ม `meta.category`
2. **core isomorphic** — งาน UI ทั้งหมดอยู่ `packages/server` (`state`/`tree` มีข้อมูลครบ) · ถ้าสกัด logic ใหม่ → ใส่ `core` ในรูปแบบ pure รับ fs adapter เท่านั้น
3. **ทิศทาง dependency คงเดิม** — ห้าม `cli`/`server`/`mcp` import กันเอง → `doku mcp` = spawn subprocess (แบบ `doku serve` · decision 25)
4. **write ทุกทางเดินผ่าน handler เดิม** — REST/MCP ใหม่ใช้ guard เดิม (`safeJoin`, ETag/`If-Match`, rate limit, revision, atomic, soft-delete) — ห้ามเขียน vault ตรงคนละแบบ
5. **watcher/tree/index ข้าม `.trash` + dotfile** — FolderPage ต้องไม่โชว์ของพวกนี้
6. **cache key คงเดิม** (`docs/08` ข้อ 44) · sanitize เสมอ
7. **Tailwind = chrome เท่านั้น** — content ใช้ CSS layer `.doku-prose`/`.doku-block` เดิม
8. **Zod = single source** — JSON Schema มาจาก `z.toJSONSchema()` เท่านั้น
9. **Design = Digital Archivist** — section ใช้ masthead + hairline + tabular figures · folder color จาก `_folder.meta.json.color` เป็น tint เล็ก ๆ · ห้ามกริดการ์ด/gradient
10. **Gates 5 ตัวเขียว + CJK scan** ก่อน merge/ship เสมอ

## 5. Milestones

### M3.5 — Hub browse: หมวดไม่จำกัด (ใหม่ · ~2–3 วัน)

| id | งาน | แตะที่ไหน |
|---|---|---|
| 3.5.1 | Home แบ่ง section ต่อ top-level folder (นับจำนวน · pin ข้างใน · "ดูทั้งหมด →") | `pages.tsx` (HomePage) — ข้อมูลจาก `state.docs` + `tree` ที่ส่งมาแล้ว |
| 3.5.2 | **FolderPage** — `GET /d/*path` ถ้า path เป็นโฟลเดอร์ → header (breadcrumb+title+stats ไม่เพิ่มปุ่ม) + subfolders ก่อน + docs (pinned→date groups) · ยึด doku design · **ห้ามชื่อซ้ำ `x/`+`x.md` → `doku check` เตือน** (ticket 06) | `app.tsx` branch ใหม่ + JSX page ใหม่ (แยกไฟล์ อย่าโปะ `pages.tsx`) + `core/check.ts` เพิ่ม duplicate-name check |
| 3.5.3 | Date grouping labels (วันนี้/เมื่อวาน/≤7วัน/≤30วัน/เก่ากว่า) จาก `mtimeMs` | server-render |
| 3.5.4 | Sort — SSR `?sort=` mtime/name/**size** (ticket 05 เคาะแล้ว: เพิ่ม `bytes` ใน `DocSummary`) + date grouping server-render (ใช้ทั้ง home และ FolderPage) | `pages.tsx` + `tree.ts` (DocSummary) |
| 3.5.5 | Palette ค้น tags ด้วย | `client.ts` (ฝั่ง client ล้วน — `paletteDocs` มี tags แล้ว) |
| 3.5.6 | Design pass + verify | `bun run shot` 2 ธีม + a11y + rhythm · CJK scan |

- **DoD:** สร้างโฟลเดอร์ซ้อน 3 ชั้นบนสุด → browse ได้ครบจากหน้าแรก/หน้าหมวด · date group + sort ทำงาน · Ctrl+K หาเจอจาก tag · gates เขียว
- **สถานะ 2026-09-24: เสร็จแล้ว** — 3.5.1–3.5.6 done · verifier ทุก slice PASS (S1–S6, S2/S6 ผ่าน round 2/3) · gates 5 + CJK 0 · DoD รันจริง 15/15 (`var/m35-dod.ts`: browse 3 ชั้น · `?sort=` ทั้งสองหน้า · Ctrl+K หา tag) · decision ใหม่ docs/08 ข้อ 72–73 · build fix: `bun x` แทน `bunx` (package.json + scripts/dev.sh)
- **Design note:** หน้า FolderPage ต้องแก้ edge `x/` vs `x.md` (ticket 06)

### M4 — AI access: ปิดงานค้าง + ช่องทาง agent (~1.5–2 วัน · ตาม docs/07 + ขยาย)

- REST: `POST /api/docs/*path/assets` · `DELETE /api/assets/*path` · `GET /api/context/*path`
- **Q7 (asset filename charset) เคาะทิ้งตอนนี้** — enforce regex ของ docs/06 ตอน upload API เกิด
- audit log: `var/audit.log` JSONL (schema ตาม docs/06) + `doku audit --path [--json]`
- **`packages/mcp` (`@doku/mcp`)** — tools ตาม docs/05 §4 ครบ 12 ตัว (รวม `doc_search` ที่เติมตอน M5 S3) · dep = `core` + `fs-node` เท่านั้น
- CLI เพิ่ม: `new` `mkdir` `tree --json` `list --tag` `mv` `audit` `mcp` (`search` แล้วแต่ ticket 04) — **หมายเหตุ architecture:** logic `move` + auto-update links ตอนนี้อยู่ใน `api.ts` (server) → ต้องสกัดลง `core` ในรูปแบบ pure ก่อน CLI ใช้ได้ · มี test คู่ก่อน refactor
- `doku mcp` = spawn subprocess (ห้าม `cli` import `mcp` — ทิศทาง dependency)
- sync `AGENTS.md` ในคอมมิตเดียวกับที่คำสั่งเป็นจริง (ticket 07)
- **DoD (จาก docs/07):** Hermes สร้าง/แก้/ย้าย/จัดโฟลเดอร์ผ่าน MCP ได้ (ลบได้แค่ soft — ไม่มี tool ลบถาวร) · audit อ่านย้อนหลังได้ · gates เขียว
- **สถานะ 2026-09-24: เสร็จแล้ว** — S1–S5 done · verifier PASS ทุก slice (audit-log = batch round-2 · fix 1 รอบสำหรับ 2 low) · DoD รันจริง · gates 5 เขียว + CJK 0 · decision docs/08 ข้อ 74 + 75–80 · AGENTS/docs sync อยู่ในคอมมิต close

### M5 — Index, search, deploy (~2 วัน · ตาม docs/07)

- Drizzle + `bun:sqlite` FTS5 · incremental index ตาม file hash
- `GET /api/search` + palette upgrade (full-text) + MCP `doc_search` + CLI `search`/`list --tag` (ถ้ายังไม่ได้ทำ)
- backlinks + wikilink resolve (link table)
- `doku build --out dist/` · วางโครง `Dockerfile` + `docker-compose.yml` (decision 3: หลัง M4 นิ่ง) · backup script
- **สถานะ 2026-09-24: เสร็จแล้ว** — S1 drizzle-index · S2 search-api · S3 search-facets · S4 backlinks · S5 build-docker-backup ทุก slice verifier PASS (round-2 หลัง fix 2 low) · DoD รันจริง (FTS ไทย+watcher · backlinks สด · build 0 root-absolute URL · backup 4/4) · gates 5 เขียว + CJK 0 · decision docs/08 ข้อ 75–80

### Content migration — OUT OF SCOPE (เคาะแล้ว: ticket 03)

- ไม่ย้าย ไม่ยุ่งกับเอกสารเดิม — effort นี้ทำระบบ doku ล้วน · document-hub = archive อ่านอย่างเดียว

## 6. ลำดับ & dependencies

```
M3.5 (hub) ──► M4 (agent) ──► M5 (index/search/deploy)
                  │
                  └── ticket 07 (drift) แก้คู่กันแล้ว (AGENTS.md sync แล้ว)
tickets 05 + 06 (ปลดบล็อกแล้วจาก 01) = round 2 ที่กำลังคุย
```

ข้อเสนอ: **M3.5 → M4 → M5** (hub ไม่พึ่งใคร + เป็นเป้าหมายที่เห็นชัด · M4 ปิดของที่ "ยังไม่เสร็จ" · M5 พึ่ง write path นิ่งก่อน) — ยืนยัน/สลับใน ticket 02

## 7. ความเสี่ยง/จุดพังงable (จาก Profile hotspots)

- **`api.ts` move logic ต้องสกัดลง `core`** → regression เสี่ยงเรื่อง ETag/link-update — บังคับมี test คู่ก่อน refactor
- **`pages.tsx` (981 บรรทัด) ใหญ่อยู่แล้ว** → FolderPage = ไฟล์ใหม่ separate
- **Home grouping = layout เปลี่ยน** → `bun run shot` before/after เทียบ 2 ธีม + rhythm/a11y
- **MCP = attack surface ใหม่** → ทุก tool ผ่าน `safeJoin` + path normalize · soft-delete เท่านั้น (invariant 7) · ไม่มี tool ลบถาวรเด็ดขาด
- ~~`x/` vs `x.md`~~ เคาะแล้ว (ticket 06): ห้ามชื่อซ้ำ + `doku check` เตือน — ไม่ต้องเดา URL semantics

## 8. Verification

- Merge gate: `bun test` · `bun run check` · `bun run typecheck` · `bun run shot` (2 ธีม + a11y + rhythm) · `bun run doku check --vault examples/vault` = 0
- Content/UI ก่อน ship: CJK scan (regex `[\u4e00-\u9fff]`) = 0
- ทุก milestone มี DoD ข้างบน · docs sync (`docs/07` + `docs/08` + `AGENTS.md`) ในคอมมิตเดียวกับงาน — **แต่เลื่อนไปทำหลัง ticket resolve** (layer ห้ามนำหน้า decision)
