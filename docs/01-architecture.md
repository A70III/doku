# 01 — Architecture

## องค์ประกอบ

```
      Human UI (tree sidebar)        REST / CLI           MCP (Hermes)
               └──────────────┬───────────┴──────────┬────────┘
                              ▼
                    ┌───────────────────┐
                    │    packages/core  │   resolve → render
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
   vault/ (files)       var/cache (json)      var/index.db
   source of truth       disposable            disposable (FTS5)
```

3 interface, 1 core — ไม่มี logic ซ้ำ
`core` ไม่รู้จัก HTTP และไม่ผูก filesystem ตรงๆ — รับ fs adapter เข้ามา (ดู [04](04-tech-stack.md))
→ render ได้ทั้งใน test, CLI, server

## Mono repo

```
doku/
  package.json            workspaces: ["packages/*"]
  bunfig.toml
  tsconfig.base.json
  packages/
    core/                 @doku/core    (ไม่มี dep ของ server)
      src/resolve.ts      path → doc
      src/render.ts       md → html
      src/blocks/         custom block registry
      src/validate.ts
      src/sanitize.ts
      src/vault.ts        tree walk, folder ops (pure fs)
    server/               @doku/server  (dep: core)
      src/http.ts         Hono routes
      src/watch.ts        chokidar → SSE reload + index
      src/index-db.ts     Drizzle + bun:sqlite FTS5
      src/web/            layout templates + css/js
    cli/                  @doku/cli     (dep: core)
    mcp/                  @doku/mcp     (dep: core)
    fs-node/              @doku/fs-node VaultFs adapter (node:fs) — ใช้ร่วม cli/server
  vault/                  เนื้อหา (default, mount volume)
  docs/
  examples/
```

`bun install` ครั้งเดียว, `bun run --filter` ทำงานข้าม package, แชร์ `tsconfig.base.json`
ไม่ต้องมี turbo/nx — scale นี้ Bun workspaces พอ

> `schema/` ไม่ commit — generate จาก Zod ตอน M0 ด้วย `bun run gen:schema` (ดู [04](04-tech-stack.md))

## Data flow

`GET /d/projects/doku/design`

1. **Resolve** — path `projects/doku/design` → `vault/projects/doku/design.md`
   + อ่าน `design.meta.json` ถ้ามี (ไม่มี → default)
2. **Validate meta** — ผิด schema คืน warning ไม่ล้ม
3. **Cache key** = `sha256(path id + md + meta + metaSource + warnings + rendererVersion + theme + listingHash)`
   (ดู [08 ข้อ 44](08-decisions.md) — path id/metaSource/warnings ต้องอยู่ใน key ด้วย)
4. hit → คืน HTML / miss → render → เขียน cache
5. **Asset rewrite** — `assets/diagram.svg` (relative) → `/assets/projects/doku/assets/diagram.svg?h=<hash>`
   path ของ asset = path ใน vault เต็ม → ไม่กำกวม (ดู [05](05-api-and-agent-access.md))

## Render pipeline

```
md ─▶ parse ─▶ custom blocks ─▶ HTML ─▶ sanitize ─▶ asset rewrite ─▶ layout
```

| ขั้น | ทำอะไร |
|---|---|
| parse | Markdown → mdast (remark-parse + remark-gfm) |
| custom | `:::callout` ฯลฯ → HTML จาก template ที่เราคุม |
| sanitize | rehype-sanitize allowlist ตัด script/on* (จำเป็น เพราะ AI เขียนเนื้อหา) |
| asset | แทน path + cache-bust hash |
| layout | sidebar tree + TOC + theme + content → HTML |

Layout เป็น **server-rendered HTML + CSS** ใช้ JS เฉพาะ: copy code, TOC active, motion observer, tabs, tree toggle, live-reload
ไม่มี SPA framework

## Sidebar tree

เป็น navigation หลัก — **ไม่มีแท็บ/คอลัมน์แยกตามหมวด** เพราะหมวดคือโฟลเดอร์ใน tree เอง
- server สร้าง tree จาก fs ตอน render (หรือจาก index ได้)
- **ข้าม dotfile/dotfolder ทุกตัว** โดยเฉพาะ `vault/.trash/` — ไม่ให้ trash โผล่ใน tree
- โฟลเดอร์ sort: `_folder.meta.json.order` → ไม่งั้น alphabetical (โฟลเดอร์ก่อนไฟล์)
- state (โฟลเดอร์ไหนเปิด) เก็บ localStorage ฝั่ง client — ไม่แตะ vault
- ทุก path ใน tree ต้อง validate ก่อนออก URL (ดู [06](06-security.md))

## Caching

| ชั้น | เก็บ | invalidate |
|---|---|---|
| HTML | `var/cache/<hash>.json` (envelope: fragment + meta + toc + warnings — docs/08 ข้อ 26) | content เปลี่ยน → hash เปลี่ยน |
| tree | in-memory | watch event (debounce 200ms) |
| index | SQLite FTS5 | mtime/hash เปลี่ยน |

Cache เป็น pure function ของ input → ไม่มี invalidation logic, ตาม hash
Dev mode ปิด cache

`listingHash` = hash ของรายการ doc id + (asset path, mtime) — ทำให้ fragment ที่อ้าง wikilink/asset
ถูก render ใหม่เมื่อโครง vault เปลี่ยน

**ทำไม path id ต้องอยู่ใน key**: render ขึ้นกับตำแหน่งของเอกสาร (relative link/asset resolve จาก `dirname(id)`)
เอกสารต่างโฟลเดอร์ที่ md + meta เหมือนกัน (เช่น basename ตรงกัน + ไม่มี sidecar → `defaultMeta` ให้ title เท่ากัน)
เคยได้ fragment ของกัน — เป็นบั๊กที่แก้ใน M3 (ดู [08 ข้อ 44](08-decisions.md))

## Indexer

watcher (chokidar) event → hash เทียบ DB → อัปเดต FTS + tags + links → ถ้าเป็น create/delete อัปเดต tree cache

watcher ignore: `vault/.trash/**`, dotfiles/dotfolders, `var/**` — กัน trash/revision ถูก index เป็นเอกสาร
Fallback: rescan interval ถ้า watcher เงียบ (บาง volume)

## Static export (optional, M5)

`doku build` ใช้ pipeline เดียวกัน ไล่ vault → `dist/` HTML + assets
ไว้ทำ backup/archive อ่าน offline ไม่ใช่การ publish

## Error handling

| กรณี | ผล |
|---|---|
| meta.json หาย | ใช้ default ล้วน |
| meta ผิด schema | render ต่อ + banner |
| md พัง | ได้ output เท่าที่ได้ (parser ไม่ throw) |
| asset หาย | placeholder ไม่ 500 |
| block ไม่รู้จัก | แสดง code block + เตือน |
| wikilink กำกวม | เลือกตัวแรก + เตือน |
