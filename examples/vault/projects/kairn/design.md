# Kairn Design

เอกสารตัวอย่าง — path `projects/kairn/design`, ใช้ทุก feature

## Markdown พื้นฐาน

**ตัวหนา**, *ตัวเอียง*, ~~ขีดฆ่า~~, `inline code`, ==คำที่ highlight=={.amber}

- [x] task ที่ทำแล้ว
- [ ] task ที่ยังไม่ทำ

## Callout

:::warning{title="ระวัง"}
คำเตือนทั่วไป
:::

:::tip{title="เคล็ดลับ"}
ใช้ `kairn render --stdin` เพื่อ preview ก่อนเขียน
:::

## Diagram (ASCII)

```text
vault/ ──▶ resolve ──▶ render ──▶ sanitize ──▶ /d/<path>
  │                                            │
  └────────────── watcher ────────▶ cache ◀───┘
```

> รูปจริงใช้ `:::figure{src=assets/...}` — ตัวอย่างนี้เลี่ยง asset หาย

## Animation

:::motion{effect=fade-up delay=200ms}
ย่อหน้านี้จะค่อยๆ โผล่ตอนเลื่อนมาถึง
:::

## Collapsible

:::details{summary="กดเพื่อดูรายละเอียด"}
เนื้อหาที่ซ่อนอยู่
:::

## Tabs

:::tabs
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
:::

## Grid

:::grid{cols=2}
:::col
**ซ้าย** — อย่างแรก
:::
:::col
**ขวา** — อย่างที่สอง
:::
:::

## Code

```ts title="server.ts" {2}
const app = new Hono()
app.get("/", (c) => c.text("kairn"))
```

## Badge

สถานะ: :badge[BETA]{color=green} :badge[ตัดออก]{color=red strike}

## Links

relative: [research](./research.md) · absolute: [Daily](/d/daily/2025-09-12) · wiki: [[research]]
