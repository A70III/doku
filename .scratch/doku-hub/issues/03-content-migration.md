# Content migration — ย้าย 16 เอกสารจาก document-hub เข้า vault ไหม

Type: grilling
Status: resolved

## Question

หลัง hub ใช้ได้แล้ว — ความสัมพันธ์กับ document-hub (Python :7654) เป็นยังไง?

- (ก) **ย้ายเนื้อหา HTML → `vault/` เป็น md แล้ว retire document-hub** (ข้อเสนอ) — map `dh-tags`→`tags`, `dh-date`→`created` + คง mtime, prefix groups → โฟลเดอร์ย่อยจริง
- (ข) คู่กันไปอีกนาน — ถ้าเลือกอันนี้: document-hub ต้องมี orientation layer ด้วย (ตอนนี้ไม่มี AGENTS.md/decision log — `OPEN:` เสนอ scaffold)
- (ค) ไม่ย้ายเลย — document-hub เป็น archive อ่านอย่างเดียว, vault doku เริ่มใหม่จากเนื้อหาใหม่

เงื่อนไข: ย้ายเสร็จ = `doku check` 0 errors + CJK scan ผ่าน

## Answer

**(ค) ไม่ย้าย ไม่ยุ่งกับเอกสารเดิมเลย** — effort นี้ทำระบบ doku ล้วน ๆ · document-hub เก็บเป็น
archive อ่านอย่างเดียว · **ไม่สร้าง orientation layer ให้ document-hub** (ปิด `OPEN:` เรื่อง scaffold) ·
งาน migration ทั้งหมดย้ายไป `map.md` → Out of scope
