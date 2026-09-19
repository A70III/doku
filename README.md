# Doku

Document hub ส่วนตัวบน home server — เขียน Markdown เก็บเป็น vault (โฟลเดอร์ซ้อนได้เหมือน Obsidian), render เป็น HTML ตอนเปิดดู, คนและ AI อ่าน-เขียนได้

**ไม่มีการ publish ออกนอก** — ใช้เก็บและอ่านเองในบ้าน (LAN only ไม่มี auth)

```
vault/                        ← vault ของตัวเอง (เปิดด้วย Obsidian ได้)
  projects/doku/design.md
  projects/doku/design.meta.json   ← optional
  projects/doku/assets/diagram.svg
  daily/2025-09-12.md
        │
        ▼
  Document Renderer  →  HTML  (:7667)
```

## Stack

**Bun + Hono + TypeScript + unified + Drizzle/bun:sqlite + Hono JSX + Tailwind v4 + Shiki + KaTeX**
mono repo, server-render, custom block ผ่าน remark-directive

## หลักการ

1. **ไฟล์คือความจริง** — vault เป็น plain text, git ได้
2. **โฟลเดอร์คือโครงสร้าง** — ซ้อนได้ไม่จำกัด คล้าย Obsidian
3. **meta.json เป็น optional** — ไม่มีก็ใช้ default จากชื่อไฟล์/โฟลเดอร์
4. **ไม่ต้อง build เนื้อหา** — render on demand + cache (มี build แค่ CSS/Tailwind)
5. **คนกับ AI เท่ากัน** — เขียนไฟล์ตรงๆ / REST / MCP (ลบถาวรเฉพาะคน)
6. **mono repo** — core เดียว ใช้ร่วม CLI, server, MCP

## ทิศทาง UI — Digital Archivist

หน้าตาแบบ **ห้องสมุดดิจิทัลร่วมสมัย** — สงบ · editorial · typography-first · อ่านเป็นหลัก
ไม่ใช่ generic SaaS และไม่ใช่ futuristic dashboard · เป้าหมายคือ minimal ที่ **ไม่ generic**

- **Typography นำ hierarchy** — ขนาด/น้ำหนัก/จังหวะ ก่อนจะไปพึ่งกล่อง สี หรือ icon
- **Content over chrome** — navigation/control ห้ามดังกว่าเนื้อหาที่มันห่ออยู่
- **Card ไม่ใช่ default container** — ไต่จาก whitespace → hairline → typography → indent → พื้นหลังจาง แล้วจึงถึง card
  (ใช้ card เมื่อเนื้อหาเป็น object อิสระที่มีการกระทำของตัวเองเท่านั้น)
- **warm neutral + accent เดียว** — surface / เส้น / ตัวอักษร อยู่ตระกูลอุ่นเดียวกัน ไม่ใช้ `#fff`/`#000` ล้วน · สีต้องสื่อความหมาย
- **List แบบ catalogue** มากกว่ากริดการ์ด · **hairline** แทนเงา · motion สั้นและมีเหตุผล · radius เล็ก (2/4/6px)
- **ไม่ใช้**: gradient ม่วง/ฟ้าแบบ AI · glassmorphism/blur · neon/glow · เงานุ่มหนา · มุมโค้งยักษ์ · pill ทุกปุ่ม
  · badge/card เต็มจอ · emoji เป็น UI · ของประดับหนังสือเก่าปลอม (ชั้นหนังสือ · parchment · ornament)

รายละเอียดครบ (token · layout · container · icons · accessibility): [docs/03 Part B](docs/03-blocks-and-design-system.md)
· decision ที่ล็อกแล้ว: [docs/08](docs/08-decisions.md) ข้อ 31–33

## โครงสร้าง repo

```
packages/
  core/              render, resolve, validate, sanitize, blocks
  fs-node/           VaultFs adapter (node:fs) — ใช้ร่วม cli/server
  server/            Hono + JSX + Tailwind + SSE      (M1)
  cli/               doku binary
  mcp/               MCP stdio server                  (M4)
vault/      เนื้อหา (default vault, mount เป็น volume)
docs/       เอกสารออกแบบ
examples/   ตัวอย่าง
```

> `schema/` ไม่ commit — generate จาก Zod ตอน M0 ด้วย `bun run gen:schema`

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [docs/01-architecture.md](docs/01-architecture.md) | องค์ประกอบ, pipeline, cache, packages |
| [docs/02-content-format.md](docs/02-content-format.md) | vault, path id, meta.json, โฟลเดอร์, assets |
| [docs/03-blocks-and-design-system.md](docs/03-blocks-and-design-system.md) | block syntax ทั้งหมด + design tokens, layout, styleguide |
| [docs/04-tech-stack.md](docs/04-tech-stack.md) | stack แบบ TypeScript-first + monorepo |
| [docs/05-api-and-agent-access.md](docs/05-api-and-agent-access.md) | REST, CLI, MCP, folder ops |
| [docs/06-security.md](docs/06-security.md) | sanitize, path, token, revision |
| [docs/07-roadmap.md](docs/07-roadmap.md) | M0–M5 + ประมาณการ |
| [docs/08-decisions.md](docs/08-decisions.md) | decisions ที่ล็อกแล้ว |

## ตัวอย่าง

[examples/](examples/) — vault ตัวอย่าง

## สถานะ

**M0 + M1 + M2 + M3 เสร็จแล้ว** — render / validate / serve / editor ได้จริง พร้อม custom block + design system + REST API:

```bash
bun install
bun test                                    # 128 tests
bun run typecheck && bun run check          # tsc + Biome
bun run doku -- render --vault examples/vault projects/doku/design > out.html
bun run doku -- check  --vault examples/vault --json
bun run dev                                 # server + Tailwind → localhost:7667
bun run build:css                           # generate app.css สำหรับ production
bun run gen:schema                          # Zod → schema/ (ไม่ commit)
```

- **CLI**: `doku render` · `doku check` · `doku serve` (server + sidebar tree + SSE live-reload)
- **route**: `/` · `/d/*path` · [`/styleguide`] · `/assets/*` · `/static/*` · `/sse` · `/health`
- **custom block ครบตาม [docs/03](docs/03-blocks-and-design-system.md)**: callout (7 type), mark, badge, stat/stats,
  figure, gallery, video, card, section, grid/col, kv, progress, steps, timeline, margin-note, motion, details, tabs/tab
- **design system**: tokens + prose + block CSS อยู่ที่ `@doku/core` ใช้ร่วม CLI/server · ดูทุก block ได้ที่ `/styleguide`
- **ทิศทาง UI**: Digital Archivist / Editorial Minimalism (ดู [ทิศทาง UI](#ทิศทาง-ui--digital-archivist)) — รอบ UI pass เต็มรูปแบบอยู่ใน M3
- ยังไม่มี: REST ที่เหลือ + MCP (M4) · index/search (M5)
- คำถามค้างดู [docs/08-decisions.md](docs/08-decisions.md) หัวข้อ "รอเคาะ"
