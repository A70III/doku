# Folder page design — wireframe + edge cases ของหน้าโฟลเดอร์

Type: prototype
Status: resolved

## Question

ถ้า `01-hub-browse-shape` เลือกให้มีหน้าโฟลเดอร์ — หน้าตา/พฤติกรรมเป็นยังไง? (ทำ prototype/wireframe ให้เห็นก่อน implement)

องค์ประกอบที่ต้องเคาะ:

- header: breadcrumb หรือชื่อ folder ตรง ๆ? · icon + color จาก `_folder.meta.json` แสดงตรงไหน
- subfolder list ก่อน doc list ไหม · empty folder = empty state ยังไง
- doc listing: pinned → order → name (แบบ sidebar เดิม) หรือ date groups + sort (จาก `05-listing-behaviors`)?
- state อื่น: มี meta form/folder settings จากหน้านี้ด้วยไหม (ตอนนี้เปิดจาก sidebar row menu)
- **edge case:** `x/` (โฟลเดอร์) กับ `x.md` (ไฟล์) ชื่อเดียวกัน — `/d/x` เปิดใคร? ออกแบบ URL ให้เข้าถึงทั้งคู่ได้
- ต้องไม่โชว์ `.trash`/dotfolder (invariant 9) · path ผ่าน `normalizeVaultPath` + `safeJoin` เดิม

## Answer

**ยึด doku design เป็นหลัก** — Digital Archivist (masthead + hairline + catalogue list · tabular
figures · folder color เป็น tint เล็ก ๆ) **ไม่เลียนแบบหน้าตา document-hub** · wireframe ข้างบน
(ที่วางใน grilling round 2) = ทิศทางที่เคาะ

- **(8a) subfolders อยู่ก่อนรายการเอกสาร** — เป็น navigation ชั้นต่อไป (ปักหมุด → โฟลเดอร์ย่อย → date groups)
- **(8b) header = breadcrumb + title + stats อย่างเดียว** — ไม่เพิ่มปุ่ม action บนหน้า
  (action อยู่ในเมนู `⋯` เดิม + slash menu ใน editor เหมือนตอนนี้)
- **(8c) ห้ามชื่อซ้ำ `x/` + `x.md`** — `doku check` เตือนเมื่อเจอคู่กัน → ไม่ต้องเดา URL semantics
  (`/d/x` = ไฟล์เสมอเมื่อมี) · ถ้าเจอใน vault จริงแล้วเป็นปัญหา ค่อยย้อนเคาะใหม่
