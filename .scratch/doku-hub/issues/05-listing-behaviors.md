# Listing behaviors — date grouping + sort ในรายการเอกสาร

Type: grilling
Status: resolved

## Question

document-hub มี grouping ตามวันที่ (วันนี้/เมื่อวาน/สัปดาห์/เดือน/เก่ากว่า) + sort (date/name/size) ต่อคอลัมน์ —
doku จะทำแบบไหน?

- ทำ **server-render** (SSR query `?sort=` — คงหลัก SSR-first, URL แชร์ได้) หรือ client toggle (แบบ `.pins.json`/localStorage ของ document-hub)?
- sort **size** ต้องเพิ่ม `bytes` ใน `DocSummary` (`packages/server/src/tree.ts` — ตอนนี้มีแค่ `mtimeMs`) — เพิ่มไหม หรือตัด size ทิ้ง?
- ใช้กับหน้าไหนบ้าง — home / FolderPage / ทั้งคู่ (ขึ้นกับ `01-hub-browse-shape`)

ข้อเสนอ: server-render + `?sort=` · เพิ่ม `bytes` (state stat อยู่แล้ว ต้นทุนต่ำ) · ทั้ง home และ FolderPage

## Answer

**ตามข้อเสนอทั้งหมด:**
- **server-render** — sort ผ่าน SSR query `?sort=` (URL แชร์ได้ · คงหลัก SSR-first) · date grouping
  (วันนี้/เมื่อวาน/≤7วัน/≤30วัน/เก่ากว่า) server-render จาก `mtimeMs` เดิม · ไม่ทำ client toggle
- **เพิ่ม `bytes` ใน `DocSummary`** (`packages/server/src/tree.ts` — state stat อยู่แล้ว ต้นทุนต่ำ)
  → sort ได้ครบ mtime/name/size
- **ใช้ทั้ง home และ FolderPage**
