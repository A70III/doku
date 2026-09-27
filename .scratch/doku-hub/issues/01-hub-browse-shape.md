# Hub browse shape — หน้าแรก/หน้าหมวด จัดรูปแบบยังไงให้ "หมวดไม่จำกัด"

Type: grilling
Status: resolved

## Question

หมวดไม่จำกัดผ่านโฟลเดอร์จะแสดงเป็นหน้าอะไรได้บ้าง?

- (ก) **home แบ่ง section ต่อโฟลเดอร์ระดับบน + มีหน้าโฟลเดอร์ `/d/<folder>` ไล่ได้ทุกความลึก** (ข้อเสนอ)
- (ข) มีแค่ home sections — ลึกกว่านั้นพึ่ง sidebar tree อย่างเดียว
- (ค) มีแค่หน้าโฟลเดอร์ — home คงรูปแบบปัจจุบัน

บริบท: `state.docs` + `tree` มีข้อมูลครบโดยไม่ต้องแก้ `core` · folder color/icon มีใน `_folder.meta.json` แล้ว ·
ทิศทาง design = Digital Archivist (masthead + hairline + catalogue list — ไม่ใช่กริดการ์ด) ·
`/d/<folder>` ตอนนี้ = 404 (`resolveDoc` อ่าน `.md` ไม่เจอ)

คำตอบมีผลต่อ: `05-listing-behaviors` และ `06-folder-page-design` (blocked by ticket นี้)

## Answer

**(ก)** — home แบ่ง section ต่อโฟลเดอร์ระดับบน **และ** มีหน้าโฟลเดอร์ `/d/<folder>` ไล่ได้ทุกความลึก
ปลดบล็อก: `05-listing-behaviors`, `06-folder-page-design`
