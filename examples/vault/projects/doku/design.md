# Doku Design

เอกสารตัวอย่าง — path `projects/doku/design` ใช้ทุก block ของ M2

:::section{type=hero}
## ภาพรวม

Doku เก็บ content เป็น Markdown แล้ว render เป็น HTML · path = id · ไฟล์คือความจริง
:::

## Markdown พื้นฐาน

**ตัวหนา**, *ตัวเอียง*, ~~ขีดฆ่า~~, `inline code`

- [x] task ที่ทำแล้ว
- [ ] task ที่ยังไม่ทำ

## Highlight สี

==คำสำคัญ=={.amber} และ ==ลบแล้ว=={.red} — สีอื่น ๆ: ==เขียว=={.green} ==ฟ้า=={.blue} ==ม่วง=={.purple}

สถานะ: :badge[BETA]{color=green} :badge[ตัดออก]{color=red strike}

## Callout

:::note{title="เกร็ด"}
callout มี 7 type — note info tip success warning danger quote
:::

:::tip{title="เคล็ดลับ"}
ใช้ `doku render --stdin` เพื่อ preview ก่อนเขียน
:::

:::warning{title="ระวัง"}
คำเตือนทั่วไป
:::

:::danger
อันตราย — ใช้ `color=` override สีได้ เช่น :badge[สีฟ้า]{color=blue}
:::

## Diagram (ASCII + SVG)

```text
vault/ ──▶ resolve ──▶ render ──▶ sanitize ──▶ /d/<path>
  │                                            │
  └────────────── watcher ────────▶ cache ◀───┘
```

:::figure{src=assets/diagram.svg caption="Fig 1 — render pipeline" width=80 align=center zoom=true}
:::

## Gallery

::::gallery{cols=2}
:::figure{src=assets/diagram.svg caption="A — pipeline"}
:::
:::figure{src=assets/demo.png caption="B — poster"}
:::
::::

## Video

:::video{src=assets/demo.mp4}
:::

## Card

:::card{title="Research notes" href="projects/doku/research" badge=NOTE}
บันทึกวิจัย — ไม่มี meta.json เลย ใช้ default จากชื่อไฟล์
:::

## Grid / Col

::::grid{cols=2 gap=md}
:::col
**ซ้าย** — อย่างแรก

- รายการ
- ในคอลัมน์
:::
:::col
**ขวา** — อย่างที่สอง

> quote ในคอลัมน์
:::
::::

## Key–Value

:::kv
runtime: Bun
http: Hono
db: bun:sqlite
:::

## Stats / Progress

:::stats
:stat[42]{label="เอกสาร"}
:stat[18]{label="แท็ก"}
:stat[7]{label="โฟลเดอร์"}
:::

:::progress{value=70 label="M2 — blocks"}
:::

## Steps

:::steps
1. ติดตั้ง workspace
2. เขียน core
3. รัน server
:::

## Timeline

:::timeline
- 2025-09 :: เริ่มโปรเจกต์
- 2025-10 :: M0 เสร็จ
- 2025-11 :: M1 เสร็จ
:::

## Margin note

:::margin-note{side=right}
โน้ตข้าง — desktop วางข้าง, mobile ย่อเป็น inline
:::

## Motion

:::motion{effect=fade-up delay=200ms duration=400ms once=true}
ย่อหน้านี้จะค่อยๆ โผล่ตอนเลื่อนมาถึง
:::

## Collapsible

:::details{summary="กดเพื่อดูรายละเอียด"}
เนื้อหาที่ซ่อนอยู่
:::

## Tabs

::::tabs
:::tab{label="macOS"}
```bash
brew install bun
```
:::
:::tab{label="Linux"}
```bash
curl -fsSL https://bun.sh/install | bash
```
:::
::::

## Code

```ts title="server.ts" {2}
const app = new Hono()
app.get("/", (c) => c.text("doku"))
```

## Math

$E = mc^2$ และ

$$
\frac{1}{2} + \frac{1}{3} = \frac{5}{6}
$$

## Links

relative: [research](./research.md) · absolute: [Daily](/d/daily/2025-09-12) · wiki: [[research]]
