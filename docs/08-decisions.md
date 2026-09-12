# 08 — Decisions

บันทึกข้อสรุปทั้งหมด (เดิมคือ open questions) — ถ้ามีคำถามใหม่ให้เพิ่มหัวข้อ "รอเคาะ" ท้ายไฟล์

## ล็อกแล้ว

| # | เรื่อง | ข้อสรุป |
|---|---|---|
| 1 | meta sidecar | **วางข้างไฟล์** (`design.meta.json`) — Obsidian plugin ตัดออกแล้ว จึงไม่มีเหตุต้องซ่อน |
| 2 | trash retention | **auto 30 วัน** หรือคนกดเคลียร์เอง (แล้วแต่ก่อน) |
| 3 | docker | เริ่มหลัง **M4 นิ่ง** |
| 4 | font | **Inter + Noto Sans Thai** (self-host) |
| 5 | default accent | น้ำเงิน **`#2b5fc4`** — เดิม `#3b7df0` แต่ contrast บนพื้นอุ่นได้ 3.87:1 (ไม่ผ่าน WCAG AA สำหรับ link) จึงเข้มขึ้นเป็น 5.9:1 · ยังเป็นน้ำเงินตัวเดียวกัน แก้ตอน UI pass ([03 §1.1](03-blocks-and-design-system.md)) |
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
| 21 | Tailwind setup | อยู่ที่ **M1** — M0 ยังไม่มี app chrome และ `doku render` ต้องไม่พึ่ง build step (preview shell ใช้ CSS layer + token) |
| 22 | node fs adapter | แยก **`packages/fs-node` (`@doku/fs-node`)** — leaf package ที่ cli/server/mcp depend ได้ · `core` ยัง isomorphic (ห้ามผูก `node:fs`) |
| 23 | KaTeX ใน preview | **ไฟล์เดียวจบ** — ฝัง woff2 ทั้งหมดเป็น data URI (~380 KB เมื่อมีสมการ) เพื่อให้เปิด offline ได้ 100% |
| 24 | การซ้อน directive | **`:::` ชั้นนอกต้องยาวกว่าชั้นใน** (เช่น `::::tabs` + `:::tab`) — `doku check` ตรวจเป็น error (`block_nesting_ambiguous`) |
| 25 | `doku serve` | **CLI spawn subprocess** — cli ห้าม import `@doku/server` ตรงๆ (ทิศทาง dependency) · ส่งค่าผ่าน env `DOKU_VAULT`/`DOKU_PORT`/`DOKU_HOST` |
| 26 | HTML cache file | **JSON envelope** ที่ `var/cache/<hash>.json` (fragment + meta + toc + warnings) — เพราะ layout ต้องใช้ meta/toc ต่อ request, เก็บเป็น `.html` ตาม docs/01 เดิมทำไม่ได้ |
| 27 | CSP | `font-src 'self' data:` — เพิ่ม `data:` สำหรับ woff2 ที่ KaTeX ฝัง (ตามข้อ 23), ส่วนอื่นตาม docs/06 เดิม · route ชื่อ `/sse` (event `change` → client reload) · `/static/*` = static ที่ server คุมเอง |
| 28 | content CSS อยู่ที่ core | `tokens` / `prose` / `blocks` อยู่ที่ `packages/core/src/styles/` (export `CONTENT_CSS`) — CLI preview กับ server ใช้ชุดเดียวกันจริง ๆ · chrome ของแต่ละหน้าอยู่ที่ผู้ใช้ (server = Tailwind, CLI = `PREVIEW_CHROME_CSS`) · เหตุผล: CLI import `@doku/server` ไม่ได้ (ทิศทาง dependency) จึงต้องมีที่เดียวใน core ไม่งั้น CSS drift (แก้ docs/03 §10) |
| 29 | block renderer คืน hast | `BlockDefinition.render(ctx)` คืน hast `Element` **ไม่ใช่ HTML string** และสไตล์ใช้ `data-*` ไม่ใช้ inline `style` — เพื่อให้ rehype-sanitize ครอบทุก node ที่ block สร้าง (ตาม invariant “sanitize เสมอ”) · ค่าที่ต้องเป็นตัวเลข (figure width, motion delay/duration, progress) ถูก validate + quantize แล้วแทนด้วย data attribute + CSS rule ที่ generate (ไม่มี inline style) |
| 30 | `==mark=={.สี}` | implement ด้วย remark plugin ที่แปลง **mdast text node** (ไม่ทำ micromark extension) — สีต้องอยู่ใน allowlist `red orange amber yellow green teal blue purple` · `:name` กลางข้อความโดยไม่มี `[...]` (เช่น `bun:sqlite`) = ข้อความธรรมดา ไม่นับเป็น directive |
| 31 | ทิศทาง UI | **Digital Archivist / Editorial Minimalism** — หน้าตามาจาก **typography · hierarchy · spacing · โครงสร้าง · ความยับยั้งชั่งใจ · จังหวะ** ไม่ใช่จากของประดับ · ห้ามของประดับเชิงสัญลักษณ์ (ชั้นหนังสือ · parchment · ornament · UI ย้อนยุคปลอม) · เป้าหมายคือ minimal ที่ **ไม่ generic** — เกณฑ์ตัดสิน: typography แก้ได้ → ไม่เพิ่มของประดับ · spacing แก้ได้ → ไม่เพิ่ม container · hierarchy แก้ได้ → ไม่เพิ่มสี (ดู [03 Part B](03-blocks-and-design-system.md)) |
| 32 | container | **card ไม่ใช่ default** — ไต่ **บันได container** whitespace → divider/hairline → typography → indentation → พื้นหลังจาง → card และหยุดที่ขั้นแรกที่พอ · ขั้น card เฉพาะเมื่อเนื้อหาเป็น object อิสระที่มีการกระทำของตัวเอง (ห้ามการ์ดซ้อนการ์ด / การ์ดต่อ 1 section / กริดการ์ดทุกหน้า) · **ยกเลิก "เนื้อหาเป็นการ์ดลอยบน `--k-app-bg`" ของ M2** — chrome แยกด้วย hairline + whitespace (ดู [03 §2](03-blocks-and-design-system.md)) |
| 33 | พื้นผิว / สี / ระยะ | **warm neutral + accent เดียว** — surface/line/text อยู่ตระกูลอุ่นเดียวกัน · ไม่ใช้ `#fff`/`#000` ล้วน · accent (default ตามข้อ 5) ใช้กับ *สถานะปัจจุบัน* เท่านั้น · semantic อิ่มต่ำ ใช้เมื่อเป็น state จริง · **radius 2/4/6px** คงที่ และ **shadow เฉพาะ overlay** (menu/modal) — depth ปกติมาจาก hairline + พื้นหลังจาง + whitespace · ค่า hex อยู่ที่ [03 §1.1](03-blocks-and-design-system.md) และ **ล็อกแล้ว** (ตรวจ contrast + `/styleguide` ตอน migrate) · migrate แล้วใน UI pass (ข้อ 36) |

| 34 | ชุดไอคอน | **Lucide** — ISC · 1,600+ ไอคอน · grid 24px · stroke ปรับได้ (ใช้ 1.5–2) · เหตุผล: [static SVG เป็น first-class](https://lucide.dev/guide/static/) (`lucide-static` — ไฟล์ `.svg` เดี่ยว / sprite / icon font ใช้ได้โดยไม่ต้องมี JS runtime) · community/maintenance ใหญ่สุดในกลุ่ม line icon · ปรับ stroke ให้บางตามทิศทาง UI ได้โดยไม่เปลี่ยนชุด · **vendor subset เข้า repo** (`packages/core/src/icons/`) ห้าม CDN / ห้ามโหลดทั้งชุด / ห้าม icon font (LAN only + CSP `default-src 'none'`) · ชื่อที่ไม่รู้จัก → ไม่แสดง + warning `icon_unknown` · ต้องเก็บ ISC notice ไว้ในไฟล์ icon module |
| 35 | การส่งไอคอนเข้า HTML | **chrome (TSX) = inline `<svg>` จาก map ใน core** (`stroke="currentColor"` รับสีจาก token) · **เนื้อหาเอกสาร = CSS `mask-image` + `background-color: currentColor`** กับ `url("data:image/svg+xml,…")` ที่ generate ต่อชื่อ icon → **ห้าม inline `<svg>` เข้า HTML ที่ผ่าน sanitize** (allowlist ไม่มี `svg`/`path` และจะไม่เพิ่ม — [06](06-security.md)) · ไม่ต้องแก้ CSP เพราะ `img-src 'self' data:` มีอยู่แล้ว (ข้อ 27) · แก้ปม `:::card{icon=…}` ที่ `data-icon` ไม่มี CSS อ่านค่า → ทำพร้อม UI pass ที่ [M3](07-roadmap.md) |
| 36 | UI pass M0–M2 | ปรับหน้าตาบน state M0+M1+M2 โดยไม่เพิ่มฟีเจอร์ — **ทำตามข้อ 31–33 ให้ครบ**: ① migrate token เป็น warm neutral ตาม [03 §1.1](03-blocks-and-design-system.md) (rail น้ำตาลอุ่น `--k-app-bg` + ใบกระดาษ `--k-bg`) · ② accent + `--d-text-subtle` ปรับให้ผ่าน AA (ข้อ 5) · ③ **แก้บั๊ก `data-theme="auto"`**: เดิมมีแต่ `[data-theme="dark"]` ไม่มี `@media (prefers-color-scheme: dark)` → โหมด auto ไม่มีวันเป็น dark · ④ **rail + ใบกระดาษ** (ไม่ใช่การ์ด): hub/catalogue ใช้ masthead + hairline + tabular figures, reading page วางคอลัมน์ชิด rail · ⑤ **ชื่อเรื่องเดียว**: h1 นำหน้าของ body เป็นชื่อเอกสาร (ตัด h1 ซ้ำ), meta `title` ที่ระบุชัดเจนชนะ (bump `RENDERER_VERSION` → 3) · ⑥ ตัด gradient ประดับของ `section(hero)` · ⑦ rail ซ่อนใต้ `md` (content ไม่ถูกบีบ) |
| 37 | editor bundling | **CodeMirror 6 bundle เป็น static artifact** — `Bun.build` จาก `packages/server/src/web/editor.ts` → `packages/server/public/editor.js` (`.gitignore`) · ต้องรัน `bun run build:editor` ก่อนเปิด server (`scripts/dev.sh` ทำให้อัตโนมัติ) · CSP `script-src 'self'` → **self-host เท่านั้น ห้าม CDN** · ไม่มี bundle = client ใช้ `<textarea>` fallback (หน้าเว็บยังใช้ได้) |
| 38 | Lucide regeneration | subset ที่ **commit** (`packages/core/src/icons/lucide.ts`) generate จาก `lucide-static` ซึ่งเป็น **devDependency** (`bun run gen:icons`) · ISC notice อยู่ในไฟล์ที่ generate · runtime ไม่มี dep กับ lucide · ชื่อไอคอนที่ไม่รู้จัก → ไม่แสดง + warning `icon_unknown` |
| 39 | trash manifest | `.trash/<ts>-<rand>/` + manifest `.doku-trash.json` = `{id,label,kind,sources,deletedAt,bytes}` · **1 รายการ = 1 โฟลเดอร์** (doc = md + meta ไปด้วยกัน) · กู้คืน = ย้าย `sources` กลับ path เดิม (ถ้าซ้ำ = 409 ไม่ทับ) · id ต้องผ่าน `isTrashId` ก่อนแตะ fs |
| 40 | concurrency status codes | PUT/PATCH **ไม่ส่ง** `If-Match` → `428 precondition_required` · **ไม่ตรง** → `409 conflict` + ส่ง ETag ปัจจุบันกลับ · รับ `If-Match: *` และ weak prefix `W/` (RFC 9110 แบบย่อ) · path safety ผ่านหมดก่อนแตะ fs |
| 41 | move API | `POST /api/docs/*path/move` + `POST /api/folders/*path/move` รับ `{to, update_links?}` (`update_links` default **true**) · อัปเดตลิงก์ทั้ง vault (wikilink path form · `/d/…` · relative) + เขียน `relations.moved_from` · wikilink basename ที่กำกวม = **ไม่แตะ** (ให้ `doku check` เตือน) |
| 42 | static asset caching | `/static/app.css` + `/static/editor.js` ตอบ `ETag` และรองรับ `If-None-Match` → `304` (editor bundle ~510KB ไม่ถูกโหลดซ้ำ) · `editor.js` cache ใน memory (build ครั้งเดียว) · `app.css` อ่านใหม่ทุก request เพราะ Tailwind `--watch` |
| 43 | folder tree + color | tree เดินจาก **filesystem** ไม่ใช่รายการเอกสาร → โฟลเดอร์ว่างปรากฏใน sidebar ทันที (M3) · `_folder.meta.json.color` (ผ่าน Zod `#rrggbb`) ใช้ tint ไอคอนโฟลเดอร์ · ค่าที่ไม่ผ่าน = ไม่ใช้ (ไม่Throw) |

## รอเคาะ

_ว่าง — ยังไม่มีคำถามค้าง_
