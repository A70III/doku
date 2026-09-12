# 06 — Security

บริบท: **home server ส่วนตัว ใช้เองในบ้าน ไม่ publish** — แต่ AI เขียนเนื้อหาได้ → ถือ content ไม่น่าเชื่อถือ

## Threat model (ย่อตามบริบท)

| ภัย | มาตรการ |
|---|---|
| XSS จาก md/block | ปิด raw HTML + sanitize allowlist |
| CSS injection จาก meta | validate ค่าสี/ตัวเลข, ไม่ต่อ string ดิบ |
| Path traversal (`../../`) | validate path + `resolve` แล้วเช็ค prefix |
| Asset อันตราย (.html, .svg script) | mime allowlist + `Content-Disposition` + SVG sanitize |
| DoS (md ยักษ์/ยิงถี่) | size limit + rate limit |
| ใครใน LAN แก้ได้ | **ยอมรับ** (LAN เชื่อได้, ไม่มี auth) — เผื่อโครง token ไว้ทีหลัง |
| AI เขียนพลาดทับงาน | revision + ETag conflict |

**ไม่มีภัย publish/visibility** — เพราะระบบนี้ใช้ส่วนตัว ไม่มี public surface

## Sanitization

สองชั้น:
1. **remark-rehype ไม่เปิด `allowDangerousHtml`** — raw HTML ไม่ผ่านตั้งแต่ต้น
2. **rehype-sanitize allowlist** — เผื่อ block เราเองมี bug

- tag: `p div span h1-h6 ul ol li blockquote pre code table thead tbody tr th td a img figure figcaption mark strong em del hr br aside details summary video source audio button input label kbd sup sub`
- attr: `href src alt title class id width height colspan rowspan type checked disabled start`
  → **ไม่ให้ `style`** ใช้ class เท่านั้น (`style` ของ AI-risk สูง)
- `href` อนุญาต `http(s)`, `/`, `#`, relative; ตัด `javascript:`
- ตัด `on*` ทั้งหมด
- raw color (`#hex`) ปิด default — เปิดได้ถ้าอยาก (`theme.allowRawColor`)

library: **rehype-sanitize** (schema typed) เท่านั้น — ไม่ใช้ sanitize-html
ถ้าต้องการชั้นสองเพิ่ม ค่อยเพิ่ม allowlist เฉพาะ block ที่เราเขียนเอง

- **ไม่มี `svg` / `path` ใน allowlist และจะไม่เพิ่ม** — icon ของ block ส่งทำเป็น CSS `mask-image` แทน ([08 ข้อ 35](08-decisions.md))
  เพราะ `<svg>` ที่ AI เขียนได้เปิดทาง `foreignObject` / `use` / event attribute ซึ่งคุมด้วย allowlist ยากกว่า tag ปกติมาก
- SVG ที่อัปโหลดเป็น asset ยังผ่าน mime allowlist + `Content-Disposition: inline` + CSP `default-src 'none'` ของ route asset (script ไม่ทำงาน)

## CSP

```
default-src 'none';
img-src 'self' data:;
media-src 'self';
style-src 'self' 'unsafe-inline';
script-src 'self' 'nonce-<random>';
connect-src 'self';
font-src 'self';
frame-ancestors 'none';
base-uri 'none'
```

- ไม่มี CDN ภายนอก (vendor ไฟล์เอง) → offline ได้
- `'unsafe-inline'` เฉพาะ style (CSS var ต่อเอกสาร) ยอมรับได้ถ้า script ปลอด
- เข้มกว่านี้: ย้าย theme override เป็น `<style nonce>` ที่ server สร้าง

## Path safety (สำคัญเพราะ path มาจาก user/agent)

```ts
function safeJoin(vault: string, rel: string) {
  const abs = path.resolve(vault, rel)
  const root = path.resolve(vault) + path.sep
  if (!abs.startsWith(root)) throw new Error("path escapes vault")
  return abs
}
```

- normalize: ตัด `..`, `/` นำหน้า, control chars, `<>:"|?*`
- asset filename จำกัด `[a-zA-Z0-9._\-\u0E00-\u0E7F ]+`
- symlink: ไม่ตามออกนอก vault (`realpath` เช็คซ้ำ)

## Auth

**ตัดสินแล้ว: LAN only ไม่มี auth** — เปิดเฉพาะวงแลนที่เชื่อได้ ไม่มี public surface
ทุก request (คน / AI) เข้าถึงเท่ากัน → ความปลอดภัยพึ่ง sanitize + path safety + revision

**เผื่อโครงไว้ (ยังไม่ทำ):** เพิ่ม middleware token (`read`/`write`) ทีหลังได้โดยไม่แก้ route
- `config/tokens.json` (hash) + header `Authorization: Bearer`
- ใช้เมื่อต้องออกนอก LAN หรือจำกัดสิทธิ์ agent

| action | ใครทำได้ | หมายเหตุ |
|---|---|---|
| list/read/search/render | ทุกคนใน LAN | |
| create/update/move/asset | ทุกคนใน LAN | AI ก็ทำได้ |
| delete | ทุกคนใน LAN | **soft-delete เท่านั้น** → `.trash/` |
| ลบถาวร (empty trash) | **คนเท่านั้น** (เว็บ/CLI) | AI เรียกไม่ได้ |
| folder create/move/delete | ทุกคนใน LAN | |

> policy ลบถาวรบังคับที่ **API layer** — ไม่มี route ให้ agent ลบถาวร (ไม่ใช่แค่ซ่อนปุ่ม)

## Audit log

`var/audit.log` (JSONL):

```json
{"ts":"2025-09-12T10:00:00Z","actor":"hermes","token":"ci...","action":"doc.write","path":"projects/doku/design","etag":"abc","ip":"192.168.1.105"}
```

`doku audit --path projects/doku/design` ดูย้อนหลัง

## Revision / undo (safety net หลัก)

ก่อน write/move/delete ทุกครั้ง สำเนาไป `var/revisions/<path>/<timestamp>.{md,meta.json}`
เก็บ 20 rev/doc (rotate) + ปุ่ม restore ใน UI + `doku restore <path> [ts]`

ลบ = **soft-delete** ย้ายไป `vault/.trash/<ts>/...` เสมอ
`vault/.trash/**` เป็น dotfolder → watcher/tree/index ข้ามอัตโนมัติ (ไม่ถูก index เป็นเอกสาร)
**retention: auto-purge 30 วัน** หรือคนกดเคลียร์เอง (แล้วแต่ก่อน)
ลบถาวรทำได้เฉพาะคนผ่าน `POST /api/trash/empty` (ยืนยัน 2 ชั้น) — agent ไม่มี route นี้
`GET /api/trash` + `POST /api/trash/:id/restore` กู้คืนได้

## Rate limit

- write: 60 req/min
- render: 120 req/min
- upload: 10 req/min
in-memory counter ไม่ต้อง Redis

## Backup

| ข้อมูล | วิธี |
|---|---|
| `vault/` | git auto-commit ทุก 5 นาทีถ้ามี change (background) หรือ rsync |
| `var/` | ไม่ backup (regenerate ได้) |
| `config/tokens.json` | backup แยก |

## Checklist ก่อนใช้

- [ ] safeJoin ทดสอบ `../../etc/passwd`, symlink หลุด vault
- [ ] sanitize ทดสอบ XSS payload มาตรฐาน
- [ ] CSP ทดสอบ devtools ไม่มี violation
- [ ] raw HTML ปิด confirmed
- [ ] revision เขียนจริง + restore ได้
- [ ] audit log เขียนจริง
- [ ] ถ้าเปิดออกนอก LAN → ใส่ token + HTTPS ผ่าน proxy
