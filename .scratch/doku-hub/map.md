# Map — doku เป็น document hub ที่หมวดไม่จำกัด

## Destination

**doku = document hub หลักของบ้าน** — browse ตามหมวดที่ไม่จำกัดผ่านโฟลเดอร์/ซับโฟลเดอร์ ·
คนค้น/จัดระเบียบได้จากหน้าแรก + หน้าโฟลเดอร์ · AI agent อ่าน-เขียน vault ได้ครบผ่าน CLI + MCP —
โดย format vault (md · path=id · meta sidecar) และ architecture (core isomorphic · dependency
direction · invariants 9 ข้อ) **ไม่เปลี่ยน**

**boundary (เคาะแล้ว):** doku นำหน้า — document-hub เดิมเป็นแค่ที่มา/inspiration ไม่ใช่ parity target ·
เนื้อหาเดิมใน document-hub **ไม่ถูกย้าย** (archive อ่านอย่างเดียว) · effort นี้ทำระบบ doku ล้วน

แผนฉบับเต็ม: [plan.md](plan.md)

## Notes

- domain: doku monorepo (Bun + Hono + TS) ที่ `~/dch/doku` · เนื้อหา vault = source of truth
- skills ที่ทุก session ต้อง consult: `project-orientation` (layer อยู่ที่ `AGENTS.md` — เพิ่ม `## Profile` แล้ว)
  · `wayfinder` (แผนนี้) · `grilling` / `domain-modeling` (ตอนเคาะ decision)
- standing preferences:
  - gates 5 ตัวต้องเขียวก่อน merge: `bun test` · `bun run check` · `bun run typecheck` · `bun run shot` · `bun run doku check --vault examples/vault`
  - CJK scan (`[\u4e00-\u9fff]`) ก่อน ship เนื้อหา/UI เสมอ
  - Thai-first UI · commit = English Conventional Commits
  - design = Digital Archivist (docs/08 ข้อ 31–33): ห้าม gradient ประดับ · ห้ามกริดการ์ดหน้าแรก · ห้ามคอลัมน์ไล่เฉดม่วง/น้ำเงินแบบ document-hub

## Decisions so far

- [Hub browse shape](issues/01-hub-browse-shape.md): home แบ่ง section ต่อ top-level folder **+ มีหน้าโฟลเดอร์** ไล่ทุกความลึก
- [Milestone order](issues/02-milestone-order.md): doku นำหน้า (document-hub = inspiration ไม่ใช่ parity target) · เรียง M3.5 → M4 → M5
- [Content migration](issues/03-content-migration.md): ไม่ย้าย ไม่ยุ่งเอกสารเดิม — ทำระบบ doku ล้วน · document-hub = archive
- [Search parity](issues/04-search-parity.md): tags ใน palette เลย (M3.5) · FTS+search ทั้งหมดที่ M5 · ไม่ทำ linear-scan
- [AGENTS.md/CLI drift](issues/07-agents-cli-drift.md): แก้ layer ทันทีให้ตรงโค้ดจริง (4 คำสั่ง) + มาร์ก planned
- [Listing behaviors](issues/05-listing-behaviors.md): server-render `?sort=` (mtime/name/size) + date grouping จาก `mtimeMs` · เพิ่ม `bytes` ใน `DocSummary` · ใช้ทั้ง home และ FolderPage
- [Folder page design](issues/06-folder-page-design.md): ยึด doku design (Digital Archivist) เป็นหลัก · subfolders ก่อนรายการ · header ไม่เพิ่มปุ่ม · ห้ามชื่อซ้ำ `x/`+`x.md` (`doku check` เตือน)

## Not yet specified

- จัดการ home sections ถ้า top-level folder เยอะมาก (>20) — ยังไม่ spec (เริ่มเจอตอน implement)
- FTS ranking / incremental index รายละเอียด · audit retention — อยู่ใน M5/M4 แล้ว แต่ดีเทลยังไม่ spec

## Out of scope

- **ย้าย/แปลงเนื้อหาจาก document-hub ทั้งหมด + orientation layer ของมัน** — เคาะแล้ว (ticket 03): ไม่ยุ่ง
- publish / visibility / auth — LAN only (AGENTS.md; เผื่อโครง token ไว้ทีหลังเท่านั้น)
- Mermaid → Excalidraw SVG + ASCII (D2 หลัง v1) · post-it block · Obsidian plugin · field `category`
- การจัดกลุ่มด้วย filename prefix แบบ document-hub — โฟลเดอร์ทำแทนแล้ว ( invariant: path = id )
- สีคอลัมน์ไล่เฉดม่วง/น้ำเงิน + การ์ดกริดหน้าแรกแบบ document-hub — ขัด docs/08 ข้อ 31–33
- บังคับ meta tags แบบ DH-STANDARD (`dh-category`/`dh-tags` ≥2/`dh-date`) — `meta.json` optional คงเดิม
- no-build / vanilla JS constraint ของ document-hub — doku คง stack ที่ล็อกไว้ (docs/04, docs/08 ข้อ 21)
- ไล่ parity ฟีเจอร์กับ document-hub ทีละอัน — doku นำหน้า ฟีเจอร์ไหนมีประโยชน์ค่อยหยิบมาเป็น ticket
