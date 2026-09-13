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

### เนื้อในของ block

block บางตัว **ไม่ใช้เนื้อใน** (`figure` · `video` · `progress` · `section{type=divider}` · `tabs`)
— ถ้าเขียนเนื้อในมา ระบบ **แสดงต่อท้ายให้เสมอ ไม่ทิ้ง** พร้อม warning `block_stray_child`
(เช่น เนื้อในของ `:::figure` ออกหลัง caption · `:::tabs` ที่มีอย่างอื่นนอกจาก `:::tab` ย้ายไปท้ายบล็อก)
หลักการ: **ผิด/ไม่รู้จัก = ไม่ทำข้อมูลหาย** (docs/08 ข้อ 60/61/67/68)

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
:::figure{src=assets/a.png caption="A"}
:::
:::figure{src=assets/b.png caption="B"}
:::
:::figure{src=assets/c.png caption="C"}
:::
::::
```

- grid รูปหลายใบ; `cols`: `2` `3` `4` (responsive ลดคอลัมน์อัตโนมัติ)
- **แต่ละ `:::figure` ต้องเปิด–ปิดคนละบรรทัด** — `:::figure{…}:::` บรรทัดเดียว micromark
  อ่านเป็นข้อความธรรมดา (block ไม่ทำงาน) · `:::` แบบบรรทัดเดียวที่ตามหลัง directive ใช้ได้เฉพาะ
  กรณีเปิด+ปิดพร้อมกัน → ระบบถือว่าไม่ค้าง stack

## Card

```md
:::card{title="Doku Design" href="/d/projects/doku/design" badge=BETA}
สรุปสั้นของเอกสาร
:::
```

- การ์ดลิงก์ ใช้ประกอบใน `:::grid` ทำ dashboard/สารบัญได้
- `href` ใช้ path ในเว็บหรือ relative ก็ได้; `icon` เป็นชื่อไอคอนที่มีในชุด
- **ไม่มี `href` = ไม่ใช่ลิงก์** — render เป็น `<div>` (ไม่ใช่ `<a>` ที่คลิกไม่ได้)

## Section

```md
:::section{type=hero}
# หัวเรื่องใหญ่
:::
```

- `type`: `hero` (เปิดเรื่อง) `divider` (เส้นคั่น) — ไม่มี `bleed` แล้ว ใช้ `:::figure{align=full}` แทน
- `divider` แสดงเป็น `<hr>` — ถ้าใส่เนื้อในมา จะแสดงต่อท้ายเส้นให้ + `block_stray_child` (ไม่ทิ้ง)

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
- `value` ผิด (ไม่ใช่ตัวเลข 0–100) → **ไม่มีแถบ** แต่ label/เนื้อในยังแสดง (ไม่มี label = แสดงข้อความบอกเหตุแทน)
  + warning `block_attribute_unknown` — ไม่ทิ้ง block ทั้งก้อนอีกต่อไป

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

- เนื้อหาใน `::::tabs` ที่ **ไม่ใช่** `:::tab` (ย่อหน้าคั่นกลาง · block อื่น) ไม่ใช่ panel — ระบบ
  **ย้ายไปท้ายบล็อกให้ + warning `block_stray_child`** ไม่ทิ้ง (docs/08 ข้อ 67)

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
:::video{src=assets/demo.mp4}
:::

:::video{src=https://youtu.be/dQw4w9WgXcQ}
:::
```

- `src` มี attribute เดียว: path ของ asset ใน vault (relative จากโฟลเดอร์เอกสาร หรือ `/assets/…`)
  หรือ URL ของ YouTube (`youtube.com/watch?v=…` · `youtu.be/…` · `youtube.com/shorts/…` · `embed/…`)
- ไฟล์วิดีโอ → native `<video>` (controls เปิดเสมอ, `preload="metadata"`) · ไฟล์เสียง
  (`.mp3 .m4a .wav .ogg .opus .flac`) → `<audio>` · ไม่มี player library
- **poster มาจาก `src`** — ถ้ามีไฟล์รูปชื่อเดียวกันในโฟลเดอร์เดียวกัน (`clip.mp4` → `clip.png`) ระบบใส่
  `poster` ให้เอง ไม่มี attribute ให้ตั้ง · ไม่มีก็ไม่เป็นไร เบราว์เซอร์จะโชว์เฟรมแรกเอง
- YouTube → `<iframe>` จาก `youtube-nocookie.com` (CSP `frame-src` เปิดเฉพาะโดเมนนี้)
- **ไม่รองรับ** embed/ไฟล์จากภายนอกอื่น (allowlist ปิด) — เขียนมาจะได้ placeholder + warning
- `loop` / `muted` / `controls` / `poster` **ไม่ใช่ attribute ของ block นี้อีกแล้ว** (docs/08 ข้อ 65)
- `src` หาย หรือเป็นลิงก์ภายนอกที่ไม่ใช่ YouTube → placeholder พร้อมข้อความบอกเหตุ (ไม่ใช่กล่องเปล่า)

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

#### กติกาที่ทำให้สี "ไม่เพี้ยน" (M3.1 — [08 ข้อ 47](08-decisions.md))

ค่าสีทั้งชุดถูกคำนวณใหม่ใน **OKLCH** แล้ว **verify contrast เป็นคู่จริง** (รวม `color-mix()` ที่ composite บนพื้นจริง)
ไม่ใช่ตรวจด้วยสายตา — เพราะ 4 คลาสนี้ "ผ่านตา" แต่ **ตก WCAG จริง**:

| คลาสที่เคยตก | ก่อน | หลัง |
|---|---|---|
| เส้นขอบคอนโทรล (input/ช่องกรอก) | 1.35:1 · ผิด WCAG 1.4.11 | **`--d-border-control` ≥ 3.0:1** |
| ข้อความ palette บน tint ของตัวเอง (badge) | 4.14–4.47:1 | **≥ 5.77:1** (ผ่าน `--k-<name>-ink`) |
| semantic บน `--d-bg-subtle` / `--d-bg-muted` (stat · card · callout) | 3.87–4.48:1 | **≥ 5.9:1** |
| `--d-text-subtle` บน `--d-bg-muted` | 4.33:1 | **4.58:1** |

**กฎ 3 ข้อที่บังคับ:**

1. **hairline ≠ control border** — `--d-border` / `--d-border-strong` เป็น *เครื่องประดับโครงสร้าง* contrast ต่ำได้
   ส่วนเส้นขอบที่ **บอกว่าสิ่งนี้เป็นคอนโทรล** (input · select · textarea · toggle) ต้องใช้ **`--d-border-control`**
2. **ข้อความบน tint ของสีต้องใช้ `--k-<name>-ink` ไม่ใช่ `--k-<name>`** — สีอิ่มตัวสงวนไว้ให้ *rule · icon · underline · stat-line*
   (`-ink` = `color-mix(in oklab, var(--k-<name>) 78%, var(--k-text))` → dark ได้เฉดอ่อน light ได้เฉดเข้ม อัตโนมัติทั้งสองธีม ไม่ต้องดูแลสองชุด)
3. **ห้าม hardcode `#fff` / `#000` / สีใหม่ใน component** — overlay ใช้ `--k-scrim` + `--k-on-scrim`, ข้อความบน accent ใช้ `--k-on-accent`

**หลักการ hue:** ทุก hue ตั้ง **L (OKLCH lightness) เท่ากันในธีมเดียวกัน** (light ≈ 0.50–0.53 · dark ≈ 0.65)
→ แดง/ส้ม/เหลือง/เขียว/น้ำเงิน หนักเบาเท่ากันหมด ไม่มีตัวไหน "สกปรก" หรือ "นีออน" กว่าใคร
(เดิม yellow `#8a6d00` **เข้มกว่า** amber `#9a6700` — กลับด้านกับที่ตาคาด)

| token | light | dark | ใช้กับ |
|---|---|---|---|
| `--k-app-bg` | `#f6f4ef` | `#14120f` | rail / chrome (เข้มกว่า `--k-bg` พอจะแยกโซนได้ด้วยพื้น) |
| `--k-bg` | `#fffefb` | `#1a1815` | พื้นเนื้อหา / เอกสาร |
| `--d-bg-subtle` | `#f1eee8` | `#221f1a` | inset panel · code · blockquote |
| `--d-bg-muted` | `#e9e5dd` | `#2b2721` | hover · zebra |
| `--d-border` | `#e2dcd2` | `#332f28` | hairline (ประดับ) |
| `--d-border-strong` | `#cfc8bc` | `#4a443a` | hairline ที่ต้องอ่านออก (โครงสร้าง) |
| **`--d-border-control`** | **`#8d8984`** | **`#6c6964`** | **เส้นขอบคอนโทรล — ≥ 3:1 (WCAG 1.4.11)** |
| `--k-text` | `#1c1a17` | `#ece7de` | ตัวอักษรหลัก (worst 13.8:1) |
| `--d-text-muted` | `#5a544b` | `#a8a196` | รอง (worst 5.96:1) |
| `--d-text-subtle` | `#6b655f` | `#948e87` | meta (worst 4.58:1 — ผ่านบน `--d-bg-muted` ด้วย) |
| `--d-accent` | `#2b5fc4` | `#5b93e0` | สถานะปัจจุบัน link/active/focus (worst 4.73:1) |
| `--k-on-accent` | `#fffefb` | `#14120f` | ข้อความบน accent ทึบ |
| `--d-selection` | accent 24% | accent 30% | `::selection` — ต้องเห็นจริง (เดิม 10% แทบมองไม่เห็น) |
| `--k-scrim` | `rgb(28 26 23 / .88)` | เดียวกัน | พื้น overlay / lightbox figure |
| `--k-on-scrim` | `#fffefb` | เดียวกัน | ข้อความบน scrim |

- **`--d-accent` light คงเดิม `#2b5fc4`** ([08 ข้อ 5](08-decisions.md) — 5.9:1 บนพื้นเนื้อหา) · **dark เปลี่ยนจาก `#58a6ff` → `#5b93e0`**
  เพราะค่าเดิม OKLCH chroma .152 / lightness .72 อ่านเป็น **นีออนเย็นบนพื้นน้ำตาลอุ่น** — ค่าใหม่ .120/.66 ยังผ่านทุกคู่ (link 4.73:1 · focus ring 5.23:1)
- `--d-accent-weak` = `color-mix(in srgb, var(--d-accent) 14%, transparent)` · **`--d-accent-tint`** = `color-mix(in srgb, var(--d-accent) 8%, var(--k-bg))` (พื้นทึบสำหรับ chip/badge)
- **`data-theme="auto"` (default)**: ค่า dark ถูก emit ทั้ง `[data-theme="dark"]` และ `@media (prefers-color-scheme: dark) [data-theme="auto"]` — ถ้าลืม block หลัง โหมด auto จะไม่มีวันเป็น dark

**Palette + semantic** — semantic เป็น **alias ของ palette ไม่ใช่ชุดที่สอง** (ลดจำนวนสีที่ต้องดูแล/ตรวจ):

| hue | light `--k-<name>` | dark `--k-<name>` | light `-ink` | dark `-ink` | semantic |
|---|---|---|---|---|---|
| red | `#b83933` | `#d77166` | `#93352e` | `#de8c80` | `--k-danger` |
| orange | `#a05100` | `#c57e4c` | `#814512` | `#cf956d` | — |
| amber | `#875f00` | `#b08842` | `#6e4f12` | `#bd9d67` | `--k-warning` |
| yellow | `#796400` | `#a18e41` | `#635312` | `#b1a166` | — |
| green | `#057635` | `#559e67` | `#1a602f` | `#78ae80` | `--k-success` |
| teal | `#007273` | `#3a9d9c` | `#195d5d` | `#69adaa` | — |
| blue | `#1766bd` | `#5a91d6` | `#1f5595` | `#7ba5d9` | `--k-info` |
| purple | `#824db4` | `#a77bd7` | `#69428e` | `#b693da` | `--k-tip` |

- `--k-<name>` ผ่าน **≥ 4.55:1** บน `--k-bg` / `--d-bg-subtle` / `--d-bg-muted` / `--k-app-bg` และบน tint ตัวเอง 12%
- `--k-<name>-ink` ผ่าน **≥ 5.77:1** บนพื้นเดียวกันทั้งหมด + tint 9–12% (badge · callout title · stat value)
- พื้น soft: callout = `color-mix(in srgb, var(--k-<name>) 9%, var(--k-bg))` · badge = 12% · `--k-quote` = `--d-text-muted`
- **คู่สีทั้งหมดถูก lock ด้วย test**: `bun test packages/core/src/styles/contrast.test.ts` — เพิ่มสี/แก้ค่าโดยไม่ผ่าน test = แดง
  (แหล่งความจริงของตัวเลขคือ token ใน `tokens.ts` · test อ่านค่าจากไฟล์เดียวกัน ไม่ copy)

```css
:root {
  /* surface — อุ่นทั้งตระกูล · rail เข้มกว่า paper พอให้แยกโซนด้วยพื้น */
  --k-app-bg:      #f6f4ef;   /* rail / chrome */
  --k-bg:          #fffefb;   /* พื้นเนื้อหา / เอกสาร */
  --d-bg-subtle:   #f1eee8;   /* inset panel · code · blockquote */
  --d-bg-muted:    #e9e5dd;   /* hover · zebra */

  /* line — 3 ระดับ: ประดับ / โครงสร้าง / คอนโทรล */
  --d-border:         #e2dcd2;
  --d-border-strong:  #cfc8bc;
  --d-border-control: #8d8984;  /* WCAG 1.4.11 — เฉพาะเส้นขอบคอนโทรล */

  /* text */
  --k-text:        #1c1a17;
  --d-text-muted:  #5a544b;
  --d-text-subtle: #6b655f;

  /* accent — เดียว ใช้กับสถานะปัจจุบัน */
  --d-accent:       #2b5fc4;
  --d-accent-weak:  color-mix(in srgb, var(--d-accent) 14%, transparent);
  --d-accent-tint:  color-mix(in srgb, var(--d-accent) 8%, var(--k-bg));
  --k-on-accent:    #fffefb;
  --d-selection:    color-mix(in srgb, var(--d-accent) 24%, transparent);

  /* overlay (ใช้ร่วมทั้งสองธีม — scrim มืดเสมอ) */
  --k-scrim:      rgb(28 26 23 / .88);
  --k-on-scrim:   #fffefb;

  /* palette — L (OKLCH lightness) เท่ากันทุก hue */
  --k-red:    #b83933;  --k-orange: #a05100;  --k-amber:   #875f00;  --k-yellow: #796400;
  --k-green:  #057635;  --k-teal:   #007273;  --k-blue:    #1766bd;  --k-purple: #824db4;

  /* hue-ink — สำหรับข้อความบน tint ของ hue นั้น */
  --k-red-ink:    #93352e;  --k-orange-ink: #814512;  --k-amber-ink:   #6e4f12;  --k-yellow-ink: #635312;
  --k-green-ink:  #1a602f;  --k-teal-ink:   #195d5d;  --k-blue-ink:    #1f5595;  --k-purple-ink: #69428e;

  /* semantic = alias ของ palette */
  --k-success: var(--k-green);  --k-warning: var(--k-amber);  --k-danger:  var(--k-red);
  --k-info:    var(--k-blue);   --k-tip:     var(--k-purple); --k-quote:   var(--d-text-muted);
}
```

> ค่าจริงอยู่ใน `packages/core/src/styles/tokens.ts` เท่านั้น — code block นี้คือสำเนาไว้ให้อ่าน spec
> ถ้าสองที่ไม่ตรง ให้ยึด token + test (`contrast.test.ts`) เป็นตัวตัดสิน

### 1.2 Per-doc accent

- `meta.theme.accent` (hex) → set `--doc-accent` บน `<html data-accent>`
- CSS: `html[data-accent] { --d-accent: var(--doc-accent); --d-accent-weak: color-mix(in srgb, var(--doc-accent) 12%, transparent); }`
- ไม่มี → ใช้ default กลาง (ไม่ผูกหมวด เพราะไม่มี category)
- validate เฉพาะ `#rrggbb` (กัน CSS injection — ดู [06](06-security.md))

### 1.3 Typography

มี **2 สเกลที่แยกกัน** ([08 ข้อ 48](08-decisions.md)) — chrome (rail/toolbar/panel) กับ **reading surface** (เนื้อหา)
เดิมใช้สเกลเดียวกันทั้งสองโลก → เอกสารอ่านเป็น "แอป" ไม่ใช่ "หน้า"

```css
/* ฟอนต์ — ชุดเดียวกันทั้งสองโลก */
--d-font-sans: 'Inter', 'Noto Sans Thai', system-ui, sans-serif;
--d-font-mono: 'JetBrains Mono', ui-monospace, Consolas, monospace;

/* chrome scale — ปุ่ม · label · panel · rail */
--d-text-xs:  .75rem;  --d-text-sm:  .875rem;  --d-text-base: 1rem;
--d-text-lg:  1.125rem; --d-text-xl: 1.375rem;
--d-text-2xl: clamp(1.5rem, 1.3rem + 1vw, 1.875rem);    /* block/chrome: stat-value ฯลฯ */
--d-text-3xl: clamp(1.75rem, 1.5rem + 1.4vw, 2.25rem);

/* reading scale — `.doku-prose` + คอลัมน์อ่านเท่านั้น */
--d-read:      1.0625rem;                               /* body 17px */
--d-read-lede: 1.125rem;
--d-read-h4:   1.0625rem;                               /* = body แต่ weight 600 */
--d-read-h3:   1.25rem;
--d-read-h2:   clamp(1.5rem, 1.35rem + .6vw, 1.75rem);
--d-read-h1:   clamp(2rem, 1.6rem + 1.4vw, 2.75rem);

/* leading + measure */
--k-leading-body: 1.7;    /* latin (เดิม define 1.75 แต่ไม่มีใครใช้) */
--k-leading-th:   1.9;    /* :lang(th) */
--k-measure:      70ch;   /* ≈ 700px ที่ 17px */
```

- `:lang(th)` → `line-height: var(--k-leading-th)` · ย่อหน้าผสมไทย/อังกฤษใช้ leading เดียวกันทั้งย่อหน้า
- heading ใช้ `text-wrap: balance` · paragraph `text-wrap: pretty`
- **ขั้นของ heading ต้องกว้างพอให้เห็นลำดับ**: h1 → h2 → h3 → h4 = 2.75 → 1.75 → 1.25 → 1.0625 rem (≈ 1.57 / 1.4 / 1.18)
  — เดิม h1 36px → h2 30px (1.2) แคบเกินไปจนสองชั้นดูเท่ากัน
- **weight ใช้แค่ 2 ระดับ: 400 (body) + 600 (heading/strong)** — ตัด 500/700 ออกเพื่อให้ hierarchy มาจาก *ขนาด + ระยะ* ไม่ใช่ความหนา
- `--d-text-2xl/3xl` **ไม่ใช้ใน prose** — สงวนไว้ให้ block datum (stat-value) และ chrome
- `--k-leading-body` เดิมถูก define แต่ **ไม่มี selector ไหนใช้** → M3.1 ผูกเข้ากับ `.doku-prose` จริง

### 1.4 Space / Radius / Shadow

**ทิศทาง:** radius **เล็กและคงที่** (2/4/6px) · shadow เฉพาะ overlay จริง (menu/modal/popover)
หน้าปกติสร้าง depth จาก hairline + พื้นหลังจาง + whitespace ไม่ใช่เงา · `--d-radius-pill` ใช้เฉพาะ chip/tag ขนาดเล็ก

```css
/* สเกลระยะ — M3.1 ขยายจากเดิมที่จนที่ 3rem */
--d-space-1: .25rem; --d-space-2: .5rem;  --d-space-3: .75rem; --d-space-4: 1rem;
--d-space-5: 1.25rem; --d-space-6: 1.5rem; --d-space-8: 2rem;  --d-space-10: 2.5rem;
--d-space-12: 3rem;  --d-space-16: 4rem;  --d-space-20: 5rem;  --d-space-24: 6rem;

/* chrome rhythm */
--d-gutter:        var(--d-space-6);   /* ระยะขอบ shell/rail/panel */

/* prose rhythm — prose ใช้ค่าเหล่านี้ที่่านั้น ห้ามตั้ง margin เดี่ยว */
--d-flow:         var(--d-space-6);    /* 24px ระหว่าง block ธรรมดา (เดิม 16) */
--d-flow-loose:   var(--d-space-8);    /* block หนัก: figure · gallery · code · table · callout */
--d-rhythm-h2:    var(--d-space-16);   /* 64px ก่อน h2 */
--d-rhythm-h3:    var(--d-space-12);
--d-rhythm-h4:    var(--d-space-8);
--d-rhythm-after: var(--d-space-3);    /* 12px หลัง heading */

/* radius — คงที่ ไม่เปลี่ยนตามความสำคัญของ element */
--d-radius-sm: 2px; --d-radius-md: 4px; --d-radius-lg: 6px; --d-radius-pill: 999px;

/* shadow — เฉพาะ overlay จริงเท่านั้น */
--k-shadow-sm: 0 1px 2px rgb(28 26 23 / .05);
--k-shadow-md: 0 2px 8px rgb(28 26 23 / .08);
--k-shadow-lg: 0 4px 16px rgb(28 26 23 / .10);
```

**กฎจังหวะ: "มาก่อน heading · น้อยหลัง heading"** — ตาต้องรู้ว่าหัวข้อเป็นเจ้าของย่อหน้าถัดไป
`h2 { margin-block: var(--d-rhythm-h2) var(--d-rhythm-after) }` · **ห้ามให้ margin บน = ล่าง**

**เจ้าของระยะแนวตั้งมีตัวเดียว** — flow rule ใน `prose.ts` (`:not(:first-child)` ไม่ใช่ `* + *`)

- element rule **ห้ามตั้ง margin แนวตั้ง** · `margin: 0` shorthand reset `margin-top` ด้วย → ต้องมี specificity
  ต่ำกว่า flow rule เสมอ (คือบั๊กที่ทำให้ย่อหน้าติดกันทั้งเอกสาร — [08 ข้อ 69](08-decisions.md))
- **หลัง heading = `--d-rhythm-after` ตัวเดียว** — ลูกที่ตามหลัง heading/`hr` **ไม่รับ flow**
  (margin ของมันจะ collapse กับ margin ของ heading → 24px แทนที่จะเป็น 12px)
- ค่าเริ่มต้น `--d-flow` · block หนัก `pre`/`table`/`figure`/`gallery`/`callout` = `--d-flow-loose`
  · container แน่น (`card-body`/`callout`/`details`/`margin-note`) + `li` = `--d-space-2`
- block ที่ต้องจัดระยะเอง (โน้ตข้างที่ลอย ≥1400px · figure zoom · print) ตั้ง **`--dk-flow`** ที่ *ตัวเอง*
  — custom property cascade ปกติ ไม่ต้องสู้ specificity (และ `@property inherits: false` — ลูกไม่รับค่าไปด้วย)
- บังคับด้วย `packages/core/src/styles/rhythm.test.ts` + rhythm check ใน `bun run shot` (วัดระยะจริงระหว่างกล่อง)

- **สเกลต้องนิ่ง** — class ใหม่ทุกตัวต้องใช้ token จากลิสต์นี้ · ห้าม `padding: 13px` / `gap: .7rem` ตรง ๆ ใน component
- **ห้ามอ้าง `--d-space-*` ที่ไม่มีในลิสต์** — CSS จะทิ้ง declaration ทั้งก้อนเงียบ ๆ
  (นี่คือสาเหตุที่ rail/panel ไม่มี padding: `.doku-rail { padding: var(--d-space-6) var(--d-space-5) }` แต่ `--d-space-5` ไม่ถูก define → [08 ข้อ 50](08-decisions.md))
- ลิสต์นี้ถูกลอกด้วย test: `packages/core/src/styles/tokens.test.ts` ตรวจว่าทุก `var(--d-space-N)` ที่ใช้ในโค้ดถูก define

migrate แล้วใน UI pass ([08 ข้อ 36](08-decisions.md))

### 1.5 Motion

```css
--d-dur-fast: 120ms;  --d-dur: 200ms;  --d-dur-slow: 320ms;
--d-ease: cubic-bezier(.2,.8,.2,1);
--k-reveal-y: 8px;
```

`@media (prefers-reduced-motion: reduce)` → ปิด transition/animation ทั้งหมดที่ block ใช้

## 2. Layout

### Reading page (≥ 1200px)

```
┌────────────┬────────────────────────────────┬──────────────┐
│ rail 248px │   reading column (max 70ch)    │ TOC 208px    │
│ tree       │   h1 · lede · meta             │ sticky       │
│ (quiet)    │   ── section ──                │ ▸ active     │
│            │   content (air)                │              │
│ footer     │   colophon: path · แก้ล่าสุด     │              │
└────────────┴────────────────────────────────┴──────────────┘
  progress hairline 2px (fixed top)
```

- **3 คอลัมน์: rail · reading column · TOC** — คอลัมน์อ่าน **จัดกลาง** ในพื้นที่ที่เหลือ (`margin-inline: auto`)
  → แก้ปัญหาเดิม: `main` 880px แต่ `article` 544px **ชิดซ้าย** = gutter ขวาว่าง 336px (38%) โดยไม่มีอะไรใช้
- **TOC เป็น sticky column ไม่ใช่ block ในบทความ** ([08 ข้อ 49](08-decisions.md)) — เดิม render เป็น `<nav class="doku-toc">`
  ในเนื้อหา สูงถึง **352px (39% ของ viewport)** อยู่ก่อนเนื้อหาจะเริ่ม
  - `< 1200px` (ไม่มีที่พอ): TOC เป็น `<details>` **ท้ายเอกสาร** ไม่ใช่ block ที่สองของหน้า
  - จอแคบ/mobile: TOC เป็น bottom sheet เปิดจาก toolbar
  - active ตาม `IntersectionObserver` (`rootMargin: -10% 0px -80%`)
- **colophon ท้ายเอกสาร**: path id · แก้ไขล่าสุด · revision ล่าสุด — เดิมเป็น mono label **เหนือ h1** (`.doku-shelfmark`) ซึ่งแย่งความสนใจชื่อเรื่อง
- เนื้อหาอยู่บนพื้นหน้าโดยตรง — แยกจาก chrome ด้วย **พื้น (`--k-app-bg` เข้มกว่า `--k-bg`) + whitespace**
  (ยกเลิก "การ์ดลอยบน `--k-app-bg`" ของ M2 — [08 ข้อ 32](08-decisions.md))
- toolbar **ไม่ใช่แถวปุ่มเหนือชื่อเรื่อง** — **ไม่มีปุ่ม "แก้ไข"** (เอกสารพิมพ์ได้ทันที) · เหลือปุ่ม `⋯` (คุณสมบัติ · ประวัติ · ย้าย · ลบ) + ปุ่ม zen ที่มุมขวา ([08 ข้อ 51](08-decisions.md))

### Writing state — ไม่มี state พิเศษ ([08 ข้อ 52](08-decisions.md))

เอกสารที่เปิดอยู่ **เป็น editor ตั้งแต่แรก** — ไม่มีปุ่ม "แก้ไข" ไม่มีโหมด ไม่มี overlay/split
คลิกที่ไหน カーไปที่นั่น พิมพ์ได้ทันที (Notion-like)

```
┌────────────┬────────────────────────────────┬──────────────┐
│ rail       │ ┌ ▸ note   ชนิด/สี/ชื่อ  ⋯ ┐│ TOC          │
│ (เดิม)     │ │ :::note{title="เกร็ด"}         ││ ▸ active     │
│            │ │ เนื้อหา…                    ││              │
│            │ └──────────────────────────┘│              │
│            │  "/" ที่ต้นบรรทัดว่าง → เมนู block │              │
│            │  autosave เงียบ · ไม่มี Save   │              │
└────────────┴────────────────────────────────┴──────────────┘
```

- คอลัมน์/ฟอนต์/leading **เดียวกับตอนอ่านเป๊ะ** — ผิวเดียว (ไม่ใช่ overlay ไม่ใช่ split pane ไม่มี resize)
- **หัวเอกสาร (ชื่อเรื่อง · สรุป · meta) อยู่นอกส่วนที่แก้** — ส่วนที่ editor แทนที่คือเนื้อหาเท่านั้น
  (`#doku-doc-body`) · ถ้าหัวเรื่องอยู่ใน fragment เดียวกัน ชื่อเอกสารจะหายขณะพิมพ์
  (fragment ที่ cache = warnings + เนื้อหา · ชื่อเรื่อง render จาก meta ที่ TSX)
- syntax marker ซ่อนเมื่อカーอยู่นอก node · node ที่ render ได้ (table · figure · code · math · `:::`) กลายเป็น widget ในบรรทัด
- **block control strip** ลอยเหนือบรรทัดแรกของ `:::` เมื่อカーเข้า → แก้ variant/`color=`/`title=`/`icon=`/align/width แล้ว **เขียนกลับเป็นข้อความ directive**
  · สีของ `==mark==` แก้ผ่านแถบ swatch เมื่อカーอยู่ในช่วง — เขียนกลับ `{.color}` ใน markdown เสมอ (docs/08 ข้อ 6/55)
- autosave ตาม debounce · ออกด้วย `Esc` (カーออกจากเอกสาร → คีย์ลัดงานอ่านกลับมาทำงาน)
- ยังไม่มีカー = หน้าตาเหมือนหน้าอ่านทุกอย่าง ต่างกันแค่พิมพ์ได้

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
| `sm` | 640 | ปรับ padding · toolbar เหลือไอคอน · TOC เปิดเป็นแผ่น (sheet) |
| `md` | 960 | rail ปรากฏ (248px) · TOC ยังไม่ (เปิดเป็นแผ่นจากปุ่มใน toolbar) |
| `lg` | 1200 | **3 คอลัมน์เต็ม** · TOC sticky |
| `xl` | 1536 | shell กว้างขึ้น · `--k-measure` **คงเดิม** (ห้ามยืดบรรทัดตามจอ) |

- shell `max-width: 90rem` (เดิม 72rem ทำให้จอกว้างเหลือที่ว่างโดยใช้ไม่ได้)
- ลำดับการยุบเมื่อจอแคบ: **TOC → rail → toolbar** (เนื้อหายุบเป็นอย่างสุดท้าย)

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

### บันได container กับ block (M3.1 — [08 ข้อ 53](08-decisions.md))

**ตรวจจากหน้าเว็บจริง (computed style)**: block เกือบทุกตัวมีกรอบหรือพื้นหลังของตัวเอง — หน้าเว็บจึงอ่านเป็น "กริดของกล่อง" ไม่ใช่เอกสาร
ขัด [08 ข้อ 32](08-decisions.md) (card ไม่ใช่ default) และเป็นเหตุผลหลักของความรู้สึก "รวบ ๆ เรียบ ๆ"

กฎต่อ block (ไต่บันได หยุดที่ขั้นแรกที่พอ):

| block | ก่อน (M2/M3) | หลัง (M3.1) — เหตุผล |
|---|---|---|
| `section` | border + `bg-subtle` + pad | **ไม่มี container** — แยกด้วยระยะ + heading size (rung 1/3) · `divider` = hairline เส้นเดียว |
| `stats` / `stat` | border + `bg-subtle` | ไม่มีกรอบ · ตัวเลขกับ label อยู่บนพื้นหน้า · คั่นด้วย whitespace |
| `kv` | ตารางมีกรอบ | เป็น **definition list** — label จาง/น้ำหนักเบา, hairline เฉพาะระหว่างแถว (rung 2) |
| `card` | border + `bg` + **shadow** | คงไว้เป็น card **เพราะเป็น object จริงที่มีการกระทำ** — แต่**ตัด shadow** (remaining depth จาก hairline) |
| `grid` / `col` | border | ไม่มีกรอบเลย — เป็น layout อย่างเดียว |
| `steps` / `timeline` | box ต่อ item | เส้นแนวตั้งเส้นเดียว + marker (rung 2) |
| `details` / `tabs` | border รอบ block | hairline เฉพาะเส้นคั่น header (rung 2) |
| `callout` | ✅ คงไว้ — พื้น tint + rule ซ้าย (เป็็นความหมาย ไม่ใช่การประดับ) |
| `figure` / `gallery` / `code` / `table` / `video` | ✅ คงไว้ — เป็น object จริง |
| `badge` / `mark` | ✅ inline ไม่นับเป็น container |
| `margin-note` / `motion` | ไม่มีกรอบอยู่แล้ว — เพิ่มได้แค่ hairline แนวตั้ง |

> เกณฑ์ตัดสิน: **ถ้าลบกรอบออกแล้วข้อมูลยังอ่านรู้เรื่อง → ลบ** · กรอบที่เหลือต้อง *บอกความหมาย* (callout = เตือน, code = คนละชนิดข้อมูล) ไม่ใช่ *บอกว่ากลุ่มนี้เป็นกลุ่ม*

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

- **Progress bar** — fixed top, 2px, ความกว้าง = scroll % (accent, ไม่ใช่ shadow)
- **TOC** — sticky column (≥1200px) · active ตาม `IntersectionObserver` · จอแคบเป็น `<details>` ท้ายเอกสาร / bottom sheet
- **Heading anchor** — ปุ่ม copy-link ตอน hover/focus (ต้องเป็น `:focus-visible` ด้วย ไม่ใช่แค่ `:hover`)
- **Zen mode** (`z`) — ซ่อน rail/TOC, ขยาย measure, ESC ออก
- **Backlinks / related** — ท้ายเอกสาร จาก link index (M5)
- **Colophon ท้ายเอกสาร** — path id · แก้ไขล่าสุด · revision ล่าสุด (แทน `.doku-shelfmark` เหนือ h1)
- **Keyboard** — คีย์ลัดขึ้นกับ **focus** ไม่ใช่โหมด:
  - **カーอยู่นอกเอกสาร**: `/` search · `Ctrl+K` palette · `t` TOC · `z` zen · `d` dark · `?` shortcuts
  - **カーอยู่ในเอกสาร**: `/` = slash menu · `Mod+B/I/K` · `Esc` = ออกจากเอกสาร (カーหลุด → กลับชุดแรก)
  - ทุกคีย์ต้องเห็นจากที่เดียว (palette) — ไม่มีคีย์ที่กดได้แต่ไม่มีที่บอก

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
