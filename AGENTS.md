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
bun run build:editor # bundle CodeMirror 6 → packages/server/public/editor.js (ไม่ commit)
bun run gen:icons    # generate Lucide subset → packages/core/src/icons/lucide.ts (commit)
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
  - routes: `/` (home: pinned/recent/tag) · `/d/*path` · `/styleguide` · `/assets/*path` · `/static/*` · `/sse` · `/health`
  - sidebar tree (collapsible, localStorage) + Tailwind v4 chrome (build ด้วย `bun run dev` / `build:css`)
  - HTML cache ตาม content hash (in-memory LRU + `var/cache/<hash>.json`)
  - watcher (chokidar, ข้าม dotfile/.trash) + SSE live-reload · `doku serve` (spawn subprocess — docs/08 ข้อ 25)
  - `doku render` ยังเป็น preview ไฟล์เดียวจบ ไม่ผูกกับ server
- **M2 (design system + blocks) เสร็จแล้ว** — `packages/core/src/blocks/` (registry + renderer คืน hast)
  · content CSS ที่ `packages/core/src/styles/` ใช้ร่วม CLI + server · `/styleguide` · reading UX (progress/TOC/zoom/copy)
  · `examples/vault/projects/doku/design` ใช้ทุก block, `doku check` = 0 errors/0 warnings
- **M3 (folder mgmt + editor) เสร็จแล้ว** — REST `/api/*` + UI ครบ
  - `/api/docs` CRUD + `/move` (auto-update links + `moved_from`) · `/api/folders` CRUD/move · `/api/tree`
  - ETag/`If-Match` (428 ถ้าไม่ส่ง · 409 + ETag ปัจจุบันถ้าไม่ตรง) · rate limit write 60/min · render 120/min
  - trash `vault/.trash/<id>/` + manifest → `/trash` + restore/empty (คนเท่านั้น) + purge 30 วัน
  - revision `var/revisions/<path>/<ts>.*` (rotate 20/doc) + `doku restore <path> [ts] [--list]`
  - web editor (CodeMirror 6 + live preview ผ่าน `/api/render`) · meta form · folder settings
  - sidebar drag-drop + row menu · command palette (Ctrl+K) · zen mode · theme cycle
  - Lucide subset vendored (`packages/core/src/icons/`) → `<Icon>` chrome + block icon ผ่าน CSS mask
  - asset ที่ generate (gitignore): `public/app.css`, `public/editor.js` · `scripts/dev.sh` build ให้ทั้งคู่
- **ถัดไป: M4** — REST ครบ (assets/context/schema) + audit log + `doku mcp`
- MVP = M0 + M1 + M2 (ครบแล้ว) · port `7667` · vault default `vault/` · examples = `examples/vault`
- ล็อกเพิ่มตอน M2: content CSS ที่ core (ข้อ 28) · block renderer คืน hast/ห้าม inline style (ข้อ 29) · mark `==…==` (ข้อ 30)
- ล็อกแล้ว: meta sidecar ข้างไฟล์ · trash auto 30 วัน · Inter + Noto Sans Thai · accent `#2b5fc4`
- UI pass (M0–M2) เสร็จ: token warm neutral ตาม docs/03 §1.1 · แก้ dark mode `auto` ให้ตาม OS · ชื่อเรื่องเดียว (h1 นำหน้า) · ตัด gradient ประดับ · rail ซ่อนใต้ `md` (docs/08 ข้อ 36)
- ล็อกเพิ่มตอน M1: `doku serve` = spawn subprocess (ข้อ 25) · cache file = JSON envelope (ข้อ 26)
  · CSP `font-src 'self' data:` + route `/sse`,`/static/*` (ข้อ 27) · ตาม docs/08 ข้อ 21–27
- ล็อกเพิ่มตอน M3: editor bundle + fallback textarea (ข้อ 37) · Lucide regenerate ด้วย devDependency (ข้อ 38)
  · trash manifest 1 รายการ = 1 โฟลเดอร์ (ข้อ 39) · 428/409 semantics (ข้อ 40) · move API + link rules (ข้อ 41)
  · static asset ETag/304 (ข้อ 42) · tree เดินจาก filesystem + folder color (ข้อ 43)

## ขอบเขตที่ตัดออกแล้ว (อย่าเสนอซ้ำ)

- publish / visibility / auth — LAN only (เผื่อโครง token ไว้ทีหลังเท่านั้น)
- Mermaid → ใช้ Excalidraw SVG + ASCII (D2 หลัง v1)
- post-it block · Obsidian plugin · field `category`
