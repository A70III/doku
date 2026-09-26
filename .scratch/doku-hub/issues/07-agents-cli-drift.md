# AGENTS.md/CLI drift — layer สัญญาคำสั่งที่โค้ดยังไม่มี

Type: grilling
Status: resolved

## Question

`AGENTS.md` (หัวข้อ "คำสั่ง") + `docs/05` §2 สัญญา CLI 13 คำสั่ง
(`new mkdir render check tree list search mv serve build restore audit mcp`)
แต่โค้ดจริงใน `packages/cli/src/index.ts` มีแค่ **4**: `render` `check` `serve` `restore`
(ยืนยันจาก switch + `usage()` — ส่วน `packages/mcp/` ก็ยังไม่มีใน repo)

- (ก) **แก้ `AGENTS.md` ทันที** ให้แสดงเฉพาะคำสั่งที่มีจริง + ทำเครื่องหมายส่วนที่เหลือเป็น "วางแผน (M4/M5)" (ข้อเสนอ — layer ต้องไม่โกหก agent ที่เชื่อ AGENTS.md แล้วเรียกคำสั่งที่ไม่มี)
- (ข) ปล่อยไว้ — ถือว่า AGENTS.md เป็น target state ที่ M4/M5 จะทำให้จริงเอง
- (ค) แก้พร้อมกันตอนเริ่ม M4 (ไม่เร่งแก้ตอนนี้)

บริบท: guardrail ของ project-orientation บอกว่า layer ที่ stale เทียบกับ decision/code = finding ต้องแก้ให้ตรงใน change เดียวกับที่ reality เปลี่ยน · แต่ตอนนี้ฝั่ง code ยังไม่ขยับ → ทางที่ปลอดภัยคือแก้ layer ให้ตรงของจริงก่อน

## Answer

**(ก) แก้ทันที** — agent เชื่อ AGENTS.md แล้วเรียกคำสั่งที่ไม่มี = พังฟรี · layer ห้ามนำหน้า reality
แก้แล้ว: หัวข้อ "คำสั่ง" ใน `AGENTS.md` แสดงเฉพาะ 4 คำสั่งจริง (`render check serve restore`) +
list planned (M4–M5) · `packages/mcp/` ในโครง repo มาร์ก "ยังไม่สร้าง — M4"
