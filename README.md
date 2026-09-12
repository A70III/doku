# Kairn

Document hub ส่วนตัวบน home server — เขียน Markdown เก็บเป็น vault (โฟลเดอร์ซ้อนได้เหมือน Obsidian), render เป็น HTML ตอนเปิดดู, คนและ AI อ่าน-เขียนได้

**ไม่มีการ publish ออกนอก** — ใช้เก็บและอ่านเองในบ้าน (LAN only ไม่มี auth)

```
vault/                        ← vault ของตัวเอง (เปิดด้วย Obsidian ได้)
  projects/kairn/design.md
  projects/kairn/design.meta.json   ← optional
  projects/kairn/assets/diagram.svg
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

## โครงสร้าง repo

```
packages/
  core/              render, resolve, validate, sanitize, blocks
  server/            Hono + JSX + Tailwind + SSE
  cli/               kairn binary
  mcp/               MCP stdio server
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

ข้อเสนอ ยังไม่ implement — decisions ทั้งหมดอยู่ที่ [docs/08-decisions.md](docs/08-decisions.md)
