# 03 — Blocks & Design System

สองส่วนในไฟล์เดียว เพราะ block กับหน้าตาของมันต้องนิยามคู่กัน:

- **Part A — Syntax**: directive ทั้งหมดที่ใช้เขียนใน Markdown (syntax reference)
- **Part B — Design System**: token / layout / หลักการจัดหน้าตาของ block เหล่านั้น

ถ้าไม่รู้จัก syntax ใด ระบบจะ fallback เป็น code block + เตือน ไม่ทำเอกสารพัง

---

# Part A — Syntax

Markdown มาตรฐาน (GFM) ใช้ได้ครบ: `**bold**` `*italic*` `~~strike~~` `==mark==` `# heading` ตาราง task list footnote code block

## รูปแบบ directive

ใช้ `:::` fenced container — `remark-directive` รองรับ syntax นี้ตรงๆ, AI เดาได้

```
:::ชื่อ{key=value key2="value with space"}
เนื้อหา
:::
```

- ค่าที่ไม่มี quote = ห้ามมี space
- attribute ทั้งหมดถูก escape ก่อนใส่ HTML (กัน XSS)
- directive แบบบรรทัดเดียวใช้ `:ชื่อ[ข้อความ]{attr}` (เช่น `:badge`, `:stat`)

### การซ้อน block (สำคัญ)

**ชั้นนอกสุดต้องใช้ `:::` ที่ยาวกว่าชั้นใน** — remark-directive (micromark) ปิด container
ทุกตัวที่ fence ยาว ≤ ตัวที่ปิด ถ้าใช้ `:::` ยาวเท่ากัน ชั้นในตัวที่สองจะหลุดออกมาเป็น sibling
และเหลือ `:::` เปล่า

```md
::::tabs          ← ชั้นนอก 4 colon
:::tab{label="a"}
AAAA
:::
:::tab{label="b"}
BBBB
:::
::::              ← ปิด tabs
```

`doku check` ตรวจให้ (error `block_nesting_ambiguous`) ถ้าซ้อนด้วย fence ยาวเท่ากัน/สั้นกว่า

## Callout

```md
:::note{title="เกร็ด"}
เนื้อหา
:::
```

type: `note` `info` `tip` `success` `warning` `danger` `quote`
แสดงเป็นกล่องมีไอคอน + สีตาม type (ปรับได้ด้วย `color=`)

## Highlight สี

```md
==คำสำคัญ=={.red}
==อีกอัน=={.amber}
```

สีใน allowlist: `red orange amber yellow green teal blue purple` (+ default เหลือง)
สีดิบ (`#hex`) อนุญาตเฉพาะเมื่อ `theme.allowRawColor = true` — default ปิดเพื่อคุมธีม

## Badge / Stat (inline)

```md
:badge[BETA]{color=green}
:badge[ตัดออก]{color=red strike}
:stat[42]{label="เอกสาร"}
```

## Figure

```md
:::figure{src=assets/diagram.svg caption="Fig 1 — สถาปัตยกรรม" width=70% align=center}
:::
```

- แทน `<img>` ตรงๆ เมื่ออยากได้ caption/จัดวาง
- `width`: เปอร์เซ็นต์ความกว้าง (default `100%`)
- `align`: `left` `center` `right` **`full`** (= เต็มความกว้าง content, แทนคำว่า bleed)
- `zoom=true` → คลิกขยาย (JS เส้นเดียว)
- ถ้า `src` หาย → placeholder "asset not found: ..." ไม่ใช่รูปแตก

## Gallery

```md
::::gallery{cols=3}
:::figure{src=assets/a.png caption="A"}:::
:::figure{src=assets/b.png caption="B"}:::
:::figure{src=assets/c.png caption="C"}:::
::::
```

- grid รูปหลายใบ; `cols`: `2` `3` `4` (responsive ลดคอลัมน์อัตโนมัติ)

## Card

```md
:::card{title="Doku Design" href="/d/projects/doku/design" badge=BETA}
สรุปสั้นของเอกสาร
:::
```

- การ์ดลิงก์ ใช้ประกอบใน `:::grid` ทำ dashboard/สารบัญได้
- `href` ใช้ path ในเว็บหรือ relative ก็ได้; `icon` เป็นชื่อไอคอนที่มีในชุด

## Section

```md
:::section{type=hero}
# หัวเรื่องใหญ่
:::
```

- `type`: `hero` (เปิดเรื่อง) `divider` (เส้นคั่น) — ไม่มี `bleed` แล้ว ใช้ `:::figure{align=full}` แทน

## Key-Value

```md
:::kv
runtime: Bun
http: Hono
db: bun:sqlite
:::
```

- ตาราง 2 คอลัมน์; format `key: value` บรรทัดละคู่

## Stats

```md
:::stats
:stat[42]{label="เอกสาร"}
:stat[18]{label="แท็ก"}
:stat[7]{label="โฟลเดอร์"}
:::
```

- แถวตัวเลขใหญ่ + label; ใช้ `:stat` ข้างในเท่านั้น

## Progress

```md
:::progress{value=70 label="M2 — blocks"}
:::
```

- `value`: 0–100; `label` optional

## Steps

```md
:::steps
1. ติดตั้ง workspace
2. เขียน core
3. รัน server
:::
```

- ลำดับมีเลขกำกับ (ordered list ธรรมดา render พิเศษ)

## Timeline

```md
:::timeline
- 2025-09 :: เริ่มโปรเจกต์
- 2025-10 :: M0 เสร็จ
:::
```

- format `- <label> :: <ข้อความ>`; เรียงจากบนลงล่าง

## Margin note

```md
:::margin-note{side=right}
โน้ตข้าง — desktop วางข้าง, mobile ย่อเป็น inline
:::
```

- `side`: `left` `right` (default `right`)

## Animation / Motion

```md
:::motion{effect=fade-up delay=200ms duration=400ms once=true}
เนื้อหาที่จะค่อยๆ โผล่
:::
```

effect allowlist: `fade` `fade-up` `fade-down` `slide-left` `slide-right` `scale` `blur-in`

หลักการ:
- CSS animation ล้วน ไม่มี library
- `IntersectionObserver` ตัวเดียวในหน้าคุมทุก block
- `prefers-reduced-motion` → ข้าม animation ทันที
- `render.motion = false` → ไม่ animate ทั้งเอกสาร
- ไม่รองรับ custom keyframe จาก md (กัน CSS injection)

## Collapsible / Details

```md
:::details{summary="กดเพื่อดูรายละเอียด" open=false}
เนื้อหาที่ซ่อน
:::
```

## Tabs

```md
::::tabs
:::tab{label="macOS"}
คำสั่งสำหรับ mac
:::
:::tab{label="Linux"}
คำสั่งสำหรับ linux
:::
::::
```

JS ตัวเล็ก toggle class; ไม่มี JS → แสดงทุก tab ซ้อนกัน (อ่านได้)

## Grid / Col

```md
::::grid{cols=2 gap=md}
:::col
ซ้าย
:::
:::col
ขวา
:::
::::
```

- `cols`: `2` `3` `4`; `gap`: `sm` `md` `lg`

## Code block

````md
```ts title="server.ts" {3-5}
const a = 1
```
````

- `title=` → แสดงชื่อไฟล์
- `{3-5}` → highlight บรรทัด
- copy button (JS)
- syntax highlight ฝั่ง server (ไม่ส่ง highlighter ไป client) → static export สวยฟรี

## Diagram

**ไม่ใช้ Mermaid** — ทางเลือก:

### A. Excalidraw → SVG/PNG ใน assets (แนะนำเป็นหลัก)
วาดมือ เก็บเป็น `assets/diagram.svg` แล้วใช้ `:::figure{src=...}` — zero dep

### B. Diagram-as-code → server-side SVG + cache by hash
| tool | syntax | deploy | หมายเหตุ |
|---|---|---|---|
| **D2** | D2 DSL | binary เดียว | theme ดี, SVG สวย — แนะนำ |
| Graphviz DOT | DOT | binary เดียว | graph คลาสสิก |
| PlantUML | PlantUML | Java (หนัก) | UML ครบ |
| Kroki | รวมหลายภาษา | ต้องมี service | gateway เดียวจบ |

fenced ```` ```d2 ```` → เรียก binary → SVG → cache `var/diagrams/<hash>.svg` → embed
ถ้า binary ไม่มี → แสดง code block + เตือน

### C. ASCII / Unicode
ใน code block — zero dep, อ่านใน git ง่าย, เหมาะ diagram เบา ๆ

**สรุป:** เริ่ม **A + C**, เพิ่ม **B (D2)** หลัง v1, เก็บ Kroki เป็น option

## Math

`$inline$` และ `$$block$$` ผ่าน KaTeX — ปิดด้วย `render.math=false`

## Video / Audio

```md
:::video{src=assets/demo.mp4 poster=assets/cover.png loop muted}
:::
```

- รองรับ `.mp4 .webm` และ audio `.mp3`
- ใช้ native `<video>` ไม่มี player library
- ไม่รองรับ iframe/embed ภายนอก (allowlist ปิด)

## Links & Backlinks

- ลิงก์ภายใน: `[ชื่อ](./other.md)`, `[ชื่อ](/d/projects/doku/design)` หรือ `[[design]]` / `[[projects/doku/design]]`
- resolve ตาม path ใน vault (ดู [02](02-content-format.md#links))
- renderer เก็บกราฟ links ตอน index → แสดง "เอกสารถูกอ้างถึง" ท้ายหน้า
- footnote GFM ใช้ได้ปกติ

## Extension registry

custom block ทุกตัวนิยามในไฟล์เดียว:

```ts
// packages/core/src/blocks/callout.ts
export default {
  name: "callout",
  render(attrs, content) {
    // คืน HTML ที่ escape แล้ว
  },
  validate(attrs) { /* คืน error[] */ }
}
```

เพิ่ม block ใหม่ = เพิ่ม 1 ไฟล์ + register ใน `packages/core/src/blocks/index.ts` ไม่ต้องแตะ core

## หลักการออกแบบ syntax

1. เลือก `:::` เพราะ remark-directive มี container directive อยู่แล้ว + AI เดา pattern ได้
2. ทุก attribute เป็น key=value ธรรมดา ไม่มี mini-language
3. ค่าที่ไม่รู้จัก → ignore + เตือน (forward compatible)
4. ไม่มี block ไหนที่รันโค้ด — declarative ล้วน

---

# Part B — Design System

ทำให้เนื้อหา markdown ดู "ออกแบบแล้ว" และทุก block หน้าตาสม่ำเสมอ

## หลักการ

1. **Token-first** — สี/ระยะ/ฟอนต์/เงา มาจาก CSS variable เท่านั้น ห้าม hardcode ใน component
2. **Chrome ≠ Content** — Tailwind คุม app chrome, CSS layer `.doku-*` คุมเนื้อหาเอกสาร
3. **Component vocabulary ไม่ใช่ class ต่อเนื้อหา** — primitive น้อยๆ แล้วประกอบ
4. **Thai-first typography** — line-height/ฟอนต์รองรับไทยโดยไม่ทำให้ latin หลุด
5. **Motion เบา** — scroll-reveal สั้นๆ เคารพ `prefers-reduced-motion`
6. **ทุก block มี 1 directive + ตัวอย่างใน `/styleguide`** — คนออกแบบได้ AI เลียนแบบได้

## 1. Design Tokens

### 1.1 Color

```css
:root {
  /* surface */
  --k-app-bg:      #f4f7fd;   /* พื้นหลังหลังการ์ด */
  --k-bg:          #ffffff;   /* พื้นการ์ด/เนื้อหา */
  --d-bg-subtle:   #f6f8fa;   /* code, blockquote */
  --d-bg-muted:    #eef2f5;   /* hover, zebra */

  /* line */
  --d-border:        #d8dee6;
  --d-border-strong: #c2cbd6;

  /* text */
  --k-text:        #1f2328;
  --d-text-muted:  #656d76;
  --d-text-subtle: #8b949e;

  /* accent (default; override ได้ต่อเอกสาร) */
  --d-accent:      #3b7df0;
  --d-accent-weak: rgba(59,125,240,.10);
}

[data-theme="dark"] {
  --k-app-bg:      #0a0d12;
  --k-bg:          #0d1117;
  --d-bg-subtle:   #161b22;
  --d-bg-muted:    #21262d;
  --d-border:        #30363d;
  --d-border-strong: #484f58;
  --k-text:        #e6edf3;
  --d-text-muted:  #8b949e;
  --d-text-subtle: #6e7681;
  --d-accent:      #58a6ff;
  --d-accent-weak: rgba(88,166,255,.14);
}
```

**Semantic palette** (callout / badge / highlight ใช้ร่วมกัน):

| token | light | dark | ใช้กับ |
|---|---|---|---|
| `--k-success` | `#1a7f37` | `#3fb950` | success |
| `--k-warning` | `#9a6700` | `#d2991d` | warning |
| `--k-danger` | `#cf222e` | `#f85149` | danger |
| `--k-info` | `#0969da` | `#58a6ff` | info, note |
| `--k-tip` | `#8250df` | `#bc8cff` | tip |
| `--k-quote` | `--d-text-muted` | เดียวกัน | quote |

แต่ละสีมีคู่ soft bg: `--k-<name>-bg` (light tint) — ใช้เป็นพื้น callout

### 1.2 Per-doc accent

- `meta.theme.accent` (hex) → set `--doc-accent` บน `<html data-accent>`
- CSS: `html[data-accent] { --d-accent: var(--doc-accent); --d-accent-weak: color-mix(in srgb, var(--doc-accent) 12%, transparent); }`
- ไม่มี → ใช้ default กลาง (ไม่ผูกหมวด เพราะไม่มี category)
- validate เฉพาะ `#rrggbb` (กัน CSS injection — ดู [06](06-security.md))

### 1.3 Typography

```css
--d-font-sans: 'Inter', 'Noto Sans Thai', system-ui, sans-serif;
--d-font-mono: 'JetBrains Mono', ui-monospace, Consolas, monospace;

--d-text-xs:   .75rem;    /* 12 */
--d-text-sm:   .875rem;   /* 14 */
--d-text-base: 1rem;      /* 16 */
--d-text-lg:   1.125rem;  /* 18 */
--d-text-xl:   1.375rem;  /* 22 */
--d-text-2xl:  clamp(1.5rem, 1.3rem + 1vw, 1.875rem);
--d-text-3xl:  clamp(1.75rem, 1.5rem + 1.4vw, 2.25rem);

--k-leading-body: 1.75;   /* latin */
--k-measure: 68ch;        /* ความกว้างอ่านสบาย */
```

- `:lang(th)` → `line-height: 1.9`
- heading ใช้ `text-wrap: balance`, paragraph ใช้ `text-wrap: pretty`
- heading step: h1 3xl, h2 2xl, h3 xl, h4 lg

### 1.4 Space / Radius / Shadow

```css
--d-space-1:.25rem; --d-space-2:.5rem;  --d-space-3:.75rem; --d-space-4:1rem;
--d-space-6:1.5rem; --d-space-8:2rem;   --d-space-12:3rem;

--d-radius-sm:.5rem; --d-radius-md:.75rem; --d-radius-lg:1rem; --d-radius-pill:999px;

--k-shadow-sm: 0 1px 2px rgba(0,0,0,.06);
--k-shadow-md: 0 4px 16px rgba(0,0,0,.08);
--k-shadow-lg: 0 12px 32px rgba(0,0,0,.12);
```

### 1.5 Motion

```css
--d-dur-fast: 120ms;  --d-dur: 200ms;  --d-dur-slow: 320ms;
--d-ease: cubic-bezier(.2,.8,.2,1);
--k-reveal-y: 8px;
```

`@media (prefers-reduced-motion: reduce)` → ปิด transition/animation ทั้งหมดที่ block ใช้

## 2. Layout

### Reading page

```
┌───────────────┬────────────────────────────────────┐
│ sidebar 260px │  ┌──────────────────────────────┐  │
│ - back        │  │ main card (max 760px center) │  │
│ - title/meta  │  │  h1 → meta → content         │  │
│ - TOC (sticky)│  │  ... blocks ...              │  │
│ - theme/zen   │  │  backlinks · footer          │  │
│               │  └──────────────────────────────┘  │
└───────────────┴────────────────────────────────────┘
  progress bar (fixed top)
```

- เนื้อหาเป็น **การ์ดลอย** บน `--k-app-bg` (depth)
- `max-width` เนื้อหา = `--k-measure`
- sidebar sticky `height:100vh` + TOC active (IntersectionObserver `rootMargin: -10% 0px -80%`)

### Hub page

```
┌────────────────────────────────────────────────────┐
│ header: search (Ctrl+K) · stats · theme · zen      │
├──────────────┬─────────────────────────────────────┤
│ file tree    │ list ของเอกสาร (pinned/recent)      │
│ (โฟลเดอร์)     │ การ์ด/แถว แสดง title·tags·วันที่     │
│              │ + tag cloud + date group            │
└──────────────┴─────────────────────────────────────┘
```

**ไม่มีแท็บ/คอลัมน์แยกหมวด** — หมวดคือโฟลเดอร์ใน tree (ดู [02](02-content-format.md))

### Breakpoints

| name | width | เปลี่ยน |
|---|---|---|
| `sm` | 640 | ปรับ padding |
| `md` | 900 | sidebar ยังอยู่, tree เป็น drawer ได้ |
| `lg` | 1200 | เต็ม layout |

## 3. Component Taxonomy

ไม่สร้าง class ใหม่ต่อเนื้อหา — ใช้ **primitive น้อย + ประกอบ** (ทุกตัวมี syntax ใน Part A):

| กลุ่ม | components |
|---|---|
| **Primitive** | `grid` `col` `section(hero/divider)` `card` |
| **Semantic** | `callout` (note/info/tip/success/warning/danger/quote) |
| **Data** | `kv` `stats` `progress` `timeline` `steps` |
| **Media** | `figure` `gallery` `video` `code` `diagram` |
| **Annotation** | `margin-note` `highlight` |
| **Interactive** | `tabs` `details` `copy` |
| **Nav** | `toc` `backlinks` `related` |

### Attribute-based styling

block renderer ใส่ data attribute ไม่ใช่ class ใหม่:

```html
<aside data-block="callout" data-variant="warning">…</aside>
<figure data-block="figure" data-align="center" data-zoom>…</figure>
```

CSS ยิงด้วย `[data-block="callout"][data-variant="warning"]` → เพิ่ม variant = เพิ่ม CSS ไม่กี่บรรทัด ไม่ต้องตั้งชื่อ class

## 4. Reading UX

- **Progress bar** — fixed top, ความกว้าง = scroll %
- **TOC** — active + auto-scroll, mobile เป็น bottom sheet
- **Heading anchor** — ปุ่ม copy-link ตอน hover
- **Zen mode** (`z`) — ซ่อน sidebar, ขยาย measure, ปุ่ม ESC ออก _(ทำใน M3)_
- **Backlinks / related** — ท้ายเอกสาร จาก link index
- **Doc footer** — แก้ไขล่าสุด, source path, word count + อ่านกี่นาที
- **Keyboard** — `/` search · `t` TOC · `z` zen · `d` dark · `?` shortcuts

## 5. Landing / Vault Browser

- **Command palette (Ctrl+K)** — quick-switcher ค้นชื่อไฟล์ + tag + เนื้อหา (FTS) _(ทำใน M3)_
- **File tree** เต็ม (พับได้, จำ state ใน localStorage)
- **List**: pinned → recent → ทั้งหมด, date group (Today/Yesterday/Week/…)
- **Tag cloud** pill สี deterministic (hash → hue) + filter
- **Stats** ต่อ vault: จำนวนเอกสาร / tags / อัปเดตล่าสุด
- **States**: skeleton ตอนโหลด, error card ตอน server ดับ
- **Continue reading** — จำเอกสารล่าสุดที่เปิด (localStorage)

## 6. Motion

- ใช้เฉพาะ **scroll-reveal** (`fade-up` 8px, 300ms) และ micro-interaction (hover 120ms)
- effect allowlist: `fade fade-up fade-down slide-left slide-right scale blur-in`
- `IntersectionObserver` ตัวเดียวคุมทุก block ในหน้า
- `once=true` default (ไม่ animate ซ้ำ)
- reduced-motion → แสดงทันที
- ห้าม animation ที่ขยับ layout

## 7. Accessibility

- contrast ≥ WCAG AA ทั้ง light/dark
- focus ring ชัด (`:focus-visible`)
- `<details>`/`<summary>` native → keyboard ใช้ได้ฟรี
- Tabs/lightbox ต้องคุม focus + `aria-selected`/`role="dialog"`
- รูปทุกใบต้องมี `alt` (figure ใช้ caption เป็น default alt ถ้าไม่มี)
- ไม่ใช้สีสื่อนัยเดียว (callout มี icon + ข้อความกำกับ)

## 8. Print / Export

- `@media print`: ตัด sidebar/toolbar, พื้นขาว, ลิงก์โชว์ URL, ไม่มี motion
- margin-note → ย่อเป็น inline block
- code block ไม่ตัดกลาง, table มี border ชัด
- ใช้ทำ PDF ผ่าน browser ได้ (static export M5)

## 9. Styleguide Page

`/styleguide` — render **ทุก block ทุก variant** ด้วยเนื้อหาตัวอย่าง

- ใช้ iterate ดีไซน์ในที่เดียว
- **และให้ AI ดูว่ามี block อะไรใช้ได้** → เขียน block ได้ถูกตั้งแต่ครั้งแรก
- `/api/schema` คืนรายการ block + attr ที่อนุญาต (generate จาก registry)
- golden snapshot test: render `examples/` → เทียบ HTML (คุมดีไซน์ไม่พังเงียบ)

## 10. Naming Conventions

| ส่วน | วิธี |
|---|---|
| App chrome | Tailwind utility + component TSX (`<Sidebar>`, `<FileTree>`) |
| เนื้อหา | CSS layer `.doku-prose` + `[data-block="…"]` |
| Token | `--k-*` |
| CSS file | `packages/server/src/web/styles/tokens.css`, `prose.css`, `blocks.css` |
| Block renderer | `packages/core/src/blocks/<name>.ts` (ดู [Extension registry](#extension-registry)) |
