# 03 — Blocks & Design System

สองส่วนในไฟล์เดียว เพราะ block กับหน้าตาของมันต้องนิยามคู่กัน:

- **Part A — Syntax**: directive ทั้งหมดที่ใช้เขียนใน Markdown (syntax reference)
- **Part B — Design System**: token / layout / หลักการจัดหน้าตาของ block เหล่านั้น

ถ้าไม่รู้จัก syntax ใด ระบบจะ fallback เป็น code block + เตือน ไม่ทำเอกสารพัง

---

# Part A — Syntax

Markdown มาตรฐาน (GFM) ใช้ได้ครบ: `**bold**` `*italic*` `~~strike~~` `# heading` ตาราง task list footnote code block

`==mark=={.สี}` **ไม่ใช่ GFM** — เป็น extension ของ doku เอง (ดู [Highlight สี](#highlight-สี))

> **สถานะ block:** directive/extension ทั้งหมดใน Part A **implement แล้วที่ M2** (`packages/core/src/blocks/`)
> block ที่ไม่รู้จัก → fallback เป็น code block + warning `block_unknown` · block ที่ยังไม่ทำ → `block_unimplemented` (info) ตาม [01](01-architecture.md)
> ตรวจชื่อ/attribute ที่รองรับได้จาก `packages/core/src/blocks/registry.ts` หรือ `doku check --json` · ดูตัวอย่างจริงได้ที่ `/styleguide`
>
> `:name` กลางข้อความโดยไม่มี `[...]` (เช่น `bun:sqlite`) = ข้อความธรรมดา ไม่นับเป็น directive

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

สีใน allowlist: `red orange amber yellow green teal blue purple` (+ default = สี accent ของเอกสาร)
ค่านอก allowlist = เตือน (`block_attribute_unknown`) แล้วใช้สี accent แทน · **ยังไม่รองรับสีดิบ `#hex`**
(ขัดกับที่เคยเขียนไว้ว่ามี `theme.allowRawColor` — field นี้ไม่มีใน schema จริง, docs/08 ข้อ 30)

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
- `width`: เปอร์เซ็นต์ความกว้าง **5–100 สเต็ป 5** (default `100%`) — ค่านอกสเต็ป = เตือน แล้วใช้ 100
  (จำกัดสเต็ปเพื่อเลี่ยง inline `style` → ยังอยู่ใน sanitize allowlist, docs/08 ข้อ 29)
- `align`: `left` `center` `right` **`full`** (= เต็มความกว้าง content, แทนคำว่า bleed) — default `center`
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

custom block ทุกตัวนิยามในไฟล์เดียว และ **คืน hast element** (ไม่ใช่ HTML string) พร้อมสไตล์แบบ `data-*`:

```ts
// packages/core/src/blocks/callout.ts
export const calloutDefinition: BlockDefinition = {
  name: "callout",
  kind: "container",
  implemented: true,
  attributes: ["title", "color"],
  values: { color: BLOCK_COLORS },
  example: ':::note{title="…"}\n…\n:::',
  render(ctx) {
    // คืน hast element — rehype-sanitize จะตรวจต่อทุก node (docs/08 ข้อ 29)
    return blockElement("aside", "callout", { dataVariant: ctx.attrs.color ?? "note" }, ctx.children)
  },
}
```

- `render` รับ `BlockContext` = `{ attrs, children, node, docId, warn }`
- attribute ที่ไม่รู้จัก/ค่าไม่อยู่ใน allowlist = ignore + `block_attribute_unknown` (info)
- ค่าที่ต้องใช้เป็นตัวเลข/CSS (width, delay, progress) → validate + quantize แล้วเก็บเป็น data attribute
  แล้วให้ CSS rule ที่ generate ไว้เป็นคนแสดงผล (ไม่มี inline `style`)

เพิ่ม block ใหม่ = เพิ่ม 1 ไฟล์ + register ใน `packages/core/src/blocks/index.ts` ไม่ต้องแตะ core

## หลักการออกแบบ syntax

1. เลือก `:::` เพราะ remark-directive มี container directive อยู่แล้ว + AI เดา pattern ได้
2. ทุก attribute เป็น key=value ธรรมดา ไม่มี mini-language
3. ค่าที่ไม่รู้จัก → ignore + เตือน (forward compatible)
4. ไม่มี block ไหนที่รันโค้ด — declarative ล้วน

---

# Part B — Design System

ทำให้เนื้อหา markdown ดู "ออกแบบแล้ว" และทุก block หน้าตาสม่ำเสมอ

## ทิศทาง — Digital Archivist / Editorial Minimalism

Doku คือ **ห้องสมุดดิจิทัลร่วมสมัย** สำหรับคนที่จริงจังกับข้อมูล — ไม่ใช่ SaaS ทั่วไป และไม่ใช่ dashboard แห่งอนาคต
หน้าตาต้องมาจาก **typography · hierarchy · spacing · โครงสร้าง · ความยับยั้งชั่งใจ · จังหวะ** ไม่ใช่จากของประดับ

| ควรรู้สึก | ต้องไม่รู้สึก |
|---|---|
| สงบ · ฉลาด · editorial · เป็นผู้ใหญ่ · น่าเชื่อถือ · โฟกัส · อ่านง่าย · อบอุ่นเล็กน้อย · ตั้งใจทำ | generic SaaS · AI startup · futuristic dashboard · ชุด template สำเร็จรูป |

- **"ความเป็นห้องสมุด" มาจากการจัดลำดับข้อมูล + การจัดตัวอักษร** — ห้ามใช้ของประดับเชิงสัญลักษณ์
  (ชั้นหนังสือ · กระดาษเก่า · ลาย parchment · ขอบ/ornament คลาสสิก · UI ย้อนยุคปลอม)
- **Content over chrome** — control/navigation ห้ามดังกว่าเนื้อหาที่มันห่ออยู่
- **Editorial over SaaS** — ใช้ layout แบบหนังสือ/วารสาร/academic/catalogue/documentation เป็นค่าเริ่มต้น
  · `sidebar + topbar + กริดการ์ดมุมโค้ง` ไม่ใช่ default ของทุกหน้า · dashboard ใช้เมื่อเนื้อหาเป็น dashboard จริง
- **Typography เป็นองค์ประกอบหลักของ identity** — hierarchy มาจากขนาด/น้ำหนัก/ตัวพิมพ์ ก่อนจะไปพึ่งกล่อง สี หรือ icon
- **ความยับยั้งชั่งใจ ไม่ใช่ความว่าง** — เอาความรกออก แต่เก็บ character ไว้; เป้าหมายคือ minimal ที่ **ไม่ generic**
- กฎตัดสินเมื่อมีหลายทางเลือก: **typography แก้ได้ → ไม่เพิ่มของประดับ · spacing แก้ได้ → ไม่เพิ่ม container · hierarchy แก้ได้ → ไม่เพิ่มสี**
  แล้วเลือกทางที่ **เงียบกว่า + ชัดกว่า + อ่านง่ายกว่า + ตั้งใจมากกว่า**

### บันได container

ทุกครั้งที่ต้องแบ่งของสองอย่าง ให้ไต่ขึ้นเท่าที่จำเป็น แล้ว **หยุดที่ขั้นแรกที่พอ**:

1. **whitespace** — คำตอบเริ่มต้น ใช้เกือบตลอด
2. **divider / hairline** — แถว list · กลุ่ม metadata · ขอบ toolbar · จุดตัด section
3. **typography** (ขนาด/น้ำหนัก/ตัวพิมพ์/สี) — อันหนึ่งเป็นรองหรือเป็นหลักของอีกอัน
4. **indentation / alignment** — hierarchy ภายในบล็อกเดียวกัน
5. **พื้นหลังจาง** — ย่านที่แยกออกจริง (code · inset note · panel เงียบ)
6. **card / panel ยกพื้น** — **เมื่อเนื้อหานั้นเป็น object อิสระที่มีตัวตนและการกระทำของตัวเอง**

ขั้น 6 ต้องมีเหตุผลรองรับว่า "นี่เป็น object เดี่ยวจริง" — กริดการ์ดทุกหน้า · การ์ดซ้อนการ์ด · การ์ด 1 ใบต่อ 1 section = **ไม่ใช่เหตุผล**
(decision: [08 ข้อ 32](08-decisions.md))

## หลักการ

1. **Token-first** — สี/ระยะ/ฟอนต์/เงา มาจาก CSS variable เท่านั้น ห้าม hardcode ใน component
2. **Chrome ≠ Content** — Tailwind คุม app chrome, CSS layer `.doku-*` คุมเนื้อหาเอกสาร
3. **Component vocabulary ไม่ใช่ class ต่อเนื้อหา** — primitive น้อยๆ แล้วประกอบ
4. **Thai-first typography** — line-height/ฟอนต์รองรับไทยโดยไม่ทำให้ latin หลุด
5. **Motion เบา** — scroll-reveal สั้นๆ เคารพ `prefers-reduced-motion`
6. **ทุก block มี 1 directive + ตัวอย่างใน `/styleguide`** — คนออกแบบได้ AI เลียนแบบได้

## 1. Design Tokens

### 1.1 Color

**ทิศทาง:** พื้นผิวเป็น **warm neutral** — warm white / ivory / warm stone · ตัวอักษร **warm charcoal / ink**
(ไม่ใช่ `#fff` และ `#000` ล้วน) · **accent เดียว** (`--d-accent` default ตาม [08 ข้อ 5](08-decisions.md) — ค่าจริงดู [§1.1](#11-color))
ใช้เมื่อเป็น *สถานะปัจจุบัน* (link · active · focus · selected) · semantic สีอิ่มต่ำ ใช้เมื่อเป็น state จริงเท่านั้น

- surface / line / text ต้องอยู่ **ตระกูลอุ่นเดียวกัน** — เส้นเทาเย็นบนพื้นอุ่นเห็นได้ทันทีและดูถูกทันที
- tint ทุกตัว derive ด้วย `color-mix()` จาก token ห้ามตั้งค่าสีใหม่มือต่อ component
- สีต้องไม่เป็นตัวสื่อความหมายเดียว — ต้องมีข้อความ/น้ำหนัก/เส้นกำกับด้วย
- **ถ้าจะเพิ่ม accent ที่สองเพื่อแยกของสองอย่าง → ใช้ typography หรือโครงสร้างแทน**

ห้าม: ไล่เฉดม่วง/ฟ้าแบบ AI · neon · glow · gradient ประดับ · การ์ดสีรุ้ง · สีเป็นระบบหมวด

ค่าด้านล่างคือ **ค่าที่ใช้จริงหลัง UI pass (migrate จาก cool neutral แล้ว)** — [08 ข้อ 36](08-decisions.md):

| token | light | dark | ใช้กับ |
|---|---|---|---|
| `--k-app-bg` | `#f7f5f1` | `#14120f` | rail / พื้นหลังหน้า |
| `--k-bg` | `#fffefb` | `#1a1815` | พื้นเนื้อหา / เอกสาร |
| `--d-bg-subtle` | `#f1eee8` | `#221f1a` | code, blockquote, inset panel |
| `--d-bg-muted` | `#e9e5dd` | `#2b2721` | hover, zebra |
| `--d-border` | `#e2dcd2` | `#332f28` | hairline ทุกตัว |
| `--d-border-strong` | `#cfc8bc` | `#4a443a` | เส้นเน้น / active |
| `--k-text` | `#1c1a17` | `#ece7de` | ตัวอักษรหลัก |
| `--d-text-muted` | `#5d574e` | `#a8a196` | รอง |
| `--d-text-subtle` | `#6f695f` | `#948d80` | meta |
| `--d-accent` | `#2b5fc4` | `#58a6ff` | สถานะปัจจุบัน (link/active/focus) |

- `--d-accent-weak` = `color-mix(in srgb, var(--d-accent) 10%, transparent)` — derive จาก accent เสมอ ไม่ hardcode
- **accent**: `#3b7df0` เดิมบนพื้นอุ่นได้ contrast **3.87:1** (ไม่ผ่าน AA สำหรับ link) จึงลดความสว่างเป็น **`#2b5fc4`** (5.9:1) — ยังเป็นน้ำเงินตัวเดียวกัน แค่เข้มขึ้น
- **`--d-text-subtle`**: `#8a8378` เดิมได้ 3.7:1 → เปลี่ยนเป็น `#6f695f` (light) / `#948d80` (dark) ให้ผ่าน AA
- **`data-theme="auto"` (default)**: ค่า dark ถูก emit ทั้ง `[data-theme="dark"]` และ `@media (prefers-color-scheme: dark) [data-theme="auto"]` — ถ้าลืม block หลัง โหมด auto จะไม่มีวันเป็น dark

```css
:root {
  /* surface — อุ่นทั้งตระกูล */
  --k-app-bg:      #f7f5f1;   /* rail / พื้นหลังหน้า */
  --k-bg:          #fffefb;   /* พื้นเนื้อหา / เอกสาร */
  --d-bg-subtle:   #f1eee8;   /* code, blockquote, inset panel */
  --d-bg-muted:    #e9e5dd;   /* hover, zebra */

  /* line */
  --d-border:        #e2dcd2;
  --d-border-strong: #cfc8bc;

  /* text */
  --k-text:        #1c1a17;
  --d-text-muted:  #5d574e;
  --d-text-subtle: #6f695f;

  /* accent — เดียว ใช้กับสถานะปัจจุบัน */
  --d-accent:      #2b5fc4;
  --d-accent-weak: color-mix(in srgb, var(--d-accent) 10%, transparent);
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

--d-radius-sm:2px; --d-radius-md:4px; --d-radius-lg:6px; --d-radius-pill:999px;

--k-shadow-sm: 0 1px 2px rgba(28,26,23,.05);
--k-shadow-md: 0 2px 8px rgba(28,26,23,.08);
--k-shadow-lg: 0 4px 16px rgba(28,26,23,.10);
```

**ทิศทาง:** radius **เล็กและคงที่** (2/4/6px) · shadow ใช้เฉพาะ overlay จริง (menu/modal/popover)
หน้าปกติสร้าง depth จาก hairline + พื้นหลังจาง + whitespace ไม่ใช่เงา · `--d-radius-pill` ใช้เฉพาะ chip/tag ขนาดเล็ก ไม่ใช่ default ของปุ่ม

migrate แล้วใน UI pass ([08 ข้อ 36](08-decisions.md))

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
│ - back        │  │ reading column (max 760px)  │  │
│ - title/meta  │  │  h1 → meta → content         │  │
│ - TOC (sticky)│  │  ... blocks ...              │  │
│ - theme/zen   │  │  backlinks · footer          │  │
│               │  └──────────────────────────────┘  │
└───────────────┴────────────────────────────────────┘
  progress bar (fixed top)
```

- เนื้อหาวางบนพื้นหน้าโดยตรง — แยกจาก chrome ด้วย **hairline + whitespace**
  (ยกเลิก "การ์ดลอยบน `--k-app-bg`" ของ M2 ในรอบ UI ของ M3 — [08 ข้อ 32](08-decisions.md))
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

### Icons

ชุดไอคอน: **Lucide** — [08 ข้อ 34](08-decisions.md) (ISC · 1,600+ · grid 24px · stroke 1.5–2) · vendor subset เข้า repo · ไม่มี CDN / icon font

- **สื่อฟังก์ชันเท่านั้น** — ถ้า icon ไม่ได้ช่วยให้แยกการกระทำได้ชัดขึ้น ให้ตัดออก
- **family เดียว** (ห้ามผสม Lucide + ชุดอื่น + filled + emoji ในหน้าเดียว) · ขนาดเดียว (14–16px ใน UI ที่แน่น) · stroke เดียวทั้งแอป
- **ห้ามใช้ emoji เป็น UI** · ห้ามใช้ icon เป็นของประดับ/illustration/ตัวคั่น section · ห้ามใส่ icon คู่ทุกป้ายอัตโนมัติ
- **ห้ามใส่ icon ทุกแถวใน list** — ใช้เมื่อประเภทของแถวกำกวมจริง
- เรียกด้วยชื่อ Lucide ตรง ๆ: `folder` `file-text` `search` `panel-left` `pin` `tag` `history` `pencil` `trash-2` `copy` `check` `x` `info` `triangle-alert` `lightbulb` `circle-check` `quote` `hash`
  — ชื่อที่ไม่รู้จัก → **ไม่แสดง icon** + เตือน (forward compatible เหมือน attribute อื่น)
- **คัดเฉพาะที่ใช้** — vendor path data เข้า `packages/core/src/icons/` พร้อม ISC notice · ห้ามโหลดทั้งชุด

**วิธีส่ง icon เข้า DOM** ([08 ข้อ 35](08-decisions.md)):

| ที่ | วิธี | ทำไม |
|---|---|---|
| **chrome** (server/CLI, TSX) | inline `<svg>` จาก map ใน core · `stroke="currentColor"` | รับสีจาก token เอง · ไม่มี request เพิ่ม |
| **เนื้อหาเอกสาร** (block) | `<span data-part="…" aria-hidden="true">` + CSS `background-color: currentColor` + `mask-image: url("data:image/svg+xml,…")` | **ห้าม inline SVG เข้า sanitized HTML** (allowlist ไม่มี `svg`/`path` — [06](06-security.md)) · CSP `img-src 'self' data:` มีอยู่แล้ว ([08 ข้อ 27](08-decisions.md)) → ไม่ต้องแก้ CSP |

> ค้าง: `:::card{icon=…}` set `data-icon` แล้วยังไม่มี CSS อ่านค่า → icon หายเงียบ ทำพร้อม UI pass ที่ [M3](07-roadmap.md)

### Metadata

แสดงเป็นข้อความ ขนาดเล็ก สีจาง คั่นด้วยระยะที่คงที่ทุกหน้า (หรือ `·`) · รูปแบบต้องเหมือนกันทั้ง vault
ห้ามเปลี่ยน metadata เป็นแถว chip สี และห้ามให้ metadata หนักกว่าหัวเรื่อง

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
- **Tag filter** — แสดงเป็นข้อความ + จำนวน (chip จางได้ถ้าจำเป็น แต่ไม่ไล่สีตาม hash) · active ใช้ accent เดียว
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
| CSS file | `packages/core/src/styles/{tokens,prose,blocks}.ts` (export `CONTENT_CSS`) — ใช้ร่วม CLI + server (docs/08 ข้อ 28) |
| Block markup | `data-block="…"` / `data-variant="…"` / `data-part="…"` (ไม่ตั้งชื่อ class ใหม่) |
| Block renderer | `packages/core/src/blocks/<name>.ts` (ดู [Extension registry](#extension-registry)) |
