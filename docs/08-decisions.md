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
| 21 | Tailwind setup | อยู่ที่ **M1** — M0 ยังไม่มี app chrome และ `kairn render` ต้องไม่พึ่ง build step (preview shell ใช้ CSS layer + token) |
| 22 | node fs adapter | แยก **`packages/fs-node` (`@kairn/fs-node`)** — leaf package ที่ cli/server/mcp depend ได้ · `core` ยัง isomorphic (ห้ามผูก `node:fs`) |
| 23 | KaTeX ใน preview | **ไฟล์เดียวจบ** — ฝัง woff2 ทั้งหมดเป็น data URI (~380 KB เมื่อมีสมการ) เพื่อให้เปิด offline ได้ 100% |
| 24 | การซ้อน directive | **`:::` ชั้นนอกต้องยาวกว่าชั้นใน** (เช่น `::::tabs` + `:::tab`) — `kairn check` ตรวจเป็น error (`block_nesting_ambiguous`) |

## รอเคาะ

_ว่าง — ยังไม่มีคำถามค้าง_
