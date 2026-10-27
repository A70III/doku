# 11 — Handoff (เอกสารส่งต่อ)

สำหรับคนหรือ AI ที่รับช่วง repo นี้ต่อ — อ่านจบแล้วควรรู้ว่า **ตอนนี้อยู่ตรงไหน**, **อะไรพังได้ง่าย**, **อะไรยังไม่ได้ทำ**
ภาพรวมสถาปัตยกรรม → [01-architecture](01-architecture.md) · วิธีแก้โค้ด → [10-development](10-development.md)
· ดูแลเครื่อง → [09-operations](09-operations.md)

---

## 1. ภาพรวม 5 บรรทัด

1. **Doku** = document hub ส่วนตัวบน home server — vault ของ Markdown (โฟลเดอร์ซ้อนได้เหมือน Obsidian) render เป็น HTML ตอนเปิดดู
2. คนและ AI **อ่าน/เขียนชุดเดียวกัน**: ไฟล์ตรง ๆ / REST `/api/*` / CLI `doku` / MCP stdio (ลบถาวรเฉพาะคน)
3. stack: **Bun + Hono + TypeScript + unified + bun:sqlite (FTS5/Drizzle) + Hono JSX + Tailwind v4 + Shiki + KaTeX** — monorepo, server-render, พอร์ต `7667`
4. สถานะ: **M0–M5 เสร็จ** (render · validate · serve · editor · REST · MCP · search/backlinks · audit · static export · docker deploy) — ไม่มีฟีเจอร์ใหญ่ค้างแบบครึ่ง ๆ
5. deploy จริง = `docker compose up -d --build` บน home server · **LAN only ไม่มี auth** · `vault/` คือ source of truth, `var/` คือดัชนีที่สร้างใหม่ได้

---

## 2. สถานะที่ตรวจแล้ว

ตรวจทั้งหมดนี้ในรอบ handoff ก่อนส่งมอบเอกสาร (เป็นค่าล่าสุด ณ ตอนเขียน ไม่ใช่ค่าที่ค้างจากอดีต)

| Gate | ผล | หมายเหตุ |
|---|---|---|
| `bun test` | **509 pass / 0 fail** (40 ไฟล์ · ~54s · 2,430 expect) | รวม regression ของ block/rail/rhythm/editor/tag-toggle |
| `bun run typecheck` | **ผ่าน** | `tsc --noEmit` ครบ 5 แพ็กเกจ |
| `bun run check` (Biome) | **ไม่ผ่าน 1 ข้อ** | `packages/server/src/app.tsx` — `assist/source/organizeImports` (FIXABLE) · แก้ด้วย `bun run check:fix` |
| `bun run build:css` | ผ่าน | `public/app.css` ~34.9KB |
| `bun run build:editor` | ผ่าน | `public/editor.js` ~532KB (CodeMirror 6) |
| `bun run shot` | **a11y ผ่านทุกข้อ** | 2 ธีม × 10 หน้า (ชื่อคอนโทรล · focus ring · overflow 200%/360px · reduced motion · h1 เดียว · rhythm) |
| `bun run doku check --vault examples/vault` | **0 errors / 0 warnings** | 3 docs · 3 assets · 23 blocks |
| deploy `/health` | **`{"ok":true}`** | ยืนยันจาก HTTP บนพอร์ต 7667 · container state ตรวจไม่ได้จาก user นี้ (ไม่มีสิทธิ์ docker socket) |
| smoke dev server | `/` · `/health` · `/d/projects/doku/design` · `/static/app.css` · `/styleguide` · `/trash` = **200 ทั้งหมด** | รันด้วย `DOKU_VAULT=examples/vault` บนพอร์ตแยก (7691) แล้วปิด |

สรุปสั้น: **โค้ดทำงานครบ gates ยกเว้น Biome 1 ข้อ** (import sort ล้วน ๆ ไม่ใช่บั๊กพฤติกรรม)
ที่เหลือคือการบ้านของคนรับช่วง — ข้อแรกใน §7 คือแก้ข้อนี้

> ตัวเลข 509 tests ต่างจาก `README.md` ที่เขียน 461 — README ล้าหลัง ให้ถือตัวเลขจาก `bun test` จริง

---

## 3. ตรวจระบบใน 15 นาที

รันตามลำดับนี้แล้วจะรู้ว่ายังดีหรือไม่ (ทุกขั้นมี "ควรเห็นอะไร")

```bash
# 1) deps — ควรจบในไม่กี่วินาที
bun install

# 2) unit + regression — ควรเห็น "509 pass 0 fail"
bun test

# 3) types — ควรเงียบ (ไม่มี output = ผ่าน)
bun run typecheck

# 4) lint/format — ตอน handoff มี 1 error (import sort)
bun run check          # ถ้าแดง: bun run check:fix แล้วรันซ้ำ
```

```bash
# 5) artifact ที่ gitignore ไว้ — ต้อง build ก่อนดูหน้าเว็บ/a11y
bun run build:css && bun run build:editor

# 6) เปิด server จริงกับ vault ตัวอย่าง
DOKU_VAULT=examples/vault bun run dev
#   ควรเห็น: doku serve → http://0.0.0.0:7667  (vault: …/examples/vault · cache off)
```

```bash
# อีกหน้าต่าง — ต้องได้ 200 ทุกตัว และ health ต้อง {"ok":true}
curl -s http://127.0.0.1:7667/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7667/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7667/d/projects/doku/design
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:7667/styleguide
```

```bash
# 7) validator เนื้อหา — ต้อง 0 errors 0 warnings
bun run doku check --vault examples/vault

# 8) เฉพาะเมื่อจะแตะ UI — screenshot + a11y (ช้า ~1 นาที)
bun run shot
```

อ่านผลแบบเร็ว:

| เห็นอะไร | แปลว่า | ไปดู |
|---|---|---|
| tests pass แต่ `check` แดง | lint/format เท่านั้น (ไม่ใช่ logic) | `bun run check:fix` แล้ว diff |
| หน้าเว็บไม่มีสไตล์ | ลืม `build:css` (หรือ `public/` ถูกลบ) | §3 ข้อ 5 |
| โหมดเขียนเป็น textarea | ลืม `build:editor` | §3 ข้อ 5 |
| `shot` แดงหลายข้อพร้อมกัน | มักเป็นเพราะไม่มี `app.css` ไม่ใช่บั๊ก a11y | build CSS แล้วรันซ้ำ (docs/08 ข้อ 73) |
| `/health` ok แต่หน้าเอกสาร 500 | ปัญหา render/vault ไม่ใช่ process | log stderr + `doku render <path>` |
| search ไม่เจอ | index ยัง sync ไม่เสร็จ หรือ DB เก่า | ลบ `var/index.db` แล้ว restart |

---

## 4. แผนที่โค้ด

ทิศทาง dependency: `cli` / `server` / `mcp` → `core` (+ `fs-node` ที่เป็น leaf) เท่านั้น
**ห้าม package กลุ่มแรก import กันเอง และ `core` ห้าม import package อื่น** (docs/08 ข้อ 22)

### core — หัวใจ rendering (isomorphic: ไม่รู้จัก HTTP/fs จริง)

| ไฟล์ | รับผิดชอบ |
|---|---|
| `src/render.ts` | pipeline: markdown → directive/block → sanitize → HTML (+ `RENDERER_VERSION`) |
| `src/plugins/*` | remark plugin ของตัวเอง: `mark` · `wikilink` · `breaks` (soft break → `<br>`) |
| `src/blocks/*` | registry ของ block (1 ไฟล์ = 1 กลุ่ม) — คืน hast ไม่ใช่ HTML string |
| `src/styles/*` | `tokens.ts` · prose · block CSS (`CONTENT_CSS`) ใช้ร่วม CLI/server |
| `src/fs.ts` | interface `VaultFs` + in-memory adapter (test) |
| `src/paths.ts` | normalize path · กัน escape · แปลง link target |
| `src/media.ts` | กติกา `.media/<sha256>.<ext>` + `MEDIA_NAME` |
| `src/sanitize.ts` | allowlist ของ rehype-sanitize (protocol/attribute) |
| `src/schema.ts` | Zod schema ของ meta (single source ของ type) |
| `src/check.ts` | validator ของ `doku check` |
| `src/revision.ts` | สัญญา revision + `REVISION_KEEP = 20` |
| `src/icons/*` | Lucide subset (commit ไว้) + `iconSvg()` |

### fs-node — ของจริงบนดิสก์ (leaf)

| ไฟล์ | รับผิดชอบ |
|---|---|
| `src/index.ts` | `createNodeVaultFs` · `safeJoin`/realpath · atomic write · trash store · revision store |
| `src/search-index.ts` | FTS5 trigram · sync แบบ stat-first (`stamp = mtime:size`) · backlinks |
| `src/audit-log.ts` | `logAudit` append-only JSONL |

### server — ประกอบทุกอย่าง

| ไฟล์ | รับผิดชอบ |
|---|---|
| `src/index.ts` | entry: อ่าน env · เปิด fs/cache/index/watcher · `Bun.serve` · graceful shutdown |
| `src/app.tsx` | route ทั้งหมด (HTML/static/media/SSE) + `compress()` + CSP |
| `src/api/*` | REST แยกหมวด (`docs` `folders` `assets` `search` `trash` `revisions` `context` `system`) + `shared.ts` (error/rate limit/ETag context) |
| `src/web/pages/*` | SSR: `layout` `sidebar` `home` `doc` `folder` `trash` `styleguide` `notfound` |
| `src/web/client/*` | client JS ต่อเป็น `CLIENT_JS` ก้อนเดียว (palette · autosave · tree · editor · interactions) |
| `src/web/styles/app.css` | Tailwind + chrome |
| `src/web/site.ts` | ชื่อแบรนด์ (`DOKU_NAME`) + asset version (`?v=`) |
| `src/web/sprite.ts` | ไอคอนที่ใช้ซ้ำในหน้า (symbol + use) |
| `src/doc.ts` | `DocRenderer` + cache key |
| `src/cache.ts` | fragment cache (memory LRU 200 + disk envelope) |
| `src/tree.ts` | `VaultState` snapshot + invalidate |
| `src/watch.ts` | chokidar → invalidate + SSE + index trigger (ข้าม dotfolder) |
| `src/index-db.ts` | lifecycle ของ index: boot sync · debounce 500ms · rescan · ห้าม sync ซ้อน |
| `src/sse.ts` | hub ของ live-reload (ping ทุก 25s) |
| `src/katex.ts` | CSS ของ KaTeX (โหลดเฉพาะหน้าสมการ) |

### cli / mcp / scripts

- `packages/cli/src/index.ts` — ทุกคำสั่ง (`render` `check` `serve` `new` `mkdir` `mv` `list` `tree` `restore` `search` `audit` `build` `mcp`) + `--json` ทุกตัว
- `packages/mcp/src/tools.ts` — 12 tools + schema (hand-written = สัญญาที่แปลจาก docs/05 §4)
- `scripts/` — `dev.sh` · `backup.sh` · `build-editor.ts` · `shot.ts` (a11y) · `migrate-media.ts` · `gen-icons.ts` · `gen-schema.ts`

### เส้นทางของ request หนึ่งครั้ง

```
GET /d/<path>
  app.tsx → DocPage (SSR)
    → VaultState (tree/summaries, cache ใน memory)
    → DocRenderer → FragmentCache (hit = จบ)
        → miss → core.renderMarkdown (resolve → blocks → sanitize → rewrite asset)
    → Layout + Sidebar (sprite icons, asset ?v=)
  client: CLIENT_JS → palette/tree/autosave · SSE /sse → reload เมื่อไฟล์เปลี่ยน
```

---

## 5. จุดเปราะ (hotspots) — พังแล้วเห็นอาการอะไร

| # | จุด | ถ้าแก้พลาดจะเห็น | ทำไม |
|---|---|---|---|
| 1 | `web/client/*` (ต่อเป็น template string ก้อนเดียว) | **ทั้ง client ตายเงียบ** — palette ไม่เปิด, tree ไม่ตอบ, autosave ไม่ยิง, ไม่มี error ฝั่ง server เลย (syntax error อยู่ฝั่ง browser) | escaping ของ backtick / `${}` / `\n` ใน template string พลาดตัวเดียว = ทั้ง bundle พัง · `qol-writing.test.ts` ตรวจ syntax ให้ แต่ไม่ตรวจพฤติกรรมทั้งหมด |
| 2 | `web/pages/*` (SSR) | markdown หลุดเป็น HTML = **XSS** · หรือโครงหน้ากระดาษ/rhythm เพี้ยน, h1 ซ้ำ, TOC หาย | ทุกหน้าเป็น JSX ที่ฝังเนื้อหาที่ผู้ใช้/AI เขียน — ต้องผ่าน escape/sanitize เสมอ |
| 3 | `api/*` + `api/shared.ts` (ETag/`If-Match`) | autosave **ทับงานคนอื่นเงียบ ๆ** หรือ 409 วนไม่จบ · agent เขียนไม่ได้เลย (428) | ถ้าไม่ bump ETag หลัง write → client ส่งตัวเก่ามาไม่ตรงตลอด · ถ้าเปลี่ยน semantics 428/409 = สัญญาที่ agent พึ่งพาแตก |
| 4 | `core/src/sanitize.ts` (allowlist) | เพิ่ม tag/attr เกิน = **ช่อง XSS** · ลบเกิน = ลิงก์/วิดีโอ/ไอคอนหายเงียบโดยไม่มี error | เป็นด่านเดียวที่กันเนื้อหาจาก AI · ต้องแก้พร้อมเทสต์ ไม่ใช่แก้ให้ผ่านสะดวก |
| 5 | `fs-node/src/index.ts` (`safeJoin`/realpath/trash guard) | **path escape** ออกจาก vault (อ่าน/เขียนนอกโฟลเดอร์) · หรือ 404 ทั้งที่ไฟล์มีจริง | path มาจาก URL/agent ทุกทาง · ต้องเช็ค realpath ของบรรพบุรุษที่ลึกที่สุด (docs/08 ข้อ 45) |
| 6 | `web/sprite.ts` + `site.ts` (`?v=`) | **ไอคอนหายทั้งหน้า** (symbol ไม่ resolve) · หรือ CSS/JS เก่าค้างยาว 1 ปี แก้แล้วไม่เห็นผล | sprite ต้องมี `<symbol>` ครบทุกชื่อที่ `<use>` อ้าง · `?v=` เป็น hash ของ JS+CSS+app.css → ถ้าไม่เปลี่ยน URL เบราว์เซอร์ใช้ cache `immutable` ต่อ |
| 7 | `core/src/blocks/*` | **เนื้อหาผู้เขียนหาย** (block กลืน children) หรือ block หายทั้งก้อนเมื่อ attribute ผิด | เคยเกิดจริง 3+ รอบ (docs/08 ข้อ 67–68) — กติกา: ผิด/ไม่รู้จัก = คงเนื้อหา + warning ห้ามทิ้ง |
| 8 | `server/src/index-db.ts` + `fs-node/src/search-index.ts` | ค้นไม่เจอ/ผลเก่า · หรือ **CPU/RAM บวม** เพราะอ่าน vault ทั้งก้อนทุกนาที | ต้อง stat-first ด้วย `stamp` และห้าม sync ซ้อน (`running/queued`) — แก้จุดนี้แล้ววัด RAM/CPU ทุกครั้ง (docs/08 ข้อ 86) |

จุดที่เหลือ (ไม่พังบ่อย แต่สำคัญ): `cli/src/index.ts` (สัญญา `--json` — เปลี่ยนรูป = flow ของ agent พังทั้งชุด)
· `core/src/check.ts` (validator — พังแล้วเอกสารเสียหลุดเข้า vault) · `core/src/styles/tokens.ts` (แก้สี/ระยะ = `contrast`/`tokens`/`rhythm` test แดง)

---

## 6. ข้อจำกัดที่รู้อยู่ (ตั้งใจ ไม่ใช่บั๊กที่ลืม)

| ข้อจำกัด | ผลจริง | สถานะ |
|---|---|---|
| **ไม่มี auth** — LAN only | ใครก็ตามที่อยู่ในวงเดียวกันอ่าน/เขียน/ลบ(soft)ได้ทั้งหมด | ตั้งใจตั้งแต่ต้น (docs/08 ข้อ 3 · `06-security` checklist ยังไม่ผ่านข้อ "ถ้าเปิดออกนอก LAN") |
| **ไม่มี GC ของ `.media`** | ลบเอกสารแล้วไฟล์แนบยังอยู่ → orphan สะสม (content-addressed จึงไม่มีทางชนกัน) | ยอมรับไว้ก่อน (docs/08 ข้อ 88) — งานหลัง v1 |
| **MCP/agent ลบถาวรไม่ได้** | ทำได้แค่ soft-delete ไป `vault/.trash/` · ลบถาวร = คนกด `POST /api/trash/empty` | เป็น invariant ข้อ 7 ไม่ใช่ช่องโหว่ |
| **`main` ล้าหลัง `feat/home-tag-toggle`** | งานล่าสุด (tag toggle, QoL pass, perf) อยู่บน branch นี้ · `main` ไม่มี | ต้อง merge/เปิด PR ก่อนอ้างอิง `main` ว่าเป็นของจริง |
| **`docs/07-roadmap.md` เป็นแผนเก่า** | M0–M5 จบแล้วและมีงานหลังแผนหลายรอบ (ข้อ 84–96) | ใช้เป็นประวัติ ไม่ใช่สถานะ — สถานะจริงคือเอกสารนี้ |
| **`docs/10` อ้าง `bun run docs:sync`** | `package.json` ยังไม่มี script นี้ (ตรวจแล้วรอบ handoff) | เอกสารนำโค้ด — ถ้าจะใช้จริงต้องเขียน script หรือแก้ docs |
| **backup ยังไม่ถูกตั้งเวลา** | `scripts/backup.sh` มี แต่ `crontab -l` ว่าง → ต้องรันมือ | งานถัดไปอันดับต้น (§7) |
| markdown ผูกกับ route `/media/…` | เปิด vault ด้วย Obsidian แล้วรูปไม่ขึ้น | แลกกับการไม่มีโฟลเดอร์ `assets` (docs/08 ข้อ 88) |

---

## 7. งานถัดไปที่คุ้มทำ (เรียงตามความคุ้ม)

### 7.1 แก้ Biome ให้เขียว (เล็กมาก แต่บล็อกทุกอย่าง)
`packages/server/src/app.tsx` มี import สลับลำดับ 1 จุด → `bun run check:fix` แล้ว commit
**เหตุผล:** gate แดงอยู่ตอนนี้ ทำให้ทุกคนที่รัน `check` ต้องมานั่งแยกแยะว่า "แดงเพราะเรา หรือแดงมาก่อน" — 5 นาทีที่คืนความน่าเชื่อถือของ gate

### 7.2 ตั้ง backup อัตโนมัติ + ทดสอบ restore หนึ่งครั้ง
ใส่ cron ([09-operations](09-operations.md) §6.1) ทุก 15 นาที + tar รายสัปดาห์ แล้ว**ลองกู้ไฟล์จริงหนึ่งไฟล์**
**เหตุผล:** ตอนนี้ข้อมูลส่วนตัวทั้งหมดกันอยู่ที่ดิสก์ลูกเดียวและคนต้องจำรันเอง · backup ที่ไม่เคยทดสอบ restore ถือว่าไม่มี

### 7.3 GC ของ `.media` (reference scan)
สแกน `.md` ทุกไฟล์หา `/media/<hash>.<ext>` เทียบกับไฟล์ใน `.media/` → รายงาน orphan (โหมด dry-run ก่อน) ค่อยเพิ่ม `--prune`
**เหตุผล:** เนื้อหาโตขึ้นเรื่อย ๆ แต่ไม่มีใครลบไฟล์แนบ · ทำเป็น CLI (`doku media gc`) ได้ไม่ต้องแตะ HTTP — ปลอดภัยกว่าและทดสอบง่าย

### 7.4 token auth + HTTPS ผ่าน reverse proxy (เมื่อจะออกนอก LAN)
โครงที่ค้างไว้: token ใน header + `config/tokens.json` (backup แยก) · ยังไม่ต้องทำถ้าใช้ในบ้านจริง
**เหตุผล:** เป็นเงื่อนไขเดียวที่กันไม่ให้ "เปิดให้เข้าจากข้างนอกแล้วใครก็แก้เอกสารได้" — ต้องทำก่อนเปิดพอร์ตออกเสมอ

### 7.5 ทางเลือก: หน้า `/search` เดี่ยว หรือ graph view (D2)
`docs/08` ข้อ 79 เคาะว่า palette คือหน้าค้นหา — จะทำก็ต่อเมื่อมีคนใช้จริงแล้วบอกว่าขาด
**เหตุผล:** ผลตอบแทนต่ำกว่าสี่ข้อบน และเพิ่มพื้นที่ผิวที่ต้องดูแล (SSR + client + index)

---

## 8. วิธีทำงานกับ repo นี้

### 8.1 กติกาที่ห้ามละเมิด (สรุปจาก `AGENTS.md`)

1. **ไฟล์คือความจริง** — vault เป็น plain text · `var/` เป็นของทิ้ง
2. **path = id** — relative จาก vault ตัด `.md` · ไม่มี field `id`/`category`
3. **meta.json เป็น optional** sidecar — ไม่มีก็ใช้ default
4. **sanitize เสมอ** (allowlist) — ห้ามเปิด raw HTML
5. **path safety** — ทุก path จาก user/agent ผ่าน `safeJoin`
6. **ลบ = soft-delete** → `.trash/` · ลบถาวรเฉพาะคน
7. **write atomic** (temp → rename) + เก็บ revision ก่อนทับ
8. **watcher/tree/index ข้าม** `.trash/**` และ dotfile/dotfolder ทุกตัว
9. **CSS**: chrome ใช้ Tailwind · เนื้อหาใช้ CSS layer + token — ห้าม hardcode สี/ระยะ
10. **ห้ามอักษรจีน (CJK)** ในไฟล์ใด ๆ ของ repo

### 8.2 Commit

- ข้อความ **ภาษาอังกฤษ** ตาม Conventional Commits: `feat:` `fix:` `refactor:` `perf:` `docs:` `chore:`
- อธิบาย **ทำไม** ไม่ใช่แค่ **อะไร** · 1 เรื่องต่อ 1 commit (แยก refactor ออกจากเปลี่ยนพฤติกรรม)
- ห้ามใส่ชื่อผู้ช่วย AI / `Co-Authored-By` ของ AI ในข้อความ commit

### 8.3 Git: คนเท่านั้น

**ห้าม subagent รัน `git`** (commit/branch/merge/push/checkout ทั้งหมด) — agent เตรียมการเปลี่ยนแปลงให้เสร็จ
แล้วให้คนรันเอง · เหตุผล: งานหลาย branch (`feat/home-tag-toggle` vs `main`) และประวัติ vault ถูกใช้เป็น backup ด้วย
การเขียนประวัติผิดจึงเสียหายสองชั้น (โค้ด + ข้อมูล)

### 8.4 Gates ที่ต้องผ่านก่อน commit

```bash
bun test                                        # 0 fail
bun run typecheck                               # เงียบ
bun run check                                   # Biome 0 error
bun run build:css && bun run build:editor       # artifact (gitignore) — ต้อง build ก่อน shot
bun run shot                                    # ถ้าแตะ UI: a11y + rhythm
bun run doku check --vault examples/vault       # 0 errors / 0 warnings
```

ลำดับเร็วตอนแก้เล็ก ๆ: `bun test packages/server/test/<ไฟล์>` → `typecheck` → `check`
ถ้าแตะ `.tsx`/CSS ให้เพิ่ม `build:css` + `shot` (ขาด `app.css` = a11y แดงหลอก 5 ข้อ)

### 8.5 เอกสารอยู่ที่ไหน

| ที่ | เก็บอะไร | ใครแก้ |
|---|---|---|
| `docs/` ใน repo | **source of truth** ของเอกสารทั้งหมด (01–11) | แก้พร้อม commit โค้ด |
| `docs/08-decisions.md` | decision log — เพิ่มแถวใหม่เมื่อ "เคาะ" เรื่องใหม่ | ทุกครั้งที่เปลี่ยนพฤติกรรมที่ล็อกไว้ |
| `AGENTS.md` | กติกาสำหรับ agent + สถานะย่อ | เมื่อหลักการเปลี่ยน |
| vault `projects/doku/manual/` | สำเนาเอกสารให้อ่านในแอป (คนละที่กับ repo) | คัดลอกตามรอบ ไม่ใช่ที่แก้หลัก |

ถ้าโค้ดกับ docs ไม่ตรง: **docs เป็นข้อเสนอ** และเมื่อเคาะใหม่ให้อัปเดต `docs/08` ก่อน แล้วจึงแก้โค้ด

### 8.6 สิ่งที่อย่าแตะโดยไม่จำเป็น

- `packages/server/public/*` — artifact ที่ build ใหม่ได้ (gitignore)
- `var/` — runtime data (index/cache/revisions/audit) · `vault/` — ข้อมูลจริงของผู้ใช้
- `packages/core/src/icons/lucide.ts` — generate ด้วย `bun run gen:icons` ไม่ใช่แก้มือ
- เทสต์ที่ล็อกพฤติกรรมไว้ (contrast/tokens/rhythm/rail/editor) — ถ้าจะเปลี่ยนพฤติกรรม ให้แก้เทสต์พร้อมเหตุผลใน commit เดียวกัน

---

## 9. ถ้ามีเวลาแค่วันเดียว

1. อ่าน [09-operations](09-operations.md) §5 (ข้อมูลอยู่ไหน) และ §6 (backup) — รู้ว่าอะไรห้ามหาย
2. รันลำดับใน §3 ของเอกสารนี้ — รู้ว่าระบบยังดี
3. แก้ §7.1 (Biome) แล้ว commit — gate กลับมาเขียว
4. ตั้ง cron backup (§7.2) — งานที่คุ้มที่สุดต่อหน่วยเวลา

ที่เหลือรอได้ — ระบบไม่ได้อยู่ในสภาพกึ่งซ่อม
