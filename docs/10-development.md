# 10 — การพัฒนา (Development)

คู่มือสำหรับคนที่แก้โค้ด Doku — ตั้งแต่ตั้งเครื่องจน commit
ภาพรวมระบบอยู่ที่ [01-architecture](01-architecture.md) · กติกาใน repo อยู่ที่ [`AGENTS.md`](../AGENTS.md)

---

## 1. ตั้งเครื่องครั้งแรก

```bash
# ต้องมี Bun (โปรเจกต์ใช้ Bun เป็น runtime + test runner + package manager)
bun --version          # แนะนำ 1.2 ขึ้นไป

bun install
bun run build:css      # จำเป็น: Tailwind → packages/server/public/app.css
bun run build:editor   # จำเป็นถ้าจะทดสอบโหมดเขียน (CodeMirror bundle)
bun run dev            # server + Tailwind watch → http://localhost:7667
```

- `packages/server/public/` เป็น artifact ที่ **gitignore** — ขาดแล้วหน้าเว็บจะไม่มีสไตล์
- `var/` เป็น runtime data (cache/index/revisions) — ลบได้ตลอด
- vault ตัวอย่างสำหรับเทสต์อยู่ที่ `examples/vault` (commit ไว้)
- vault จริงตอน dev ตั้งด้วย `DOKU_VAULT=/path/to/vault`

---

## 2. คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `bun run dev` | dev server + Tailwind watch + editor build (ตาม `scripts/dev.sh`) |
| `bun test` | unit + regression ทั้งหมด |
| `bun test packages/server/test/<ไฟล์>` | รันเฉพาะไฟล์ |
| `bun run typecheck` | `tsc --noEmit` ทุกแพ็กเกจ |
| `bun run check` | Biome lint + format (ไม่เขียนไฟล์) |
| `bun run check:fix` | Biome แก้ให้ (safe fixes) |
| `bun run build:css` | Tailwind → `public/app.css` (minified) |
| `bun run build:editor` | CodeMirror → `public/editor.js` |
| `bun run shot` | Playwright: screenshot 2 ธีม × 10 หน้า + a11y + rhythm |
| `bun run gen:icons` | สร้าง Lucide subset ใหม่ → `core/src/icons/lucide.ts` |
| `bun run gen:schema` | Zod → JSON Schema (ไม่ commit) |
| `bun run doku <cmd>` | เรียก CLI จาก source (`check`, `render`, `search`, …) |
| `bun run media:migrate` | ย้ายรูปจาก `assets/` เก่าเข้า `.media/` (dry-run ก่อน) |
| `bun run docs:sync` | sync เอกสาร `docs/` → vault `projects/doku/manual/` |

---

## 3. Gates — ทุกข้อต้องผ่านก่อน commit

| Gate | จับอะไร | หมายเหตุ |
|---|---|---|
| `bun test` | logic, regression, contract ของ API/block | ต้อง 0 fail |
| `bun run typecheck` | type ทั้ง 5 แพ็กเกจ | strict mode |
| `bun run check` | lint + format (Biome) | ไม่มี ESLint/Prettier |
| `bun run shot` | a11y (ชื่อคอนโทรล, focus, overflow, reduced motion, h1 เดียว), rhythm, screenshot | ต้อง build CSS ก่อน |
| `doku check --vault examples/vault` | เนื้อหา/block ผิด syntax | 0 errors / 0 warnings |

ลำดับที่เร็วที่สุดตอนแก้เล็ก ๆ:

```bash
bun test packages/server/test/<ไฟล์ที่เกี่ยว> && bun run typecheck && bun run check
```

ก่อน commit งานที่แตะ UI ให้รัน `bun run build:css && bun run shot` ด้วย

---

## 4. แผนที่ไฟล์

### core — หัวใจของ rendering (ไม่รู้จัก HTTP/fs จริง)

| ไฟล์ | รับผิดชอบ |
|---|---|
| `src/render.ts` | pipeline หลัก md → fragment |
| `src/blocks/*` | block registry (1 ไฟล์ = 1 กลุ่ม) |
| `src/styles/*` | tokens · prose · block CSS (ใช้ร่วม CLI/server) |
| `src/fs.ts` | interface `VaultFs` + in-memory adapter |
| `src/paths.ts` | normalize path, กัน escape, แปลง link |
| `src/media.ts` | กติกา `.media/<sha256>.<ext>` |
| `src/check.ts` | validator ของ `doku check` |
| `src/schema.ts` | Zod schema ของ meta (single source ของ type) |
| `src/icons/*` | Lucide subset + `iconSvg()` |

### fs-node — ของจริงบนดิสก์

| ไฟล์ | รับผิดชอบ |
|---|---|
| `src/index.ts` | `createNodeVaultFs` · `safeJoin` · atomic write · trash · revisions |
| `src/search-index.ts` | FTS5 trigram · stat-first rescan (`stamp`) |
| `src/audit.ts` | audit log append-only |

### server — ประกอบทุกอย่าง

| ไฟล์ | รับผิดชอบ |
|---|---|
| `src/app.tsx` | route ทั้งหมด (HTML/static/media/sse) + middleware (compress) |
| `src/api/*` | REST แยกหมวด + `shared.ts` (error/rate limit/context) |
| `src/web/pages/*` | หน้า SSR (home, doc, folder, trash, styleguide, layout, sidebar) |
| `src/web/client/*` | client JS (ต่อเป็น IIFE เดียว) — palette, tree, autosave, editor |
| `src/web/styles/app.css` | Tailwind + chrome |
| `src/web/site.ts` | ชื่อแบรนด์ (`DOKU_NAME`) + asset version |
| `src/web/sprite.ts` | ไอคอนที่ใช้ซ้ำ (symbol + use) |
| `src/tree.ts` | `VaultState` (snapshot + invalidate) |
| `src/doc.ts` | `DocRenderer` + cache key |
| `src/index-db.ts` | ตัวสั่ง sync index (serialized) |
| `src/watch.ts` | chokidar → invalidate + SSE |

### cli / mcp

- `packages/cli/src/index.ts` — ทุกคำสั่ง + `--json` contract
- `packages/mcp/src/tools.ts` — รายการ tool และ schema

---

## 5. Conventions ที่ต้องถือ

1. **ภาษา** — comment/docs ไทย, identifier/commit/type อังกฤษ
2. **TypeScript strict** — ใช้ type จาก Zod (`z.infer`) ไม่ประกาศซ้ำ
3. **Lint/format = Biome เท่านั้น** — ห้ามเพิ่ม ESLint/Prettier
4. **Template = Hono JSX** — ห้ามเพิ่ม React
5. **Runtime = Bun** — `bun test`, `bun:sqlite`, `Bun.file`; ห้ามเพิ่ม jest/vitest
6. **CSS**
   - chrome (sidebar/toolbar) ใช้ Tailwind
   - เนื้อหาเอกสารใช้ CSS layer `.doku-prose` + token จาก `core/src/styles/tokens.ts`
   - ห้าม hardcode ระยะ — ใช้ `var(--d-space-N)` ที่ define แล้วเท่านั้น
   - ห้าม `#fff`/`#000` ดิบ — ใช้ token (มี `contrast.test.ts` ตรวจ)
7. **ห้ามอักษรจีน (CJK)** ในไฟล์ใด ๆ — สแกนก่อน commit
8. **ห้ามฝัง `<svg>` เต็ม ๆ ต่อแถว** — ไอคอนที่ซ้ำให้เพิ่มใน `web/sprite.ts`
9. **client JS เป็น template string** — ระวัง escaping (`\\n`, backtick, `${}`)

---

## 6. สูตรทำงานที่พบบ่อย

### 6.1 เพิ่ม REST endpoint

1. เปิด `packages/server/src/api/<หมวด>.ts`
2. เพิ่ม route ตามลำดับ **ก่อน** route แบบ wildcard ที่กว้างกว่า
3. ใช้ `apiError()` มาตรฐาน + rate limit ถ้าเป็น write
4. write ต้องตรวจ `If-Match` และคืน ETag ใหม่
5. เพิ่มเทสต์ใน `packages/server/test/` (สำเร็จ + error case)
6. อัปเดต [05-api-and-agent-access](05-api-and-agent-access.md)

### 6.2 เพิ่มหน้าเว็บ

1. สร้าง `packages/server/src/web/pages/<ชื่อ>.tsx` (รับ props, ใช้ `<Layout>`)
2. export ผ่าน `web/pages.tsx` ถ้าต้องใช้ร่วม
3. เพิ่ม route ใน `app.tsx`
4. `bun run shot` เพื่อเช็ค a11y/overflow (สคริปต์ถ่ายเฉพาะหน้าที่กำหนด — ถ้าเป็นหน้าสำคัญให้เพิ่มใน `scripts/shot.ts`)

### 6.3 เพิ่ม block ใหม่

1. สร้าง `packages/core/src/blocks/<ชื่อ>.ts` ตาม pattern ของ block ข้างเคียง
2. ลงทะเบียนใน registry
3. เพิ่ม CSS ใน `core/src/styles/blocks.ts` (ใช้ token)
4. เพิ่มตัวอย่างใน `/styleguide` + `examples/vault`
5. เขียนเทสต์ว่าเนื้อหาไม่หายเมื่อ syntax ผิด
6. อัปเดต [03-blocks-and-design-system](03-blocks-and-design-system.md)

### 6.4 เพิ่มไอคอน

1. `bun run gen:icons` (แก้รายการใน `scripts/gen-icons.ts` ถ้าต้องการไอคอนใหม่)
2. ถ้าใช้ซ้ำหลายที่ → เพิ่มชื่อใน `web/sprite.ts`

### 6.5 แก้ token / ระยะ / สี

1. แก้ที่ `packages/core/src/styles/tokens.ts` เท่านั้น
2. รัน `bun test packages/core/src/styles` (contrast + tokens + rhythm)
3. `bun run build:css` แล้วดูด้วยตา 1 หน้า

---

## 7. เทสต์

- อยู่ที่ `packages/*/test/*.test.ts` — ใช้ `bun:test` (`describe`/`test`/`expect`)
- server test ใช้ `createDokuApp` + `memoryVaultFs` (ไม่แตะดิสก์จริง)
- เนื้อหา/block test ใช้ `examples/vault`
- **regression test ที่ดี** = อธิบายอาการที่เคยเกิดในชื่อ test และยืนยัน invariant ไม่ใช่แค่ snapshot
- ถ้าแก้พฤติกรรมที่เทสต์เดิมล็อกอยู่ ให้แก้เทสต์พร้อมเหตุผลใน commit message (อย่าลบเงียบ ๆ)

---

## 8. Debug

| อาการ | เครื่องมือ |
|---|---|
| หน้าเว็บไม่มี CSS | `bun run build:css` (ไฟล์อยู่ใน `public/` ที่ gitignore) |
| โหมดเขียนไม่ขึ้น | `bun run build:editor` · ดู console ว่า `editor.js` โหลดหรือยัง |
| แก้ block แล้วไม่เปลี่ยน | `DOKU_CACHE=off` หรือลบ `var/cache/` |
| search ไม่เจอ | ลบ `var/index.db` ให้ rebuild · ดู log ตอน sync |
| เปลี่ยนแล้วหน้าเก่า | asset `?v=<hash>` เปลี่ยนเมื่อ build ใหม่ — hard reload |
| client JS พังเงียบ | `bun test packages/server/test/qol-writing.test.ts` (ตรวจ syntax ของ CLIENT_JS) |

---

## 9. Commit และ branch

- **Conventional Commits ภาษาอังกฤษ** — `feat:`, `fix:`, `refactor:`, `perf:`, `docs:`, `chore:`
- commit ให้เล็กและatomic — 1 เรื่องต่อ 1 commit (แยก refactor ออกจาก behavior change)
- **ห้ามใส่ `Co-Authored-By: Claude`** หรือผู้ช่วย AI ใน commit message
- ข้อความ commit อธิบาย **ทำไม** ไม่ใช่แค่ **อะไร**
- กิ่งปัจจุบันที่ deploy: `feat/home-tag-toggle` — ถ้าจะเปิด PR ให้เทียบกับ `main`

---

## 10. เอกสาร

- decision ใหม่ → เพิ่มแถวใน [08-decisions](08-decisions.md) (ตาราง: เลข, เรื่อง, บริบท, ทางที่เลือก, ผล/ตัวเลข)
- เปลี่ยนพฤติกรรมที่ผู้ใช้เห็น → อัปเดต [05](05-api-and-agent-access.md) หรือ [09](09-operations.md) ตามความเหมาะสม
- หลังแก้ docs ใน repo ให้ sync ไป doku:

```bash
bun run docs:sync --vault /path/to/vault          # dry-run บอกว่าจะเขียนอะไร
bun run docs:sync --vault /path/to/vault --apply  # เขียนจริง + meta.json
```
