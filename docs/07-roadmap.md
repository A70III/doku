# 07 — Roadmap

หลัก: **ทุก milestone รันได้จริง** ไม่มี "โครงสร้างเสร็จแต่ใช้ไม่ได้"

ล็อกแล้ว: ใช้เองในบ้าน · LAN ไม่มี auth · ไม่ publish · monorepo Bun+Hono+TS · vault ของตัวเอง
· soft-delete (AI ลบถาวรไม่ได้) · port 7667 · dev บนเครื่อง ยังไม่ทำ docker
· ทิศทาง UI = **Digital Archivist / Editorial Minimalism** ([08 ข้อ 31](08-decisions.md) · [03 Part B](03-blocks-and-design-system.md))

---

## M0 — Static render

- [x] workspace setup (`packages/core` + `tsconfig.base` + Biome)
- [x] `doku render <path>` + `--stdin`
- [x] resolve path → md + optional meta.json (Zod schema)
- [x] unified: remark-parse + gfm + directive + rehype
- [x] rehype-slug + autolink + **rehype-sanitize**
- [x] **Shiki** (`@shikijs/rehype`) + **KaTeX** (rehype-katex)
- [x] layout HTML + typography — `doku render` คืนหน้า HTML เดียวจบ (preview shell + `.doku-prose` + token ตาม [03](03-blocks-and-design-system.md))
      · **Tailwind ย้ายไป M1** ตาม [08 ข้อ 21](08-decisions.md) (M0 ไม่มี app chrome และ render ต้องไม่พึ่ง build step)
- [x] asset rewrite
- [x] `doku check`

**เสร็จ:** `doku render projects/doku/design > out.html` เปิด browser สวย มี code สี + สมการ

---

## M1 — Server + vault tree

- [x] Hono server: `/`, `/d/*path`, `/assets/*path` (เพิ่ม `/static/*` `/sse` `/health`; M2 เพิ่ม `/styleguide`)
- [x] **sidebar file tree** (collapsible) + Tailwind chrome
- [x] home: pinned / recent / tag filter
- [x] HTML cache ตาม content hash (in-memory + `var/cache/<hash>.json` — docs/08 ข้อ 26)
- [x] watcher (chokidar) + **SSE** live-reload
- [x] `doku serve` (default :7667 — spawn subprocess ตาม docs/08 ข้อ 25)

**เสร็จ:** วางโฟลเดอร์+ไฟล์ → tree ถูก → แก้ md แล้ว refresh เอง (ทดสอบแล้ว)

---

## M2 — Design system + custom blocks

- [x] design tokens + prose layer `.doku-prose` (ตาม [03](03-blocks-and-design-system.md)) — ไฟล์ `tokens`/`prose`/`blocks` อยู่ที่ `packages/core/src/styles/` ([08 ข้อ 28](08-decisions.md))
- [x] block registry `packages/core/src/blocks/` (data-block/data-variant — [08 ข้อ 29](08-decisions.md))
- [x] callout (7 type), figure, motion
- [x] mark สี, badge, details, tabs, grid, card
- [x] kv, stats, progress, steps, timeline
- [x] diagram: Excalidraw SVG (figure) + ASCII (D2 เก็บไว้หลัง v1 — [08 ข้อ 19](08-decisions.md))
- [x] reading UX: progress bar, TOC active, heading anchor (+ copy code, figure zoom)
- [x] `prefers-reduced-motion` + print styles
- [x] **`/styleguide`** render ทุก block (คุมดีไซน์ + ให้ AI ดู) + golden snapshot test
- [x] sanitize allowlist ครบ (รวม `progress`, aria state; ยังไม่ให้ `style`)

**เสร็จ:** `examples/vault/projects/doku/design` ใช้ทุก block → `doku check` = 0 errors/0 warnings
และเทียบกับ `/styleguide` ได้

---

## M3 — Folder mgmt + editor

- [x] create / rename / move / delete (UI + API) — `/api/docs` CRUD + `/api/folders` + drag-drop บน sidebar
- [x] `_folder.meta.json` (order/icon/color) + drag-drop — PATCH merge + ฟอร์มตั้งค่าโฟลเดอร์ + tint ไอคอนตาม `color`
- [x] **trash**: soft-delete list / restore / empty (คนเท่านั้น) — `vault/.trash/<id>/` + manifest, `/trash`, purge 30 วัน
- [x] revision ต่อ write + `doku restore` — `var/revisions/<path>/<ts>.*` rotate 20/doc
- [x] ETag / `If-Match` / 409 — ไม่ส่ง `If-Match` = 428, ไม่ตรง = 409 + ETag ปัจจุบัน
- [x] **web editor** (CodeMirror 6 + live preview) + meta form — bundle `public/editor.js` + `/api/render`
- [x] reading UX เพิ่ม: **zen mode** + **command palette (Ctrl+K)**
- [x] **UI pass ตามทิศทาง Digital Archivist** — token warm neutral ([03 §1.1](03-blocks-and-design-system.md) · [08 ข้อ 33](08-decisions.md))
      + รื้อ chrome ที่ยังเป็น "การ์ดลอย / เงา / มุมโค้งใหญ่" เป็น **hairline + whitespace** ([08 ข้อ 32](08-decisions.md))
      + vendor subset **Lucide** + `<Icon>` (chrome) + icon ของ block ผ่าน CSS mask ([08 ข้อ 34–35](08-decisions.md))
      _(สถานะ: token warm neutral + รื้อ chrome ทำใน UI pass M0–M2 ([08 ข้อ 36](08-decisions.md)) · Lucide/`<Icon>` + mask ทำครบใน M3)_

**เสร็จ:** จัดโฟลเดอร์ + เขียน/แก้เอกสารในเว็บได้ ไม่ต้องพึ่ง editor ภายนอก · หน้าตาตรงทิศทาง Digital Archivist (list แบบ catalogue · ไม่ใช่กริดการ์ด)

---

## M3.1 — Reading room & writing surface (UI/UX pass 2)

> **ที่มา:** M3 ทำ UI pass ตามข้อ 31–33 *โดยไม่เพิ่มฟีเจอร์* — M3.1 คือ pass ที่ **แก้ UX จริง**
> (จังหวะ · โครงหน้า · พื้นผิวการเขียน) จึงเป็น milestone แยก ไม่ยัดใต้ M3 · decision: [08 ข้อ 47–55](08-decisions.md)
>
> **หลักฐานที่ทำให้ต้องมี milestone นี้** (วัดจากหน้าเว็บจริง + computed style ไม่ใช่ความรู้สึก):
> `--d-space-5` ไม่ถูก define → **rail + panel `padding: 0`** · อ่าน column **544px ใน main 880px** (gutter ขวาว่าง 38%)
> · TOC inline สูง **352px = 39% viewport** ก่อนเนื้อหาเริ่ม · **block เกือบทุกตัวมีกรอบ/พื้นของตัวเอง** · h1 36px → h2 30px
> · 4 คลาสสีตก WCAG AA จริง

### ลิสต์งาน (เรียงตามลำดับที่ต้องทำ — systemize before styling)

**พื้นฐาน: token / จังหวะ / สี**

- [x] **tokens** — OKLCH palette ตาม [08 ข้อ 47](08-decisions.md) + `--d-border-control` + `--k-<hue>-ink` + `--k-on-accent`/`--k-scrim`/`--d-selection`
- [x] **contrast lock** — `packages/core/src/styles/contrast.test.ts` ตรวจทุกคู่สี (อ่านค่าจาก `tokens.ts` · ไม่ copy ค่า) — เพิ่ม/แก้สีไม่ผ่าน = แดง
- [x] **space scale** — เพิ่ม `--d-space-5/10/16/20/24` + `tokens.test.ts` ตรวจ `var(--d-space-N)` ที่อ้างทุกตัว (แก้ `--d-space-5` ที่ทำ rail/panel `padding: 0` — [08 ข้อ 50](08-decisions.md))
- [x] **reading scale** — `--d-read*` + weight แค่ 400/600 + `--k-leading-body` ผูกกับ `.doku-prose` จริง ([08 ข้อ 48](08-decisions.md))
- [x] **rhythm** — `--d-flow` · `--d-flow-loose` · `--d-rhythm-h2/h3/h4` + กฎ "มาก่อน heading น้อยหลัง heading" · **ตัดเส้นใต้ `h2`** · `h1` ใช้ `--d-read-h1`
- [x] **สีที่ hardcode หลุดใน render** — `render.ts:137` `rehypeKatex({ errorColor: "#cf222e" })` ยังเป็น danger สี**เก่า** → ดึงจาก token ที่เดียว

**โครงหน้า**

- [x] **3 คอลัมน์** — rail 248px · reading column จัดกลาง · TOC 208px sticky · shell `90rem` ([08 ข้อ 49](08-decisions.md)·[03 §2](03-blocks-and-design-system.md))
- [x] **TOC ออกจากบทความ** — sticky column + active (`IntersectionObserver`) · `<1200px` เป็น `<details>` ท้ายเอกสาร · mobile เป็น bottom sheet
- [x] **colophon ท้ายเอกสาร** — path id · แก้ไขล่าสุด · revision (ลบ `.doku-shelfmark` เหนือ h1)
- [x] **chrome** — **ไม่มีปุ่ม "แก้ไข"** เหลือเมนู `⋯` + zen ([08 ข้อ 51](08-decisions.md)) · rail แยกจาก paper ด้วยพื้น · rail row ≥ 32px (touch target) · hub page rhythm
- [x] **container downgrade ของ block** — ตัด container: `section` · `stats`/`stat` · `grid`/`col` · shadow ของ `card` · `kv` → definition list · `steps`/`timeline` → เส้นเดียว · `details`/`tabs` → hairline คั่น header · คงไว้ + ตรวจ contrast ใหม่: `callout` · `code` · `table` · `figure` · `gallery` · `video` · `badge` ([08 ข้อ 53](08-decisions.md))
- [x] **ตาราง** — เส้นแนวนอนเท่านั้น (ไม่เป็นกริดเต็ม) · header หนักกว่าเส้นอื่น · ตัวเลข tabular

**พื้นที่เขียน — พิมพ์ได้ทันที ไม่มีปุ่มแก้ไข** ([08 ข้อ 52/54/55](08-decisions.md))

- [x] **เอกสารเป็น editor ตั้งแต่แรก** — เลิก overlay/split **และเลิกปุ่ม "แก้ไข"** · เอกสารที่ render แล้วเป็น CM6 Live Preview ในคอลัมน์เดิม · กว้าง/ฟอนต์/leading เท่ากับตอนอ่าน · ไม่มี mode switch
- [x] **Live Preview** — ซ่อน syntax marker เมื่อカーออกจาก node (emphasis · inline code · strikethrough · link URL · `==mark==`)
      · รูป `![](...)` เป็น **widget** ในบรรทัด (resolve asset ตามโฟลเดอร์เอกสาร)
      · หัวข้อ/โค้ด/ตาราง/quote/`:::` ได้ decoration **ระดับบรรทัด** ตาม reading scale
      _(ยังไม่ทำในรอบนี้: widget ที่ render เต็มของ table/callout/tabs/math — ยังเห็นเป็นข้อความ markdown ที่จัดสไตล์แล้ว
      แก้ attribute ของ block เหล่านั้นผ่าน block control strip แทน)_
- [x] **slash menu** — `/` → เมนู block ภาษาไทย (กรองได้) → แทรก directive จริง (รวม `::::tabs`+`:::tab` ตามข้อ 24) · ใช้ `@codemirror/autocomplete`
- [x] **block control strip** — แถบลอยเมื่อカーเข้า block: variant · `color=` · `title=` · `icon=` · align/width · ลบ block → **เขียนกลับเป็น directive text** · รายการ attribute มาจาก `/api/schema`
- [x] **คุณสมบัติ inline** — property panel บนหัวเอกสาร (ชื่อ · แท็ก · สรุป · สถานะ · theme) ไม่ใช่ modal
- [x] **autosave** — debounce 800ms · `If-Match` · 409 = ให้เลือก (ไม่ทับเงียบ) · ไม่สร้าง revision ถ้าเนื้อหาเท่าเดิม · คีย์ลัดตาม **focus** ไม่ใช่โหมด ([08 ข้อ 54](08-decisions.md)) · fallback `<textarea>` ตามข้อ 37 ยังต้องใช้ได้

**correctness lock** ([08 ข้อ 56–61](08-decisions.md) — เคาะแล้ว ยังไม่ implement)

- [x] **ข้อ 56** — `#` เป็น forbidden char + แยก `normalizeVaultPath` / `normalizeLinkTarget`
- [x] **ข้อ 57** — `href` รับ `mailto:`/`tel:` + lowercase scheme + `target`/`rel` allowlist + เติม `rel` เอง + ถอด `color` ออกจาก global allowlist
- [x] **ข้อ 58** — asset `?h=` verify ก่อนให้ `immutable` (ไม่ตรง = `ETag` + `no-cache`)
- [x] **ข้อ 59** — `width` รับ `70`/`70%` (มีแล้ว — เพิ่ม test กันถอย)
- [x] **ข้อ 60** — `render.math=false` คง `$…$` ต้นฉบับ (ข้าม remark-math ตั้งแต่ต้น) + warning `math_disabled`
- [x] **ข้อ 61** — wikilink หาไม่เจอ = คงข้อความต้นฉบับเป๊ะ ๆ (รวมเคส alias)

**ปิดงาน**

- [x] **`/styleguide`** อัปเดตให้โชว์ทั้งสองธีม + คู่สีที่ lock ไว้ + ใช้ตรวจตาเปล่าคู่กับ screenshot
- [x] **`bun run shot`** (playwright · devDependency) เทียบ `var/shots/before` ↔ after ทั้ง 2 ธีม
- [x] **a11y** ในสคริปต์เดียวกับ screenshot: focus ring · 200% zoom · reduced motion · contrast ≥ AA
- [x] **`bun test` + `bun run check` + `bun run typecheck`** ผ่าน · `doku check examples/vault` = 0 errors
- [x] **docs sync** — `docs/03` (§1.1/§1.3/§1.4/§2/§3/§4) · `docs/07` · `docs/08` · `AGENTS.md` ในคอมมิตเดียวกัน

**เสร็จ:** อ่านเอกสารยาวแล้วมีจังหวะ (หัวข้อหายใจได้ ไม่มีเส้นซ้อน) · หา h1 เจอใน 1 glance
· **คลิกที่เอกสารแล้วพิมพ์ได้ทันที** — ไม่มีปุ่มแก้ไข ไม่ต้องสลับโหมด ไม่ต้องกด Save
· พิมพ์ `/` ได้เมนู block · カーเข้า block แล้วแก้ variant/สี/ชื่อได้ **โดยที่ไฟล์ยังเป็น markdown ธรรมดา**

**ประเมิน:** ~5–6 วันทำงาน

---

## M3.2 — One surface + block layer (เขียน/อ่านให้เหมือน Notion)

> **ที่มา:** M3.1 ตัด overlay/split/ปุ่มแก้ไขออกแล้ว แต่**ยังมี 2 rendering path** — เอกสารที่ยังไม่ถูกแตะเป็น HTML
> จาก server พอคลิกครั้งแรก client ทิ้ง HTML ทั้งบทความแล้ว mount CodeMirror ([client.ts:721](../packages/server/src/web/client.ts))
> แล้วตอนออกก็ยิง `/api/render` กลับมาแทนที่ ([client.ts:840](../packages/server/src/web/client.ts))
> ⇒ **นี่คือโหมดแก้ไขที่ซ่อนอยู่** = ข้อ 52 ยังไม่สำเร็จจริง · และยังไม่มี block affordance เลย
> (ไม่มี `+` · `⋮⋮` · เลือก block · ย้าย · turn into · fold) ⇒ ความรู้สึกจึงยังเป็น text editor (Obsidian) ไม่ใช่ Notion
>
> **spec เต็ม + หลักฐาน + กับดักเทคนิค: [09 — Editor UX](09-editor-ux.md)** · decision: [08 ข้อ 63–72](08-decisions.md)
> (รวม Q7 asset filename charset ที่ย้ายมาจาก M4)
>
> **เป้าที่วัดได้:** เปิดเอกสาร → คลิก/พิมพ์ได้ทันที **โดยไม่มีการแทนที่เนื้อหาทั้งบทความ** (0 request `/api/render` หลังแตะ)
> และทุก block มี affordance ให้ย้าย/แปลง/ลบ/ซ้อน — โดยไฟล์ยังเป็น markdown ที่ `doku check` ผ่าน

### Track A — one surface (ปิดข้อ 52 ให้จริง) ✅

- [x] mount CM6 ตั้งแต่โหลดหน้าเอกสาร (idle) — ลบ swap path (`mountWritingSurface` / `paintRendered`)
      · カーจากคลิกเป็น native ของ CM6 (ลบ `offsetForElement` ทิ้งทั้งหมด)
- [x] scroll/anchor — `scrollRestoration = manual` + sessionStorage anchor (posAtCoords) + heading map ของ TOC
- [x] `data-title-in-body` เซ็ตที่ server ครั้งเดียว จาก `CachedDoc.dedupe` + CSS ผูกกับ `data-editor-mounted`
- [x] **SSE guard เปลี่ยน `data-editing` → `data-dirty`** + event `doku:saved` กัน echo + เทสต์ autosave ตัวเอง
- [x] `@media print` + a11y pass (คีย์บอร์ดอ่าน · screen reader · 200% zoom · 360px)

### Track B — read-parity (ไม่เห็น markdown ดิบ) ✅

- [x] GFM parser + `markdownKeymap` (Enter สืบ list · Backspace ลบ marker) — Tab nest เต็มรูปแบบอยู่ที่ C3
- [x] widget: `:::` (หัว block + พื้นตาม variant ตาม renderer จริง) · math (`$…$`/`$$…$$` → KaTeX) · **checkbox คลิกได้** · `hr` · image · inline `:badge[…]` (placeholder ต่อ block อยู่ที่ E)
- [x] code block: chrome เท่าหน้าอ่าน + โทเคนสี map กับ Shiki github-light/dark (`--k-code-*`) — ยังไม่ทำ per-language (ไม่มี dep ภาษา)
- [x] marker policy: atomic **เฉพาะ delimiter** (`EditorView.atomicRanges`) · ซ่อนเมื่อカーไม่สัมผัส · **composition guard (ห้าม rebuild ขณะ IME ทำงาน)**

### Track C — block layer (+ drag & drop) ✅

- [x] **C1** `BlockInfo` (line range) + hover gutter `+` / `⋮⋮` + block highlight · follow mouse ต่อ frame · pin · delay 200ms + hit-area
      (`packages/server/src/web/editor/blocks.ts` = block model + operations แบบ pure md → md)
- [x] **C2** block selection (`Esc` · คลิก handle · ลากข้าม block) + multi-block + block-aware `Cmd+A` / `Backspace` (StateField เก็บช่วง)
- [x] **C3** คีย์ลัด: `Mod+Shift+↑/↓` move · `Mod+D` duplicate · `Mod+/` turn into · `Tab`/`Shift+Tab` nest · `Shift+Delete` ลบ block
- [x] **C4** drag & drop: drop indicator · depth จากตำแหน่งแนวนอน · multi-block · long-press 150ms (touch) · pointer ≤ 1 งาน/frame
      (ยกเลิกได้: `pointercancel`/วางที่เดิมไม่แตะไฟล์)

### Track D — inline layer

- [ ] bubble toolbar เมื่อเลือกข้อความ (B · I · S · code · link · highlight) → เขียน markdown
- [ ] `Cmd+B/I/E` + **override `Mod-i`/`Mod-/` ก่อน `defaultKeymap`** · link popover (`Cmd+K`)
- [ ] paste URL ทับข้อความที่เลือก → link · smart paste HTML → markdown · `:emoji:`

### Track E — quality lock + asset charset (ข้อ 72)

- [ ] focus line + active block · empty-block placeholder · motion + `prefers-reduced-motion`
- [ ] **perf budget เป็นเทสต์:** decoration rebuild ≤ 8ms/keystroke บนเอกสาร 3,000 บรรทัด (visible-only + incremental)
- [ ] แยกไฟล์ `web/editor.ts` → `editor/{decorations,blocks,gutter,inline,keymap}.ts`
- [ ] **Q7 ⇒ ข้อ 72** — `isSafeAssetName()` ตัวเดียวใน `core` + `doku check` code `asset_name_invalid` (error) + route `/assets/*path` ไม่ผ่าน = 404 + render warning/placeholder
- [ ] `bun run shot` เพิ่ม scenario: พิมพ์ไทย/IME · เลือก/ลาก block · a11y 360px + 200% zoom
- [ ] docs sync — `docs/03 §5` (visual spec ของ gutter/inline bar) · `docs/07` · `docs/08` · `AGENTS.md`

**เสร็จ:** เปิดเอกสารแล้วพิมพ์ได้ทันทีโดยไม่มี swap · มี `+`/`⋮⋮` ตอบสนองเมาส์และคีย์ลัดครบทุก action
· พิมพ์ไทยด้วย IME แล้วカー/decoration ไม่เพี้ยน · table ยังเป็นแบบเดิมตามข้อ 68

**ประเมิน:** ~7–9 วันทำงาน (C4 = ก้อนใหญ่สุด — ถ้าจำเป็นให้ส่ง C1–C3 ก่อนแล้วปิด C4 ในรอบเดียวกัน · เพิ่ม milestone ใหม่ต้องเคาะก่อน)

---

## M4 — AI access

- [ ] REST ครบ (docs/folders/assets/render/tree/trash) — **asset upload ต้องใช้ `isSafeAssetName()` ตัวเดียวกับข้อ 72**
- [ ] `/context/*path`, `/schema` (จาก Zod)
- [ ] audit log
- [ ] `doku mcp` (stdio) tools ตาม [05](05-api-and-agent-access.md) — ยกเว้น `doc_search` (รอ index ที่ M5)

**เสร็จ:** Hermes สร้าง/แก้/จัดโฟลเดอร์ผ่าน MCP ได้ (ลบได้แค่ soft)

---

## M5 — Index, search, deploy structure

- [ ] **Drizzle** schema + migration (bun:sqlite) + FTS5
- [ ] incremental index ตาม file hash
- [ ] `/api/search` + หน้า search + MCP `doc_search`
- [ ] backlinks + wikilink resolve
- [ ] `doku build` export offline
- [ ] **วางโครง docker** (`Dockerfile` + `docker-compose.yml` + volume) — ยังไม่ build
- [ ] backup script (auto-git vault)

**เสร็จ:** ค้นหาเร็ว, backlinks ทำงาน, โครง deploy พร้อมค่อยเปิดใช้

---

## หลัง v1

- D2 diagram code block (server-side SVG + cache)
- Kroki gateway (ตอนมี docker)
- graph view ของ backlinks
- comments / annotations
- kanban / task persist
- semantic search (`sqlite-vec`)
- PDF export
- token auth (เมื่อออกนอก LAN)

---

## รอเคาะ

ย้ายไปรวมที่ [08 — Decisions](08-decisions.md) ที่เดียว (ตอนนี้ยังไม่มีคำถามค้าง)

## ประมาณการ

| milestone | scope |
|---|---|
| M0 | ~1–1.5 วัน (unified + shiki + katex) |
| M1 | ~1.5–2 วัน (server + tree + Tailwind chrome) |
| M2 | ~2–3 วัน (blocks + CSS) |
| M3 | ~3–4 วัน (folder mgmt + trash + editor) |
| M3.1 | ~5–6 วัน (UI/UX pass 2 — reading room + writing surface) |
| M3.2 | ~7–9 วัน (one surface + block layer + inline; drag = ก้อนใหญ่สุด) |
| M4 | ~1.5–2 วัน |
| M5 | ~2 วัน |

MVP ใช้จริง = **M0 + M1 + M2**
