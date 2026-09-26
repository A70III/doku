# Search parity — ช่องว่างค้นหาของ document-hub เติมเมื่อไหร่ ยังไง

Type: grilling
Status: resolved

## Question

document-hub ค้น filename/title/tags แบบ real-time (Ctrl+K) · doku มี:

- palette (Ctrl+K) ค้น **title + id** เท่านั้น — tags ยังไม่เข้า (แต่ `paletteDocs` มี tags อยู่แล้ว → แก้ฝั่ง client อย่างเดียว)
- FTS เต็มรูปแบบ + `GET /api/search` + MCP `doc_search` + CLI `search` = ระบบที่ M5 (ตาม docs/07)

ข้อเสนอ: **เติม palette+tags เลยใน M3.5 (งาน 3.5.5)** ไม่ต้องรอ M5 · FTS + CLI `search` ทำพร้อมกันที่ M5 (ไม่ทำ linear-scan ชั่วคราว — กันมีสองระบบค้น)

- (ข) อีกแบบ: ค้น tags รอทำพร้อม FTS ที่ M5 ทีเดียว
- (ค) ทำ linear-scan ใน CLI `doku search` เลยตอน M4 (ไม่รอ index)

## Answer

**ตามข้อเสนอ (ก):**
- เพิ่ม **tags ใน palette เลยใน M3.5** (งาน 3.5.5 — `paletteDocs` มี tags อยู่แล้ว แก้ client อย่างเดียว)
- FTS + `GET /api/search` + MCP `doc_search` + CLI `search` = **ทำพร้อมกันที่ M5**
- **ไม่ทำ linear-scan ชั่วคราว** — กันมีระบบค้นสองแบบ
