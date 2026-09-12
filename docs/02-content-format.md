# 02 — Content Format (Vault)

## แนวคิด

`vault/` = โฟลเดอร์เนื้อหาหนึ่งอัน **ซ้อนโฟลเดอร์ได้ไม่จำกัด เหมือน Obsidian**
ทุกไฟล์ `.md` ใน vault คือเอกสาร 1 ชิ้น — ไม่ต้องมี meta ก็เป็นเอกสาร

**การจัดหมวดใช้ "โฟลเดอร์" อย่างเดียว** — ไม่มี field `category` / ไม่มี research-vs-docs
จะแบ่งหมวดก็แค่สร้างโฟลเดอร์ก่อนวางเอกสาร

```
vault/
  projects/
    kairn/
      design.md
      design.meta.json        ← optional
      assets/
        diagram.png
      research.md
  daily/
    2025-09-12.md
  _folder.meta.json           ← optional (จัดลำดับ/ไอคอนโฟลเดอร์)
```

## Identity = path

path ของไฟล์ relative จาก vault ตัด `.md` ออก คือ id

| ไฟล์ | id | URL |
|---|---|---|
| `vault/design.md` | `design` | `/d/design` |
| `vault/projects/kairn/design.md` | `projects/kairn/design` | `/d/projects/kairn/design` |

ไม่มี field `id` ใน meta — path คือ id (ย้ายไฟล์ = เปลี่ยน id แต่ทำ redirect ได้ด้วย `relations.moved_from`)

## เอกสาร

### `*.md` — เนื้อหา

Markdown GFM + custom blocks ([03](03-blocks-and-design-system.md))
ใช้ YAML frontmatter ได้ (เพื่อ compat Obsidian) แต่ **meta.json ชนะ**
frontmatter เป็นของ optional สำหรับ editor ภายนอก ไม่ถูกเก็บลง index

```md
---
title: ชื่อชั่วคราว
tags: [guide]
---
# หัวเรื่อง
เนื้อหา...
```

### `*.meta.json` — optional sidecar

ชื่อคู่กับ md: `design.md` → `design.meta.json`
**ไม่มีก็ได้** — ระบบเดา title จากชื่อไฟล์, tags ว่าง, ใช้ theme กลาง

```json
{
  "$schema": "https://kairn.local/schema/meta.schema.json",
  "title": "Kairn Design",
  "summary": "ออกแบบระบบ",
  "tags": ["design", "kairn"],
  "status": "active",
  "created": "2025-09-12T00:00:00Z",
  "authors": [{ "name": "เย่เว่ย", "type": "human" }],
  "theme": { "accent": "#7c3aed", "mode": "auto" },
  "render": { "toc": true, "math": true, "motion": true, "diagram": true },
  "relations": { "related": ["projects/kairn/research"], "moved_from": [] },
  "agent": { "last_editor": "hermes", "generated": false },
  "pinned": false,
  "order": 10
}
```

### Field reference

| field | ค่า | default |
|---|---|---|
| `title` | string | ชื่อไฟล์ |
| `summary` | string ≤ 280 | – |
| `tags` | string[] ≤ 8, lowercase-kebab | `[]` |
| `status` | `active` \| `draft` \| `archived` — **แค่ป้าย ไม่ใช่สิทธิ์** | `active` |
| `created` | ISO 8601 date-time | mtime แรก |
| `authors` | `{name, type: human\|ai}[]` | – |
| `theme` | `{accent, mode: auto\|light\|dark}` | กลาง |
| `render` | `{toc, math, motion, diagram}` | true ทั้งหมด |
| `relations.related` | path[] | `[]` |
| `relations.moved_from` | path[] — ทำ redirect เก่า→ใหม่ | `[]` |
| `agent` | `{last_editor, generated}` | ระบบเติม |
| `pinned` | bool — ปักในหน้าแรก | false |
| `order` | number — จัดลำดับในโฟลเดอร์ | alphabetical |

> `$schema` เป็น **hint ไม่บังคับ** สำหรับ editor — ชี้ไปที่ JSON Schema ที่ generate จาก Zod
> (serve ผ่าน `GET /api/schema`; ดู [04](04-tech-stack.md)) — ใส่หรือไม่ก็ได้

ไม่มี `visibility` / `published` — ใช้เองในบ้าน ไม่มี publish
ไม่มี `category` — จัดหมวดด้วยโฟลเดอร์เท่านั้น (ดู [01](01-architecture.md#sidebar-tree))

## โฟลเดอร์

- โฟลเดอร์ = กลุ่ม ยังไม่มี meta ก็ทำงานได้
- `_folder.meta.json` ในโฟลเดอร์นั้นสำหรับจัดแต่ง:

```json
{
  "title": "Projects",
  "icon": "folder",
  "color": "#3b82f6",
  "order": 1,
  "collapsed": false
}
```

- โฟลเดอร์ย่อย sort: `order` → ตามด้วยชื่อ
- ไฟล์ sort: `pinned` → `order` → ตามด้วยชื่อ
- ย้าย/สร้าง/ลบโฟลเดอร์ผ่าน UI หรือ API ได้ (ดู [05](05-api-and-agent-access.md))

## Assets

- ไฟล์ที่ไม่ใช่ `.md` / `.meta.json` = asset
- วางที่ไหนก็ได้ — แนะนำ `assets/` ข้างไฟล์ md
- อ้างด้วย path สัมพัทธ์จากตัว md: `assets/diagram.png` หรือ `../shared/logo.png`
- รองรับ `.png .jpg .webp .gif .svg .mp4 .webm .mp3 .json(lottie) .pdf`
- ห้าม absolute path / `../` หลุด vault → validator เตือน
- renderer rewrite เป็น `/assets/<asset-path-in-vault>?h=<hash>` (path เต็มจาก vault — ไม่กำกวม)
- asset ไม่ถูก render เป็นเอกสาร
- `vault/.trash/**` และ dotfile/dotfolder ไม่ถูกมองเป็น asset/เอกสาร

## Links

> ก่อน index จะพร้อม (M5) ลิงก์ resolve แบบ scan ตามต้องการได้ — backlinks ค่อยมาที่ M5

| รูปแบบ | resolve ยังไง |
|---|---|
| `[x](./design.md)` | path สัมพัทธ์ |
| `[x](/d/projects/kairn/design)` | absolute ในเว็บ |
| `[[design]]` | หา basename ทั้ง vault — ซ้ำ = เตือน เลือกตัวแรก |
| `[[projects/kairn/design]]` | path ตรงจาก vault |
| `[[design\|ชื่อที่แสดง]]` | มี alias |

ทุก link ถูกเก็บลง link table ตอน index → ทำ backlinks ได้

## Slug / filename rules

- อนุญาต Unicode (ไทยได้), เว้นวรรคได้ แต่แนะนำ kebab
- ห้าม: `..`, `/` นำหน้า, ตัวอักษรควบคุม, `<>:"|?*`
- URL encode ฝั่ง server อัตโนมัติ
- validate ด้วย `path.resolve` + เช็ค prefix เสมอ (ดู [06](06-security.md))

## Validation (`kairn check`)

- meta ผ่าน JSON Schema, `title`/`tags` รูปถูก
- asset path ที่อ้างมีจริง + ไม่หลุด vault
- link ภายใน resolve ได้ (ไม่มี broken/ambiguous)
- custom block รู้จัก + ปิดครบ
- orphan assets + เอกสารที่ไม่มี title
- `_folder.meta.json` ผ่าน Zod (object เดียวกับ meta — ไม่มี schema ไฟล์แยก)

exit code ≠ 0 ถ้ามี error → ใช้ pre-commit/CI

## ใช้ร่วมกับ Obsidian

vault เปิดด้วย Obsidian ได้ตรงๆ (`.md` + frontmatter + relative asset) เพื่อ **อ่าน/แก้ไฟล์**
แต่ Kairn เป็นเจ้าของ vault และเป็น renderer จริง — ยังไม่มี plugin (ตัดออกจาก scope)

- `design.meta.json` / `_folder.meta.json` จะโผล่ใน file explorer ของ Obsidian — ซ่อนด้วย "Excluded files" ได้
- frontmatter YAML: Obsidian เห็น, Kairn merge (meta.json ชนะ)

## ตัวอย่าง

ดู [../examples/](../examples/)
