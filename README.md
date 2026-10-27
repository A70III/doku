# Doku — document hub ส่วนตัวบน home server

คลังเอกสาร Markdown ที่เก็บเป็นไฟล์ธรรมดาในโฟลเดอร์ (vault) แล้ว render เป็นหน้าเว็บอ่านสบาย
เปิดให้คนและ AI ใช้ช่องทางเดียวกัน: **ไฟล์ใน vault · REST API · CLI · MCP**

> เป้าหมาย: อ่านและค้นโน้ตเก่าได้เร็ว เขียนเพิ่มได้ทันที และไม่ถูกล็อกไว้กับแอปใดแอปหนึ่ง
> ข้อมูลทั้งหมดอยู่ในดิสก์ เป็น plain text ที่ git ได้ สำรองได้ และเปิดด้วย editor อื่นได้

- **LAN only** — ไม่มี auth ไม่ publish ออกอินเทอร์เน็ต (ใช้ในบ้าน/เซิร์ฟเวอร์ตัวเอง)
- **server-render** — เปิดหน้าเร็ว ไม่ต้องรอ JS ก่อนเห็นเนื้อหา
- **ไฟล์คือความจริง** — ฐานข้อมูลและ cache เป็นเพียงดัชนีที่สร้างใหม่ได้เสมอ

---

## เริ่มใช้ใน 60 วินาที

```bash
bun install
bun run dev            # → http://localhost:7667  (server + Tailwind watch)
```

ครั้งแรกต้องมี artifact สองไฟล์ (gitignore ไว้ เพราะ generate ใหม่ได้):

```bash
bun run build:css      # Tailwind → packages/server/public/app.css
bun run build:editor   # CodeMirror → packages/server/public/editor.js
```

หรือรันบน home server ด้วย Docker:

```bash
docker compose up -d --build
docker compose ps      # healthy = /health ตอบ
```

รายละเอียด deploy · env · backup · troubleshooting: [docs/09-operations.md](docs/09-operations.md)

---

## ทำอะไรได้

| งาน | วิธี |
|---|---|
| อ่านเอกสาร | เปิด `/` แล้วเลือกจากสารบัญ หรือกด `/` (slash) / `⌘K` เพื่อค้น |
| เขียน/แก้ | คลิกที่เนื้อหาแล้วพิมพ์ได้เลย (autosave) · ไม่มีโหมดแยก |
| สร้างเอกสาร/โฟลเดอร์ | ปุ่ม `+` ใน sidebar หรือ `Ctrl+N` |
| ค้นหา | palette เดียว: ชื่อ · path · แท็ก · เนื้อหา (FTS5 trigram รองรับภาษาไทย) |
| แนบรูป | ลากหรือ paste รูปเข้าเนื้อหา → เก็บเป็น `.media/<sha256>.<ext>` |
| จัดการโฟลเดอร์ | drag & drop ในสารบัญ · ตั้งชื่อ/ไอคอน/สีได้ |
| ถังขยะ | ลบ = ย้ายเข้า `.trash` · กู้คืนได้ · ลบถาวรเฉพาะคน |
| ให้ AI ทำงานด้วย | REST `/api/*` · CLI `doku ...` · MCP `doku mcp` |

คีย์ลัดทั้งหมดกด `?` ในแอป

---

## ภาพรวมสถาปัตยกรรม

```
                        ┌──────────────────────────────────────────┐
   คน / AI / agent ────► │  ช่องทางเข้า 4 ทาง                        │
                        │  1) แก้ไฟล์ใน vault ตรง ๆ                 │
                        │  2) REST /api/*                           │
                        │  3) CLI  doku ...                         │
                        │  4) MCP  doku mcp                         │
                        └───────────────┬──────────────────────────┘
                                        ▼
                        ┌──────────────────────────────────────────┐
                        │  @doku/server  (Hono + JSX)               │
                        │  routes · SSR pages · SSE · watcher       │
                        │  cache (memory + disk) · search index     │
                        └───────┬───────────────────────┬──────────┘
                                ▼                       ▼
                    ┌───────────────────┐   ┌───────────────────────┐
                    │  @doku/core       │   │  @doku/fs-node        │
                    │  render · blocks  │   │  VaultFs (node:fs)    │
                    │  resolve · check  │   │  index.db · revisions │
                    │  sanitize · tokens│   │  audit.log · trash    │
                    └───────────────────┘   └──────────┬────────────┘
                                                       ▼
                                            ┌────────────────────┐
                                            │  vault/ (ไฟล์จริง)  │
                                            │  *.md · *.meta.json │
                                            │  .media/ · .trash/  │
                                            └────────────────────┘
```

| แพ็กเกจ | หน้าที่ | หมายเหตุ |
|---|---|---|
| `packages/core` | render pipeline, block registry, validate, path rules, design tokens | isomorphic — ไม่รู้จัก HTTP/fs จริง |
| `packages/fs-node` | adapter ของ `node:fs`: เขียน atomic, path safety, index, revisions, audit | leaf ที่ core เรียกผ่าน interface |
| `packages/server` | Hono app, หน้าเว็บ SSR, REST, SSE, watcher, cache | compose ทุกอย่างเข้าด้วยกัน |
| `packages/cli` | คำสั่ง `doku` สำหรับคนและ agent | ทุกคำสั่งมี `--json` |
| `packages/mcp` | MCP stdio server | ใช้ core + fs-node ผ่าน server tools |

**กติกาทิศทาง dependency:** `cli` / `server` / `mcp` → `core` (+ `fs-node`) เท่านั้น
ห้าม import ข้ามกันเอง และ `core` ห้าม import แพ็กเกจอื่น

---

## ข้อมูลอยู่ที่ไหน

```
vault/                     ← source of truth (bind mount เข้า container)
  projects/doku/design.md
  projects/doku/design.meta.json   ← optional sidecar
  .media/<sha256>.<ext>            ← รูป/ไฟล์แนบ (content-addressed, dedupe เอง)
  .trash/<id>/                     ← ของที่ลบ (กู้คืนได้)
var/                       ← สร้างใหม่ได้ทั้งหมด (named volume `doku-var`)
  index.db (+WAL)                  ← FTS5 trigram
  cache/                           ← fragment cache (JSON)
  revisions/<path>/<ts>.md         ← ประวัติก่อนทับ (rotate 20/ไฟล์)
  audit.log                        ← append-only
```

ถ้าลบ `var/` ทั้งก้อน ระบบยังทำงานได้ — แค่ค้นหาช้าครั้งแรกและ cache ว่าง

---

## เอกสาร

เริ่มที่ **[docs/00-start-here.md](docs/00-start-here.md)** — มีเส้นทางการอ่าน 4 แบบ
(ผู้ใช้ · ผู้ดูแลระบบ · คนแก้โค้ด · AI agent) และตารางว่าแต่ละไฟล์ตอบคำถามอะไร

| ไฟล์ | ตอบคำถาม |
|---|---|
| [00-start-here](docs/00-start-here.md) | ควรอ่านอะไรต่อ เลือกตามบทบาท |
| [01-architecture](docs/01-architecture.md) | ระบบประกอบจากอะไร ข้อมูลไหลอย่างไร |
| [02-content-format](docs/02-content-format.md) | รูปแบบไฟล์/โฟลเดอร์/meta/ลิงก์ |
| [03-blocks-and-design-system](docs/03-blocks-and-design-system.md) | block ทั้งหมด + token/layout (เล่มอ้างอิง) |
| [04-tech-stack](docs/04-tech-stack.md) | ทำไมเลือก stack นี้ |
| [05-api-and-agent-access](docs/05-api-and-agent-access.md) | REST/CLI/MCP ครบทุก endpoint |
| [06-security](docs/06-security.md) | sanitize, path safety, CSP, audit |
| [07-roadmap](docs/07-roadmap.md) | แผน Milestone M0–M5 (ประวัติ) |
| [08-decisions](docs/08-decisions.md) | decision log ทุกข้อที่ล็อกแล้ว |
| [09-operations](docs/09-operations.md) | deploy, env, backup, monitoring, แก้ปัญหา |
| [10-development](docs/10-development.md) | ทำงานกับโค้ด: gates, แผนที่ไฟล์, สูตรเพิ่มของ |
| [11-handoff](docs/11-handoff.md) | ส่งต่อให้คน/AI ตัวต่อไป |

สำเนาเอกสารชุดเดียวกันอยู่ใน doku เองที่ `projects/doku/manual/` (sync ด้วย `bun run docs:sync`)

---

## คุณภาพ / gates

```bash
bun test                              # unit + regression
bun run typecheck                     # tsc ทุกแพ็กเกจ
bun run check                         # Biome lint + format
bun run build:css && bun run build:editor
bun run shot                          # screenshot 2 ธีม + a11y + rhythm
bun run doku check --vault examples/vault
```

ทุกข้อต้องผ่านก่อน commit — ดูรายละเอียดที่ [docs/10-development.md](docs/10-development.md)

## สถานะ

M0–M5 เสร็จและใช้งานจริงบน home server: render · validate · serve · editor · REST · MCP ·
search + backlinks · audit · static export · media store · Docker deploy

## License

ดู [LICENSE](LICENSE)
