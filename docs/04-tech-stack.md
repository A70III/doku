# 04 — Tech Stack (TypeScript-first)

## สรุปที่เลือก (ล็อกแล้ว)

| ส่วน | เลือก | ทำไม |
|---|---|---|
| Runtime | **Bun 1.2+** | รัน TS ตรง, sqlite/test/bundler ในตัว, dev เร็ว |
| Repo | **Bun workspaces** | monorepo เบา + `tsconfig.base.json` |
| HTTP | **Hono 4** | portable + typed RPC client `hc` |
| Template | **Hono JSX** | layout เป็น TSX, typed props, ไม่ต้อง React |
| CSS | **Tailwind v4** + `bun-plugin-tailwind` | หน้าเว็บสวยเร็ว (ดูหัวข้อถัดไป) |
| Markdown | **unified (remark → rehype)** | AST typed (mdast/hast) → custom block type-safe |
| Directive | **remark-directive** | `:::name{attrs}` เหมือนที่ออกแบบ |
| Validate | **Zod 4** | type = runtime schema เดียว, `z.toJSONSchema()` ป้อน `/api/schema` |
| DB | **Drizzle ORM + bun:sqlite (FTS5)** | typed queries, migration, index ยัง disposable |
| Code highlight | **Shiki** (`@shikijs/rehype`) | สวย, theme เยอะ, render ฝั่ง server |
| Math | **KaTeX** | block/inline |
| Diagram | **Excalidraw SVG + ASCII** (หลัก), **D2** (code-first, เพิ่มทีหลัง) | ไม่ใช้ Mermaid |
| Live | **SSE** | one-way พอ, ง่ายกว่า WS |
| Lint/Format | **Biome** | tool เดียว |
| Test | **bun test** + `tsc --build` | CI gate |
| Deploy | **Docker multi-stage** (วางโครง, ยังไม่ทำ) + `bun build --compile` | dev บนเครื่องก่อน |
| Port | **7667** | |
| Auth | **ไม่มี** (LAN only) | ออกแบบให้เพิ่ม token ทีหลังได้ |
| MCP | **stdio** | Hermes spawn |

## Tailwind — ยังเร็วไหม? ได้ไหม?

**ได้ และยังเร็ว** เพราะ Tailwind **ไม่แตะ render path**:

```
md → unified → HTML (runtime, ทุก request)
Tailwind CLI → app.css (build/dev-watch, ครั้งเดียว)   ← คนละทางเลย
```

- Tailwind v4 ใช้ engine ใหม่ build เร็วมาก (~50–200ms full build, เร็วกว่านั้นตอน incremental)
- dev: `bun --hot` + `bun-plugin-tailwind` → rebuild CSS ตอน save
- production: generate `app.css` ครั้งเดียว → serve เป็น static
- HTML render เร็วเท่าเดิม (Tailwind ไม่ได้ทำงานตอน render)

**ข้อควรระวัง / วิธีจัด:**

| เรื่อง | วิธี |
|---|---|
| class เยอะใน JSX | ใช้ helper `cn()` + component ย่อย (Layout, Card, Button) |
| content ของเอกสาร (callout, motion) | **ไม่ใช้ Tailwind** — เขียน CSS layer เอง `.kairn-prose`, `.kairn-block` เพราะต้องคุม theme var + motion เป๊ะ |
| purge/content scan | v4 auto-detect; ชี้ `@source` ไป `packages/server/src/**/*.tsx` |
| static export | CSS ถูก generate ตอน build อยู่แล้ว → export ได้เลย |

**สรุปการแบ่งงาน CSS:**
- **Tailwind** → app chrome: sidebar, toolbar, layout, list, editor, buttons, modal
- **CSS layer เอง** → เนื้อหาเอกสาร: heading, prose, callout, figure, motion, code
- แชร์ design token ผ่าน CSS variables (`--accent` ฯลฯ) ทั้งสองฝั่ง

## จุดที่เปลี่ยนจาก markdown-it → unified

โจทย์ TS + หัวใจคือ custom block:

| | markdown-it | unified |
|---|---|---|
| AST | `Token[]` untyped | **mdast/hast typed** |
| Custom block | token rule + `any` | plugin บน node type ที่ TS รู้จัก |
| Sanitize | sanitize-html | **rehype-sanitize** (schema typed) |
| syntax `:::` | markdown-it-container | remark-directive (**เหมือนกัน**) |
| dep | ~5 | ~10 (maintained + typed) |

→ **unified** คุ้มกับ type safety, syntax เดิมใช้ได้ ไม่ต้องรื้อ [03](03-blocks-and-design-system.md)

## Type safety end-to-end

```
Zod schema (meta, API body)
   ├─ type TS ให้ core
   ├─ validate runtime
   └─ z.toJSONSchema() → GET /api/schema   ← agent อ่านไปเขียนให้ถูก
Hono route → InferRequestType/ResponseType → CLI/MCP ใช้ type เดียว
mdast: declare module "mdast" { interface RootContentMap { callout: CalloutNode } }
client hc<AppType>() → route เปลี่ยน = compile error
```

## Mono repo layout

```
package.json          workspaces: ["packages/*"]
tsconfig.base.json    strict, moduleResolution: bundler
biome.json
packages/
  core/    @kairn/core      render/resolve/blocks/validate/vault   (zero server dep)
  server/  @kairn/server    Hono + JSX + Tailwind + watch + index (dep: core)
  cli/     @kairn/cli       kairn binary                          (dep: core)
  mcp/     @kairn/mcp       MCP stdio                             (dep: core)
vault/                   default vault (mount เป็น volume)
```

`schema/` **ไม่ commit** — generate ตอน M0: `bun run gen:schema` (`z.toJSONSchema()` → draft 2020-12)
serve ให้ agent/editor ผ่าน `GET /api/schema`; `$schema` ใน `.meta.json` เป็น hint ไม่บังคับ

dependency: `cli/server/mcp → core` เท่านั้น
`core` เป็น isomorphic — inject fs adapter → test ง่าย

## Dependencies

```
runtime:  hono  zod  drizzle-orm  unified  remark-parse  remark-gfm  remark-directive
          remark-rehype  rehype-sanitize  rehype-slug  rehype-autolink-headings
          rehype-stringify  @shikijs/rehype  katex  rehype-katex  chokidar
dev:      typescript  @biomejs/biome  @types/bun  tailwindcss  bun-plugin-tailwind  drizzle-kit
optional: d2 (binary, ยังไม่ใส่)   kroki (service, ตอนมี docker)
```

เขียนเอง: blocks, cache, indexer, TOC wrapper, tree builder, typed sqlite/drizzle schema, trash, editor

> `_folder.meta.json` validate ด้วย Zod object เดียวกับ meta — ไม่มี schema ไฟล์แยก (ดู [08](08-decisions.md))

## Deployment (วางโครงไว้ ยังไม่ทำ)

- `docker-compose.yml` + `Dockerfile` วางไว้ในเรพ แต่**ยังไม่ build**
- volume: `./vault:/app/vault`, `./var:/app/var`, `./config:/app/config`
- env: `KAIRN_VAULT`, `KAIRN_PORT=7667`, `KAIRN_HOST=0.0.0.0`
- dev บนเครื่องก่อน: `bun run dev` → `localhost:7667`
- อนาคตค่อยต่อ nginx-proxy-manager (ไม่ต้องมี auth เพราะ LAN)

## ทางเลือกอื่น (ถ้าเปลี่ยนใจ)

| ทาง | เมื่อไหร่ |
|---|---|
| Node 22 + Hono + node:sqlite | อยาก portable สุด (ไม่ผูก Bun) |
| Elysia + Eden | Bun-native type-safe กว่า แต่ผูก Bun |
| Fastify + TypeBox | ทีมคุ้น Fastify |
