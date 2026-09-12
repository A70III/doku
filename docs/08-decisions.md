# 08 — Decisions

บันทึกข้อสรุปทั้งหมด (เดิมคือ open questions) — ถ้ามีคำถามใหม่ให้เพิ่มหัวข้อ "รอเคาะ" ท้ายไฟล์

## ล็อกแล้ว

| # | เรื่อง | ข้อสรุป |
|---|---|---|
| 1 | meta sidecar | **วางข้างไฟล์** (`design.meta.json`) — Obsidian plugin ตัดออกแล้ว จึงไม่มีเหตุต้องซ่อน |
| 2 | trash retention | **auto 30 วัน** หรือคนกดเคลียร์เอง (แล้วแต่ก่อน) |
| 3 | docker | เริ่มหลัง **M4 นิ่ง** |
| 4 | font | **Inter + Noto Sans Thai** (self-host) |
| 5 | default accent | น้ำเงิน **`#3b7df0`** |
| 6 | highlight style | **brush underline** (ไม่ใช่พื้นทึบ) |
| 7 | post-it | **ลบออกทั้งหมด** — ไม่มี block นี้ในระบบ |
| 8 | zen mode + command palette | ทำใน **M3** |
| 9 | asset URL | serve `/assets/<vault-path>?h=<hash>` · upload `POST /api/docs/*path/assets` · delete `DELETE /api/assets/*path` (ดู [05](05-api-and-agent-access.md)) |
| 10 | trash location | `vault/.trash/` — watcher/tree/index ข้าม dotfolder |
| 11 | `created` | ISO 8601 **date-time** |
| 12 | JSON Schema | **generate จาก Zod** (`z.toJSONSchema()`, draft 2020-12) — ไม่ commit, สร้างตอน M0 ด้วย `bun run gen:schema` |
| 13 | folder meta schema | **ไม่แยกไฟล์** — validate ด้วย Zod object เดียวกับ meta |
| 14 | callout | มี `success` ครบ 7 type |
| 15 | figure | ใช้ `width` + `align` (`full` แทน bleed) |
| 16 | MVP | M0 + M1 + M2 |
| 17 | web editor | **CodeMirror 6** |
| 18 | Obsidian plugin | **ตัดออกจาก scope** — เปิด vault ด้วย Obsidian ได้ตรงๆ แบบอ่าน/แก้ไฟล์ ไม่มี plugin |
| 19 | diagram เริ่มต้น | Excalidraw SVG + ASCII; D2 หลัง v1; Kroki เป็น option |
| 20 | vault default | `vault/` |
| 21 | Tailwind setup | อยู่ที่ **M1** — M0 ยังไม่มี app chrome และ `doku render` ต้องไม่พึ่ง build step (preview shell ใช้ CSS layer + token) |
| 22 | node fs adapter | แยก **`packages/fs-node` (`@doku/fs-node`)** — leaf package ที่ cli/server/mcp depend ได้ · `core` ยัง isomorphic (ห้ามผูก `node:fs`) |
| 23 | KaTeX ใน preview | **ไฟล์เดียวจบ** — ฝัง woff2 ทั้งหมดเป็น data URI (~380 KB เมื่อมีสมการ) เพื่อให้เปิด offline ได้ 100% |
| 24 | การซ้อน directive | **`:::` ชั้นนอกต้องยาวกว่าชั้นใน** (เช่น `::::tabs` + `:::tab`) — `doku check` ตรวจเป็น error (`block_nesting_ambiguous`) |
| 25 | `doku serve` | **CLI spawn subprocess** — cli ห้าม import `@doku/server` ตรงๆ (ทิศทาง dependency) · ส่งค่าผ่าน env `DOKU_VAULT`/`DOKU_PORT`/`DOKU_HOST` |
| 26 | HTML cache file | **JSON envelope** ที่ `var/cache/<hash>.json` (fragment + meta + toc + warnings) — เพราะ layout ต้องใช้ meta/toc ต่อ request, เก็บเป็น `.html` ตาม docs/01 เดิมทำไม่ได้ |
| 27 | CSP | `font-src 'self' data:` — เพิ่ม `data:` สำหรับ woff2 ที่ KaTeX ฝัง (ตามข้อ 23), ส่วนอื่นตาม docs/06 เดิม · route ชื่อ `/sse` (event `change` → client reload) · `/static/*` = static ที่ server คุมเอง |
| 28 | content CSS อยู่ที่ core | `tokens` / `prose` / `blocks` อยู่ที่ `packages/core/src/styles/` (export `CONTENT_CSS`) — CLI preview กับ server ใช้ชุดเดียวกันจริง ๆ · chrome ของแต่ละหน้าอยู่ที่ผู้ใช้ (server = Tailwind, CLI = `PREVIEW_CHROME_CSS`) · เหตุผล: CLI import `@doku/server` ไม่ได้ (ทิศทาง dependency) จึงต้องมีที่เดียวใน core ไม่งั้น CSS drift (แก้ docs/03 §10) |
| 29 | block renderer คืน hast | `BlockDefinition.render(ctx)` คืน hast `Element` **ไม่ใช่ HTML string** และสไตล์ใช้ `data-*` ไม่ใช้ inline `style` — เพื่อให้ rehype-sanitize ครอบทุก node ที่ block สร้าง (ตาม invariant “sanitize เสมอ”) · ค่าที่ต้องเป็นตัวเลข (figure width, motion delay/duration, progress) ถูก validate + quantize แล้วแทนด้วย data attribute + CSS rule ที่ generate (ไม่มี inline style) |
| 30 | `==mark=={.สี}` | implement ด้วย remark plugin ที่แปลง **mdast text node** (ไม่ทำ micromark extension) — สีต้องอยู่ใน allowlist `red orange amber yellow green teal blue purple` · `:name` กลางข้อความโดยไม่มี `[...]` (เช่น `bun:sqlite`) = ข้อความธรรมดา ไม่นับเป็น directive |

## รอเคาะ

_ว่าง — ยังไม่มีคำถามค้าง_
