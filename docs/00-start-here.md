# เริ่มที่นี่ — แผนที่เอกสารและโค้ดของ Doku

หน้านี้ตอบสองคำถาม: **ควรอ่านอะไรต่อ** และ **เรื่องที่อยากรู้อยู่ไฟล์ไหน**
ถ้ายังไม่รู้ว่า Doku คืออะไร เริ่มที่ [README](../README.md)

---

## เลือกเส้นทางตามบทบาท

### 1) ผู้ใช้ — อยากอ่าน/เขียนโน้ตให้เป็น

1. [README](../README.md) — ทำอะไรได้บ้าง
2. [02-content-format](02-content-format.md) — วางไฟล์/โฟลเดอร์อย่างไรให้ระบบเห็น
3. [03-blocks-and-design-system](03-blocks-and-design-system.md) — block สวย ๆ (`:::callout`, `:::figure`, …)
   *(อ่านเฉพาะหัวข้อที่ใช้ ไม่ต้องอ่านทั้งเล่ม)*

> ใช้แอปอย่างเดียวไม่ต้องอ่าน docs ที่เหลือ — กด `?` ในแอปเพื่อดูคีย์ลัด

### 2) ผู้ดูแลระบบ — ดูแลเครื่องให้ทำงาน

1. [09-operations](09-operations.md) — deploy, env, backup, monitoring, troubleshooting
2. [06-security](06-security.md) — ระบบป้องกันอะไรไว้บ้าง และอะไรที่ *ไม่ได้* ป้องกัน
3. [02-content-format](02-content-format.md) — ข้อมูลจริงอยู่ตรงไหน ก่อนจะ backup

### 3) คนแก้โค้ด — จะเพิ่ม/แก้ฟีเจอร์

1. [01-architecture](01-architecture.md) — ภาพรวมและการไหลของข้อมูล
2. [10-development](10-development.md) — วิธีรัน, gates, แผนที่ไฟล์, สูตรเพิ่มของ
3. [05-api-and-agent-access](05-api-and-agent-access.md) — สัญญา API ที่ต้องไม่พัง
4. [08-decisions](08-decisions.md) — ก่อนเสนอทางใหม่ อ่านว่าอะไรถูกตัดออกแล้วและเพราะอะไร

### 4) AI agent — ทำงานกับ vault โดยตรง

1. [`AGENTS.md`](../AGENTS.md) — กติกาภายใน repo (ต้องอ่านก่อนแก้โค้ด)
2. [05-api-and-agent-access](05-api-and-agent-access.md) §9 — ลำดับการใช้งานที่ปลอดภัย
3. [11-handoff](11-handoff.md) — สถานะปัจจุบัน จุดเปราะ งานถัดไป

---

## เอกสารแต่ละไฟล์ตอบอะไร

| ไฟล์ | ตอบคำถาม | อ่านเมื่อ |
|---|---|---|
| [01-architecture](01-architecture.md) | ระบบมีกี่ชั้น แต่ละชั้นทำอะไร ข้อมูลไหลอย่างไร | ก่อนแก้โค้ดครั้งแรก |
| [02-content-format](02-content-format.md) | ไฟล์ .md / .meta.json / โฟลเดอร์ / ลิงก์ / รูป ต้องหน้าตาอย่างไร | เขียนเนื้อหาหรือย้ายไฟล์ |
| [03-blocks-and-design-system](03-blocks-and-design-system.md) | block ทุกตัว syntax อะไร + token สี/ระยะ/ตัวอักษร | ทำเนื้อหาสวย หรือแก้ CSS |
| [04-tech-stack](04-tech-stack.md) | ทำไมเลือก Bun/Hono/unified/SQLite และทางเลือกที่ตัดออก | จะเปลี่ยน stack |
| [05-api-and-agent-access](05-api-and-agent-access.md) | REST ทุก endpoint, ETag, error, CLI, MCP | เชื่อมระบบอื่น หรือเขียน agent |
| [06-security](06-security.md) | sanitize, path safety, CSP, rate limit, audit, trash | ตรวจความปลอดภัย / เพิ่ม route |
| [07-roadmap](07-roadmap.md) | M0–M5 ทำอะไรไปแล้ว (เอกสารประวัติ) | อยากรู้ที่มา |
| [08-decisions](08-decisions.md) | decision log 96 ข้อ — เลือกอะไร เพราะอะไร | ก่อนเปลี่ยนพฤติกรรมที่ล็อกไว้ |
| [09-operations](09-operations.md) | รัน/deploy/backup/กู้คืน/แก้ปัญหา | ดูแลเครื่อง |
| [10-development](10-development.md) | gates, แผนที่ไฟล์, สูตรเพิ่ม route/page/block | ลงมือแก้โค้ด |
| [11-handoff](11-handoff.md) | สถานะ, จุดเปราะ, งานถัดไป, วิธีตรวจใน 15 นาที | รับช่วงต่อ |

> `docs/07` เป็นแผนประวัติ — สถานะจริงดู [11-handoff](11-handoff.md)
> `docs/08` เป็นบันทึกการตัดสินใจ — ถ้าโค้ดกับ docs ไม่ตรง ให้ถือ docs เป็นข้อเสนอ แล้วอัปเดต decision เมื่อเคาะใหม่

---

## คำศัพท์ที่ใช้ในโปรเจกต์นี้

| คำ | ความหมาย |
|---|---|
| **vault** | โฟลเดอร์รากที่เก็บเอกสารทั้งหมด (`DOKU_VAULT`) — เป็น source of truth |
| **path = id** | ตัวระบุเอกสารคือ path relative จากราก vault ตัด `.md` ออก เช่น `projects/doku/design` |
| **meta sidecar** | ไฟล์ `<ชื่อ>.meta.json` ข้างเอกสาร เก็บ title/tags/theme/order — ไม่มีก็ได้ |
| **block** | syntax `:::ชื่อ` ใน markdown ที่ render เป็นองค์ประกอบพิเศษ (callout, figure, tabs, …) |
| **media store** | โฟลเดอร์ `.media/` เก็บไฟล์แนบแบบ content-addressed: `<sha256>.<ext>` |
| **fragment cache** | cache ของ HTML ที่ render แล้ว — memory LRU 200 ชิ้น + ไฟล์ใน `var/cache/` |
| **index** | SQLite FTS5 (trigram) ที่ `var/index.db` ใช้ค้นเนื้อหา รองรับภาษาไทย |
| **ETag / If-Match** | กลไกกันเขียนทับ: GET คืน ETag, PUT/PATCH ต้องส่ง If-Match (ไม่ตรง = 409) |
| **palette** | ช่องค้นหา/คำสั่งเดียวของแอป เปิดด้วย `/` หรือ `⌘K` |
| **MCP** | Model Context Protocol — ให้ AI เรียกเครื่องมือของ doku ผ่าน stdio |

---

## แผนที่โค้ดแบบเร็ว

```
packages/core/src/
  render.ts        pipeline: markdown → blocks → sanitize → HTML
  blocks/          registry ของ block ทั้งหมด (1 ไฟล์ = 1 block family)
  styles/          tokens · prose · blocks (CSS ที่ใช้ร่วม CLI/server)
  fs.ts            interface VaultFs + in-memory adapter (สำหรับ test)
  media.ts         กติกา media store (.media/<sha256>.<ext>)
  paths.ts         normalize path / กัน path escape
  check.ts         validator ของ `doku check`
  schema.ts        Zod schema ของ meta (single source ของ type)

packages/fs-node/src/
  index.ts         adapter จริง (safeJoin, atomic write, trash, revisions)
  search-index.ts  FTS5 + stat-first rescan (กัน RAM บวม)
  audit.ts         audit log append-only

packages/server/src/
  app.tsx          ประกอบ route ทั้งหมด + HTML/static/media/sse
  api/             REST แยกตามหมวด (docs, folders, assets, search, …)
  web/pages/       หน้าเว็บ SSR (home, doc, folder, trash, styleguide…)
  web/client/      client JS (ต่อกันเป็นไฟล์เดียว — palette, autosave, tree)
  web/styles/      app.css (Tailwind + chrome)
  index-db.ts      ตัวสั่ง sync index (stat-first, ห้าม sync ซ้อน)
  watch.ts         watcher → invalidate state + index + SSE

packages/cli/src/index.ts     คำสั่ง doku ทั้งหมด (ทุกตัวมี --json)
packages/mcp/src/tools.ts     tool definitions ของ MCP
scripts/                      dev.sh · backup.sh · build-* · shot.ts · migrate-media.ts
```

---

## ถ้าอยากทำสิ่งนี้ → เริ่มที่ไฟล์นี้

| อยากทำ | ไปที่ |
|---|---|
| เพิ่มหน้าเว็บใหม่ | `packages/server/src/web/pages/` + route ใน `app.tsx` |
| เพิ่ม REST endpoint | `packages/server/src/api/<หมวด>.ts` + `api/index.ts` |
| เพิ่ม block ใหม่ | `packages/core/src/blocks/` + `docs/03` + `/styleguide` |
| เพิ่มไอคอนที่ใช้บ่อย | `packages/server/src/web/sprite.ts` (แล้ว `bun run gen:icons` ถ้าเป็นไอคอนใหม่) |
| แก้สี/ระยะ/ตัวอักษร | `packages/core/src/styles/tokens.ts` (ห้าม hardcode) |
| แก้ sidebar/tree | `web/pages/sidebar.tsx` + `web/client/core.ts` |
| แก้ palette | `web/client/palette.ts` + `web/pages/layout.tsx` |
| แก้ search | `packages/fs-node/src/search-index.ts` + `api/search.ts` |
| แก้วิธี deploy | `docker-compose.yml`, `Dockerfile`, [09-operations](09-operations.md) |
| เพิ่มคำสั่ง CLI | `packages/cli/src/index.ts` |
| เพิ่ม MCP tool | `packages/mcp/src/tools.ts` |
