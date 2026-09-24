# Milestone order — เรียง M3.5 (hub) / M4 (agent) / M5 (search) ยังไง

Type: grilling
Status: resolved

## Question

จะรันสามก้อนนี้เรียงยังไง?

- (ก) **M3.5 (hub browse) → M4 (AI access) → M5 (index/search)** (ข้อเสนอ) — hub ไม่พึ่งใคร + เห็นเป็น "document hub" ชัดที่สุด · M4 ปิดของที่ค้าง ("ยังไม่เสร็จ" ฝั่ง CLI/MCP) · M5 ต้องมี write path นิ่งก่อน
- (ข) M4 → M3.5 → M5 — agent access ก่อน เพื่อให้ agent ช่วยทำส่วนที่เหลือผ่าน MCP
- (ค) M3.5 + M4 คู่กัน (แยก branch/คนทำ) แล้วตามด้วย M5

ประมาณการ: M3.5 ~2–3 วัน · M4 ~1.5–2 วัน · M5 ~2 วัน (ตาม style ของ docs/07)

## Answer

**doku นำหน้า** — document-hub เดิมเป็นแค่ที่มา/inspiration "ส่วนหนึ่ง" ของ doku **ไม่ใช่ parity target**
ที่ต้องไล่เทียบฟีเจอร์ทีละอัน · ลำดับงาน = **M3.5 (hub) → M4 (AI access) → M5 (index/search)**
(ตามข้อเสนอ (ก) — hub ของ doku มาก่อนเพื่อสร้างตัวตน "document hub" ก่อน แล้วค่อยปิดช่องทาง agent)
