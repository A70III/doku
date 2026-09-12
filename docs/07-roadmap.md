# 07 — Roadmap

หลัก: **ทุก milestone รันได้จริง** ไม่มี "โครงสร้างเสร็จแต่ใช้ไม่ได้"

ล็อกแล้ว: ใช้เองในบ้าน · LAN ไม่มี auth · ไม่ publish · monorepo Bun+Hono+TS · vault ของตัวเอง
· soft-delete (AI ลบถาวรไม่ได้) · port 7667 · dev บนเครื่อง ยังไม่ทำ docker

---

## M0 — Static render

- [x] workspace setup (`packages/core` + `tsconfig.base` + Biome)
- [x] `doku render <path>` + `--stdin`
- [x] resolve path → md + optional meta.json (Zod schema)
- [x] unified: remark-parse + gfm + directive + rehype
- [x] rehype-slug + autolink + **rehype-sanitize**
- [x] **Shiki** (`@shikijs/rehype`) + **KaTeX** (rehype-katex)
- [x] layout HTML + typography — `doku render` คืนหน้า HTML เดียวจบ (preview shell + `.doku-prose` + token ตาม [03](03-blocks-and-design-system.md))
      · **Tailwind ย้ายไป M1** ตาม [08 ข้อ 21](08-decisions.md) (M0 ไม่มี app chrome และ render ต้องไม่พึ่ง build step)
- [x] asset rewrite
- [x] `doku check`

**เสร็จ:** `doku render projects/doku/design > out.html` เปิด browser สวย มี code สี + สมการ

---

## M1 — Server + vault tree

- [x] Hono server: `/`, `/d/*path`, `/assets/*path` (เพิ่ม `/static/*` `/sse` `/health`; M2 เพิ่ม `/styleguide`)
- [x] **sidebar file tree** (collapsible) + Tailwind chrome
- [x] home: pinned / recent / tag filter
- [x] HTML cache ตาม content hash (in-memory + `var/cache/<hash>.json` — docs/08 ข้อ 26)
- [x] watcher (chokidar) + **SSE** live-reload
- [x] `doku serve` (default :7667 — spawn subprocess ตาม docs/08 ข้อ 25)

**เสร็จ:** วางโฟลเดอร์+ไฟล์ → tree ถูก → แก้ md แล้ว refresh เอง (ทดสอบแล้ว)

---

## M2 — Design system + custom blocks

- [x] design tokens + prose layer `.doku-prose` (ตาม [03](03-blocks-and-design-system.md)) — ไฟล์ `tokens`/`prose`/`blocks` อยู่ที่ `packages/core/src/styles/` ([08 ข้อ 28](08-decisions.md))
- [x] block registry `packages/core/src/blocks/` (data-block/data-variant — [08 ข้อ 29](08-decisions.md))
- [x] callout (7 type), figure, motion
- [x] mark สี, badge, details, tabs, grid, card
- [x] kv, stats, progress, steps, timeline
- [x] diagram: Excalidraw SVG (figure) + ASCII (D2 เก็บไว้หลัง v1 — [08 ข้อ 19](08-decisions.md))
- [x] reading UX: progress bar, TOC active, heading anchor (+ copy code, figure zoom)
- [x] `prefers-reduced-motion` + print styles
- [x] **`/styleguide`** render ทุก block (คุมดีไซน์ + ให้ AI ดู) + golden snapshot test
- [x] sanitize allowlist ครบ (รวม `progress`, aria state; ยังไม่ให้ `style`)

**เสร็จ:** `examples/vault/projects/doku/design` ใช้ทุก block → `doku check` = 0 errors/0 warnings
และเทียบกับ `/styleguide` ได้

---

## M3 — Folder mgmt + editor

- [ ] create / rename / move / delete (UI + API)
- [ ] `_folder.meta.json` (order/icon/color) + drag-drop
- [ ] **trash**: soft-delete list / restore / empty (คนเท่านั้น)
- [ ] revision ต่อ write + `doku restore`
- [ ] ETag / `If-Match` / 409
- [ ] **web editor** (CodeMirror 6 + live preview) + meta form
- [ ] reading UX เพิ่ม: **zen mode** + **command palette (Ctrl+K)**

**เสร็จ:** จัดโฟลเดอร์ + เขียน/แก้เอกสารในเว็บได้ ไม่ต้องพึ่ง editor ภายนอก

---

## M4 — AI access

- [ ] REST ครบ (docs/folders/assets/render/tree/trash)
- [ ] `/context/*path`, `/schema` (จาก Zod)
- [ ] audit log
- [ ] `doku mcp` (stdio) tools ตาม [05](05-api-and-agent-access.md) — ยกเว้น `doc_search` (รอ index ที่ M5)

**เสร็จ:** Hermes สร้าง/แก้/จัดโฟลเดอร์ผ่าน MCP ได้ (ลบได้แค่ soft)

---

## M5 — Index, search, deploy structure

- [ ] **Drizzle** schema + migration (bun:sqlite) + FTS5
- [ ] incremental index ตาม file hash
- [ ] `/api/search` + หน้า search + MCP `doc_search`
- [ ] backlinks + wikilink resolve
- [ ] `doku build` export offline
- [ ] **วางโครง docker** (`Dockerfile` + `docker-compose.yml` + volume) — ยังไม่ build
- [ ] backup script (auto-git vault)

**เสร็จ:** ค้นหาเร็ว, backlinks ทำงาน, โครง deploy พร้อมค่อยเปิดใช้

---

## หลัง v1

- D2 diagram code block (server-side SVG + cache)
- Kroki gateway (ตอนมี docker)
- graph view ของ backlinks
- comments / annotations
- kanban / task persist
- semantic search (`sqlite-vec`)
- PDF export
- token auth (เมื่อออกนอก LAN)

---

## รอเคาะ

ย้ายไปรวมที่ [08 — Decisions](08-decisions.md) ที่เดียว (ตอนนี้ยังไม่มีคำถามค้าง)

## ประมาณการ

| milestone | scope |
|---|---|
| M0 | ~1–1.5 วัน (unified + shiki + katex) |
| M1 | ~1.5–2 วัน (server + tree + Tailwind chrome) |
| M2 | ~2–3 วัน (blocks + CSS) |
| M3 | ~3–4 วัน (folder mgmt + trash + editor) |
| M4 | ~1.5–2 วัน |
| M5 | ~2 วัน |

MVP ใช้จริง = **M0 + M1 + M2**
