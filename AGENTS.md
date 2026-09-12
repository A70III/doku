# AGENTS.md

คู่มือสำหรับ coding agents ที่ทำงานในโปรเจกต์นี้ อ่านให้จบก่อนแก้โค้ด

## วัตถุประสงค์โปรเจกต์

Doku = document hub ส่วนตัวบน home server — เขียน Markdown เก็บเป็น vault
(โฟลเดอร์ซ้อนได้เหมือน Obsidian) แล้ว render เป็น HTML ตอนเปิดดู คนและ AI อ่าน-เขียนได้
**LAN only ไม่มี auth ไม่ publish** — ใช้เก็บและอ่านเองในบ้าน

stack: Bun + Hono + TypeScript + unified + Drizzle/bun:sqlite + Hono JSX + Tailwind v4
+ Shiki + KaTeX · monorepo · server-render · port `7667`

## คำสั่ง

```bash
bun install
bun run dev          # dev server → localhost:7667 (bun --hot + tailwind)
bun test             # bun test
bun run check        # biome check (lint + format)
bun run gen:schema   # z.toJSONSchema() → schema/  (ไม่ commit)
```

CLI `doku` (รายละเอียดครบใน `docs/05`): `new` `mkdir` `render` `check` `tree --json`
`list --tag` `search` `mv` `serve` `build --out` `restore` `audit` `mcp` — ทุกคำสั่งสำคัญมี `--json` ให้ agent parse

## โครง repo + ทิศทาง dependency

```
packages/core/     @doku/core     resolve · render · blocks · validate · vault
packages/fs-node/  @doku/fs-node  VaultFs adapter (node:fs)              (dep: core)
packages/server/   @doku/server   Hono + JSX + Tailwind + watch + index (dep: core, fs-node)
packages/cli/      @doku/cli      doku binary                          (dep: core, fs-node)
packages/mcp/      @doku/mcp      MCP stdio                             (dep: core, fs-node)
vault/             เนื้อหา = source of truth (gitignore)
docs/              เอกสารออกแบบ 01–08
examples/          vault ตัวอย่าง (commit เป็น fixture)
```

- **ทิศทาง dependency: `cli` / `server` / `mcp` → `core` (+ `fs-node` ที่เป็น leaf) เท่านั้น**
  ห้าม package กลุ่มแรก import กันเอง และห้าม `core` import package อื่น (docs/08 ข้อ 22)
- `core` เป็น isomorphic — **ห้ามรู้จัก HTTP และห้ามผูก filesystem ตรงๆ** ให้รับ fs adapter เข้ามา
  (adapter ของ Node/Bun อยู่ที่ `@doku/fs-node` เพื่อให้ render ได้ทั้งใน test, CLI และ server)

## Conventions

- **ภาษา:** doc comment, AGENTS.md, README, เนื้อหา docs ใช้ไทย ผสมอังกฤษได้ตามธรรมชาติ
  ส่วน **commit message ใช้ English** (Conventional Commits), code identifiers, commit type
  (`feat:` `fix:` `refactor:` `docs:` `chore:`) และชื่อ symbol ใช้ English
- **TypeScript** strict, `moduleResolution: bundler` — ใช้ type จาก Zod (`z.infer`) ไม่ประกาศ type ซ้ำ
- **Lint/format: Biome** เท่านั้น — ห้ามเพิ่ม ESLint/Prettier
- **Template: Hono JSX** — ห้ามเพิ่ม React
- **Runtime: Bun** — ใช้ `bun test`, `bun:sqlite`, `Bun.file`; ห้ามเพิ่ม jest/vitest/node:sqlite
- **CSS:** Tailwind v4 สำหรับ app chrome (sidebar/toolbar/editor) · เนื้อหาเอกสารใช้ CSS layer
  `.doku-prose` / `.doku-block` + design token (`--accent` ฯลฯ) — **ห้ามใช้ Tailwind กับ content block**
- **Validate: Zod 4** เป็น single source (TS type + runtime + `z.toJSONSchema()`)

## หลักการที่ห้ามละเมิด

1. **ไฟล์คือความจริง** — vault เป็น plain text, git ได้
2. **path = id** — relative จาก vault ตัด `.md`; ไม่มี field `id` / `category` — จัดหมวดด้วยโฟลเดอร์เท่านั้น
3. **meta.json เป็น optional** sidecar (`design.md` → `design.meta.json`) ไม่มีก็ใช้ default
4. **render on demand + cache** ตาม `sha256(md + meta + rendererVersion + theme)` — cache เป็น disposable
5. **sanitize เสมอ** ด้วย rehype-sanitize allowlist (เพราะ AI เขียนเนื้อหาได้) + ห้ามเปิด raw HTML
6. **path safety** — ทุก path จาก user/agent ผ่าน `safeJoin` (resolve + prefix check + realpath)
7. **ลบ = soft-delete** → `vault/.trash/`; **ลบถาวรเฉพาะคน** — ห้ามมี route ให้ agent ลบถาวร
8. **write atomic** (temp → rename) + เก็บ revision ก่อนทับทุกครั้ง
9. **watcher / tree / index ข้าม** `vault/.trash/**` และ dotfile/dotfolder ทุกตัว

## เอกสารอ้างอิง (source of truth)

| ไฟล์ | เนื้อหา |
|---|---|
| `docs/01-architecture.md` | องค์ประกอบ, pipeline, cache, packages |
| `docs/02-content-format.md` | vault, path id, meta.json, โฟลเดอร์, assets |
| `docs/03-blocks-and-design-system.md` | block syntax + design tokens/layout |
| `docs/04-tech-stack.md` | stack ที่เลือกแล้ว + เหตุผล |
| `docs/05-api-and-agent-access.md` | REST, CLI, MCP, agent policy |
| `docs/06-security.md` | sanitize, path, CSP, revision, audit |
| `docs/07-roadmap.md` | M0–M5 + DoD + ประมาณการ |
| `docs/08-decisions.md` | decision ที่ล็อกแล้ว 20 ข้อ |

> ถ้าโค้ดกับ docs ไม่ตรง ให้ถือ **docs เป็นข้อเสนอ** และเมื่อเคาะ decision ใหม่ให้อัปเดต `docs/08`

## สถานะปัจจุบัน

- **M0 (static render) เสร็จแล้ว** — monorepo Bun + `packages/core` + `packages/fs-node` + `packages/cli`
  - `doku render <path>` / `render --stdin` / `doku check [path]` ใช้ได้ (มี `--json` ทุกคำสั่ง)
  - render pipeline: resolve → blocks → sanitize → asset rewrite → KaTeX/Shiki → HTML
- **M1 (server + vault tree) เสร็จแล้ว** — `packages/server` (@doku/server)
  - routes: `/` (home: pinned/recent/tag) · `/d/*path` · `/assets/*path` · `/static/*` · `/sse` · `/health`
  - sidebar tree (collapsible, localStorage) + Tailwind v4 chrome (build ด้วย `bun run dev` / `build:css`)
  - HTML cache ตาม content hash (in-memory LRU + `var/cache/<hash>.json`)
  - watcher (chokidar, ข้าม dotfile/.trash) + SSE live-reload · `doku serve` (spawn subprocess — docs/08 ข้อ 25)
  - `doku render` ยังเป็น preview ไฟล์เดียวจบ ไม่ผูกกับ server
- **ถัดไป: M2** — design tokens `tokens.css` + block registry + `/styleguide`
- MVP = M0 + M1 + M2 · port `7667` · vault default `vault/`
- ล็อกแล้ว: meta sidecar ข้างไฟล์ · trash auto 30 วัน · Inter + Noto Sans Thai · accent `#3b7df0`
- ล็อกเพิ่มตอน M1: `doku serve` = spawn subprocess (ข้อ 25) · cache file = JSON envelope (ข้อ 26)
  · CSP `font-src 'self' data:` + route `/sse`,`/static/*` (ข้อ 27) · ตาม docs/08 ข้อ 21–27

## ขอบเขตที่ตัดออกแล้ว (อย่าเสนอซ้ำ)

- publish / visibility / auth — LAN only (เผื่อโครง token ไว้ทีหลังเท่านั้น)
- Mermaid → ใช้ Excalidraw SVG + ASCII (D2 หลัง v1)
- post-it block · Obsidian plugin · field `category`
