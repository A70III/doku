# 09 — Editor UX (M3.2): one surface, block layer

> **ที่มา:** M3.1 ทำ "Live Preview ในที่" ([08 ข้อ 52](08-decisions.md)) แล้ว — ตัด overlay/split
> และตัดปุ่ม "แก้ไข" ออก แต่**ยังมี 2 rendering path อยู่**: เอกสารที่ยังไม่ถูกแตะเป็น HTML จาก server
> พอคลิกครั้งแรก client ทิ้ง HTML ทั้งบทความแล้ว mount CodeMirror (`client.ts:721`) แล้วตอนออกจาก
> บทความก็ยิง `/api/render` กลับมาแทนที่ (`client.ts:840`) → **คือโหมดแก้ไขที่ซ่อนอยู่** ⇒ ข้อ 52 ยังไม่สำเร็จจริง
>
> M3.2 คือ pass ที่ปิดช่องนั้น **และ** ใส่ block layer ที่ทำให้รู้สึกเป็น Notion
> decision ที่ล็อกแล้ว: [08 ข้อ 63–72](08-decisions.md)

**เป้าหมายเดียวที่วัดได้:** เอกสารที่เปิดอยู่ **เป็น editor ตัวเดียวตลอดเวลา** (ไม่มี swap เมื่อผู้ใช้แตะ)
และ block ทุกก้อน (ย่อหน้า/หัวข้อ/list/`:::`/รูป/ตาราง) มี affordance ให้ย้าย · แปลง · ลบ · ซ้อน
โดยที่ **ไฟล์ยังเป็น markdown ธรรมดาที่ `doku check` ผ่าน** และไม่มี round-trip loss

---

## §1 หลักการที่ล็อก (ห้ามละเมิดตอน implement)

1. **One surface** — CM6 mount ที่คอลัมน์อ่านตั้งแต่โหลด และ **อยู่ตลอด** จนกว่าจะเปลี่ยนหน้า
   ไม่มี mode, ไม่มี swap, ไม่มี network re-render หลังผู้ใช้แตะ
2. **Block = line range** — block คำนวณสดจาก Lezer + fence scan (ไม่มี id ในไฟล์, ไม่มี state ซ่อน)
   [08 ข้อ 64](08-decisions.md)
3. **Gutter เป็น overlay layer ของ client** — `+` และ `⋮⋮` ไม่ใช่ CM gutter
   (ต้องคุม follow-mouse / pin / delay / animation และ a11y เอง) [08 ข้อ 66](08-decisions.md)
4. **ทุก operation เขียนกลับเป็นข้อความ markdown** — สถาปัตยกรรมเดียวกับ block control strip ที่มีอยู่
   (`editor.ts:writeAttrs` / `patchMark` / `removeDirective`) · ไม่มี hidden state
5. **Read-parity** — หน้าตาตอนเขียน ≈ ตอนอ่าน (widget + decoration) แต่ markdown ยังเป็นความจริงเสมอ
6. **IME + keyboard first** — ห้ามทำ decoration ที่พัง composition และ **ทุก operation ที่ทำด้วยเมาส์ต้องมีคีย์ลัดเทียบเท่า**

---

## §2 สถานะปัจจุบัน vs Notion (หลักฐาน ไม่ใช่ความรู้สึก)

### 2.1 ช่องว่างที่ทำให้ยังรู้สึกเป็น Obsidian

| # | ช่องว่าง | หลักฐานในโค้ด | อาการที่ผู้ใช้เจอ |
|---|---|---|---|
| 1 | swap ทั้งบทความ | `client.ts:721` (`bodyEl.textContent=""`) · `client.ts:840` (`bodyEl.innerHTML = result.html`) | layout กระโดด ทุกครั้งที่เข้า-ออกโหมด เขียน |
| 2 | เดาカーจาก text search | `client.ts:703` `offsetForElement()` = `md.indexOf(text.slice(0,32))` | คลิกบรรทัดที่ข้อความซ้ำ → カーไปผิดที่แบบสุ่ม |
| 3 | ไม่มี block layer | ไม่มี gutter/block logic ใน `editor.ts` (637 บรรทัด) | ย้าย/แปลง/ซ้อน block ต้องพิมพ์ markdown เอง |
| 4 | syntax marker ไม่ atomic | `editor.ts:118` `buildDecorations()` — ไม่มี `atomicRanges` | カーตกใน `**…**` ได้ marker โผล่ ข้อความเลื่อน |
| 5 | ไม่มี `markdownKeymap` | `editor.ts:511` `keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, Mod-s])` | Enter ไม่สืบ list · Backspace ไม่ลบ marker · Tab ไม่ nest |
| 6 | widget ไม่ครบ (read-parity) | `editor.ts` มีแค่ `ImageWidget`; `.cm-doku-code`/`.cm-doku-table` = mono เฉย ๆ (`app.css:859`, `:863`) | table / `:::` / math / checkbox เห็นเป็นข้อความดิบ |
| 7 | ไม่มี inline layer | ไม่มี paste handler, ไม่มี bubble (grep `paste`/`clipboard` เจอแค่ copy URL) | ต้องพิมพ์ `**bold**` เอง · paste จากเว็บได้ข้อความแบน |
| 8 | ไม่มี hover affordance | `app.css` ไม่มี hover ของบรรทัดเลย (มีแต่ hover ของ chrome) | เอกสารไม่ตอบสนองเมาส์ → รู้สึกเป็น "source view" |

> **ปิดครบทั้ง 8 ข้อแล้วที่ M3.2** — ข้อ 1–2 Track A · ข้อ 4–6 Track B · ข้อ 3, 8 Track C · **ข้อ 7 Track D**
> (ตารางนี้เก็บไว้เป็นหลักฐานของ *สภาพก่อน* M3.2 — ไม่ใช่สถานะปัจจุบัน)

### 2.2 "The Notion experience" คืออะไร — จากแหล่งจริง

Notion เอง ([Intro to writing & editing](https://www.notion.com/help/writing-and-editing-basics)) นิยามด้วย **3 เครื่องมือ**:

| เครื่องมือ | พฤติกรรม |
|---|---|
| `+` | ลอยใน margin เมื่อ hover บรรทัด → เมนูเนื้อหา (insert) |
| `⋮⋮` | hover → **คลิกและลากเพื่อย้าย block** หรือคลิก = menu: `Turn into` · `Color` · `Copy link to block` · `Duplicate` · `Move to` · `Delete` (+ word count เมื่อเลือกหลาย block) |
| `/` | ทางลัดของทั้งสอง (insert + action + color: `/bullet` `/delete` `/red`) |

จาก [Notion keyboard shortcuts](https://www.notion.com/help/keyboard-shortcuts) — พฤติกรรมที่ต้องเทียบให้ได้:
Markdown style ระหว่างพิมพ์ (`#` → H1 · `[]` → to-do · `>` → toggle · `---` → divider) ·
`Cmd+B/I/U` · **`Cmd+E` = inline code** · `Cmd+K` = link (paste URL ทับข้อความที่เลือกก็ได้) ·
**`Tab`/`Shift+Tab` = indent = nest block ใน block เหนือ** (เลือก parent = เลือกลูกทั้งหมด) ·
**`Cmd+/` = Turn into** · `Cmd+Shift+↑/↓` = move block · **มือถือ: ไม่มี `/` และไม่มี icon ตอน hover**

**พิสูจน์ว่า CM6 ทำได้** (Obsidian plugin 2 ตัวที่ขายแนวคิดนี้จริง):

- [Feel the Notion](https://community.obsidian.md/plugins/feel-the-notion) — hover handle **ตามเมาส์แนวตั้ง** ·
  drag ทั้ง block **รวม children** แล้วเลือกความลึกจากตำแหน่งแนวนอน · **multi-block selection**
  (ลากข้าม block = ทาเป็น block ไม่ใช่ text range) · **block-aware `Cmd+A` / `Backspace`** ·
  insert menu จาก `+` หรือ `/` · fold block (เหลือ ellipsis) · multi-block drag · pin handle ไม่ให้หาย · จัดลำดับ `+`/`⋮⋮` ได้
  · **changelog 0.4.0 = บทเรียน perf ที่เราต้องทำตาม:** pointer ทำงานครั้งเดียวต่อ frame · measure-then-draw ·
  cache geometry ที่ไม่เปลี่ยนกลาง drag · คำนวณ drop depth ใหม่เฉพาะเมื่อข้ามบรรทัด · ปล่อยเมาส์ตอน drag เร็ว = drop ที่ตำแหน่งจริง
- [Notion block](https://community.obsidian.md/plugins/notion-block) — handle ตามเมาส์แนวตั้ง ทำงานกับบรรทัดไหนก็ได้
  โดยไม่ต้องย้ายカー · **long-press 150ms = drag** · toggle **Line mode ↔ Paragraph mode** (บรรทัดกาย vs block ตรรกะ) ·
  transform menu (heading/list/todo/code/math/divider/quote/callout)

**กับดักเทคนิคที่ต้องออกแบบรับ (สำคัญกว่าตัวฟีเจอร์)**

| กับดัก | หลักฐาน | มาตรการใน M3.2 |
|---|---|---|
| `atomicRanges` ทำให้ Backspace ลบทั้งก้อน | [CM discuss #7602](https://discuss.codemirror.net/t/hide-markdown-syntax/7602) (marijn ตอบตรง ๆ) | atomic **เฉพาะ delimiter ที่ซ่อน** ไม่ atomic ทั้งช่วง · カーสัมผัส = คืน marker |
| **composition/IME + `Decoration.replace` พัง** | [CM discuss #9785](https://discuss.codemirror.net/t/bug-ime-selection-is-not-updated-when-decoration-mark-contains-multiple-decoration-replace-decorations/9785) · [#6745](https://discuss.codemirror.net/t/maybe-bug-with-decoration-and-ime-input/6745) · [codemirror/dev#1654](https://github.com/codemirror/dev/issues/1654) | **ห้าม replace ระหว่าง `view.composing === true`** (ไทย/จีน/ญี่ปุ่นได้ผลตรง ๆ) — [08 ข้อ 69](08-decisions.md) |
| drag & drop ไม่มีของสำเร็จรูปให้ใช้ | [CM discuss #7161](https://discuss.codemirror.net/t/drag-and-drop-lines-of-text/7161) · [#7338](https://discuss.codemirror.net/t/drag-drop-widget-decorator/7338) | overlay + pointer events + drop indicator เอง (`gutter` อยู่ใน `@codemirror/view` แล้ว — ไม่เพิ่ม dependency) |
| มือถือไม่มี hover | Notion เองก็ไม่มี handle บนมือถือ | long-press 150ms + row menu — [08 ข้อ 71](08-decisions.md) |
| ทางเลือก ProseMirror/Tiptap = lossy | [Tiptap #8134](https://github.com/ueberdosis/tiptap/issues/8134) (escaped block หายหลัง round-trip) · ต้องมี golden-file round-trip suite | **ไม่ย้าย** — [08 ข้อ 63](08-decisions.md) |
| พื้นที่วิจัยยังเปิด | Beckmann et al., *Block-Based Editing in a Textual World*, ACM SIGPLAN PAINT 2025, [doi:10.1145/3759534.3762681](https://doi.org/10.1145/3759534.3762681) (open access) | ยืนยันโจทย์: block semantics บน representation เชิงข้อความ = โจทย์ของเรา |

### 2.3 คีย์ล็อกที่ต้อง override (วัดจาก `@codemirror/commands@6.11.0` แล้ว)

`defaultKeymap` ที่เราโหลดอยู่ **กินคีย์ที่ Notion ใช้** → ต้องวาง binding ของเรา **ก่อน** `defaultKeymap`

| คีย์ | วันนี้ (CM) | M3.2 | หมายเหตุ |
|---|---|---|---|
| `Mod-i` | `selectParentSyntax` | **italic** | override (Notion ใช้ Cmd+I) |
| `Mod-/` | `toggleComment` | **Turn into** | override |
| `Mod-a` | `selectAll` | **block → ทั้งเอกสาร (สองจังหวะ)** | intercept |
| `Escape` | `simplifySelection` | **เลือก block ที่カーอยู่** (แล้วครั้งต่อไป = ยกเลิก) | ต้องมี state |
| `Mod-b` `Mod-e` `Mod-k` `Mod-d` `Mod-Shift-s` | ว่าง | bold · code · link · duplicate block · strikethrough | ใส่ได้เลย |
| `Mod-Shift-ArrowUp/Down` | ว่าง (`Alt-ArrowUp/Down` = moveLine อยู่) | **move block** | ตรงกับ Notion |
| `Tab` / `Shift-Tab` | `indentWithTab` (indentMore) | **nest/un-nest block ตาม block model** | ต้อง override `indentWithTab` |
| `Mod-Enter` `Mod-[` `Mod-]` `Mod-Backspace` | คงไว้ | คงไว้ (ขยายให้ block-aware) | ไม่ชน |

**implement แล้ว (Track D):** ผูก `Mod-b` `Mod-i` `Mod-e` `Mod-Shift-s` `Mod-k` ตรง ๆ ก่อน `defaultKeymap`
· **คีย์ของผิวเอกสารชนะ chrome** — `Mod+K`/`Mod+E` ในเอกสารเป็นของ CM6, command palette/`カーในเอกสารนี้` ทำงานเมื่อ focus อยู่นอกผิวเอกสาร (รวม bubble/link popover) → [08 ข้อ 74](08-decisions.md)
· ตรวจกับ Chromium จริงแล้ว (Playwright): ตัวอักษรตัวพิมพ์ใหญ่คู่ `Shift` (`Control+Shift+S`) ถูก match ผ่าน fallback ของ `w3c-keyname` ✓

---

## §3 สถาปัตยกรรม

### 3.1 one surface — lifecycle ([08 ข้อ 63/65](08-decisions.md))

```
server render (HTML + payload JSON)
  → เบราว์เซอร์ paint HTML (no-JS ยังอ่านได้ · first paint เร็ว · typography เดียวกับ CM)
  → client.js โหลด → mount CM6 ทับคอลัมน์เดิม (ครั้งเดียว, ก่อนผู้ใช้แตะ)      ← swap ที่ 1 และครั้งเดียว
  → ผู้ใช้คลิก/พิมพ์/ลาก → CM6 จัดการเอง (ไม่มีการ swap อีก)
  → เปลี่ยนหน้า = full navigation (MPA เดิม) → เริ่มวัฏจักรใหม่
```

| งาน | รายละเอียด |
|---|---|
| mount | หลัง `DOMContentLoaded` + `requestIdleCallback` (`timeout 1200`) fallback `setTimeout 0` · mount **เฉพาะหน้าเอกสาร** (`article[data-doc-id]` + `#doku-doc-md`) ไม่ mount ที่ home/`/trash`/`/styleguide` · รอ `/api/schema` ก่อนสร้าง (slash menu พร้อมตั้งแต่แรก) · `focus: false` (ห้ามแย่ง focus ตอนโหลด) |
| no-JS | HTML จาก server ยังอ่านได้ครบ + `<noscript>` ยังไม่ต้องมีปุ่ม (อ่านอย่างเดียว) · fallback `<textarea>` (ข้อ 37) ใช้เฉพาะเมื่อ `editor.js` โหลดไม่สำเร็จ |
| カーจากคลิก | **ไม่ต้องคำนวณเองเลย** — CM6 จัดการ mousedown/selection เองทั้งหมด (ตรวจแล้วกับข้อความซ้ำ) · **ลบ `offsetForElement`** แล้ว |
| scroll | `history.scrollRestoration = "manual"` เพราะ mount เปลี่ยนความสูงเอกสาร → จำ **offset ของ CM6 เอง** (`posAtCoords` → sessionStorage `doku.scroll` ต่อ path) ตอน `pagehide`/ซ่อน tab แล้วคืนด้วย `scrollIntoView` + align delta ใน rAF (+ pass 2 ที่ 160ms) · deep link `#หัวข้อ` ใช้ heading map |
| ชื่อเรื่อง | dedupe ด้วย `data-title-in-body` **เซ็ตที่ server ครั้งเดียว** จาก `CachedDoc.dedupe` (ผลจริงของการตัด h1 — ไม่ใช่ regex บน raw md) · CSS มีผลเฉพาะ `html[data-title-in-body][data-editor-mounted]` → no-JS/ก่อน mount ยังเห็นชื่อจาก header |
| virtualization | CM6 render เฉพาะบรรทัดใน viewport (+margin) — ต้องรู้ผลข้างเคียง: print ใช้ print path ของ CM6 (สลับ `printing` แล้ว render ทั้งหมดชั่วคราว) · full-page screenshot ใน `bun run shot` ขยาย viewport ก่อนถ่าย · **Ctrl+F ของเบราว์เซอร์เห็นเฉพาะบรรทัดที่ render** (ข้อจำกัดที่รู้ตัว — ยังไม่ตัดสินใจเรื่อง search) |
| SSE guard | **เปลี่ยนจาก `html[data-editing]` → `html[data-dirty]`** (`client.ts:46`) — เพราะตอนนี้ "แก้ไขอยู่" ตลอดเวลา ถ้ายังใช้ `data-editing` = live reload ตายทั้งระบบ |
| autosave | คงเดิม (debounce 800ms + `If-Match` + ไม่สร้าง revision ถ้าเนื้อหาเท่าเดิม — ข้อ 54) แต่ทำงานบน surface ที่ mount ตั้งแต่โหลด |
| print / `@media print` | ซ่อน gutter/floating UI · ไม่ให้カー/selection ปรากฏ · เนื้อหาพิมพ์ได้เหมือน read mode |
| a11y | CM6 มี ARIA ของตัวเอง · ทุก floating UI ต้องเข้าถึงด้วยคีย์บอร์ดได้ + `aria-label` ไทย · focus ring ตาม token · 200% zoom ไม่ทับ (สคริปต์ `bun run shot` ตรวจอยู่) |

### 3.2 block model ([08 ข้อ 64](08-decisions.md))

`BlockInfo { from, to, kind, depth, headLine, childCount }` — คำนวณสดต่อ **visible range** เท่านั้น
(ห้ามเดินทั้งเอกสารต่อ keystroke)

| kind | ขอบเขต | หมายเหตุ |
|---|---|---|
| `heading` | บรรทัด ATX | เก็บ level |
| `paragraph` | ย่อหน้าจนถึงบรรทัดว่าง | รวมรูปเดี่ยว = `figure` |
| `listItem` | บรรทัด item + บรรทัดต่อเนื่อง/ย่อหน้าใน item | **`depth` จาก indent** → children = item ที่ indent มากกว่าติดกัน |
| `code` | `FencedCode` | + fence ปิด |
| `table` | `Table` | GFM |
| `directive` | `:::` เปิด → `:::` ปิดระดับเดียวกัน | ใช้ fence scan ที่ `editor.ts:382` ต่อยอด |
| `hr` | `---` | |
| `image` | paragraph ที่มีแต่ `![](...)` | มี widget แล้ว |

**กฎ nesting:** `Tab` = ย้าย block ปัจจุบันไปเป็น child ของ block เหนือ (เพิ่ม indent 2 เคาะ สำหรับ list; สำหรับ
non-list แปลงเป็น list item ก่อน) · `Shift+Tab` = ย้อนกลับ · เลือก parent = ลูกถูกเลือกด้วย (Notion rule)

### 3.3 layers บนคอลัมน์อ่าน

```
.z-doku-gutter      overlay ของ client — + / ⋮⋮ ลอยตามเมาส์ (position: absolute ใน host)
                    เยื้องออกนอกคอลัมน์อ่านเสมอ (ไม่ทับอักขระแรก) แต่ clamp ไม่ให้ล้นขอบ
                    viewport — `gutterOffset()` ใน `web/client/pure.ts` ([08 ข้อ 80](08-decisions.md))
.z-doku-block-strip มีอยู่แล้ว (editor.ts:renderDirectiveStrip → client.ts:1242)
.z-doku-inline-bar  ใหม่ — bubble toolbar เมื่อเลือกข้อความ (Track D)
.cm-*               decoration + widget (Track B)
.doku-prose         ใช้ร่วม: หน้าตา/สเกล/สี มาจาก token ชุดเดียวกัน (docs/03)
```

**ข้อกำหนด overlay:** follow mouse ด้วย `pointermove` **ครั้งเดียวต่อ frame** (`requestAnimationFrame`)
· delay ซ่อน 200ms + hit-area ยืดเข้าหา handle (บทเรียนจาก plugin ที่ handle "หนีมือ") · pin ได้
· z-index/position relative กับ host (`client.ts:1297` มี delta tracking อยู่แล้ว — ใช้ต่อ)
· กล่องลอยทุกตัว (เมนู/palette) ต้องอยู่ใน viewport — `placeFloating()` + `max-height`/`overflow-y`
ของกล่องเอง ไม่ให้ยืดหน้า ([08 ข้อ 80](08-decisions.md))

---

## §4 Interaction inventory (เทียบ Notion)

| ฟีเจอร์ | Notion | Doku วันนี้ | M3.2 |
|---|---|---|---|
| insert block | `+` (hover) หรือ `/` | `/` เท่านั้น (`editor.ts:slashCompletion`) | ✅ `+` |
| เมนู block | `⋮⋮` คลิก → 7 action | block strip (attribute ของ `:::`) | ✅ `⋮⋮` + menu (turn into · duplicate · move · copy link · delete · word count) |
| ย้าย block | ลาก `⋮⋮` + drop line + เลือก depth | — | ✅ drag + `Mod+Shift+↑/↓` |
| เลือก block | คลิก handle · `Esc` · ลากข้าม block | — | ✅ ทั้งสามทาง |
| เลือกหลาย block | คลิก + `Shift+คลิก` · `Shift+↑/↓` | — | ✅ |
| block-aware `Cmd+A` | block → ทั้งหน้า | `selectAll` (defaultKeymap) | ✅ 2 จังหวะ |
| `Backspace` ที่ต้น block | outdent → ลบ marker → merge | `deleteCharBackward` | ✅ |
| indent/nest | `Tab`/`Shift+Tab` | `indentMore` (เว้นวรรค) | ✅ nest ตาม block model |
| turn into | `Cmd+/` หรือ menu | เขียน `:::` เอง / block strip บางส่วน | ✅ (`Mod-/`) |
| duplicate | menu / `Cmd+D` | — | ✅ |
| fold | chevron บน handle | — | ⏸ เฟส 2 ถ้าเวลาไม่พอ (ไม่ตัด) |
| จัดรูปแบบ inline | bubble + `Cmd+B/I/U/E/K` | ไม่มี | ✅ (ไม่ทำ underline — §6) |
| link | `Cmd+K` · paste URL ทับข้อความ | พิมพ์ `[](...)` เอง | ✅ + popover แก้ URL |
| checkbox คลิกได้ | ✅ | เห็น `- [ ]` ดิบ | ✅ (เขียนกลับ `- [x]`) |
| table แก้ในที่ | ✅ | ข้อความ pipe ดิบ | **คงแบบปัจจุบัน** ([08 ข้อ 68](08-decisions.md)) |
| paste จากเว็บ | smart paste คงโครง | ข้อความแบน | ✅ HTML → markdown |
| emoji `:name:` | ✅ | — | ✅ |
| highlight | `/color` | `==…=={.color}` + swatch (มีแล้ว) | ✅ คงไว้ |
| มือถือ | ไม่มี hover (long-press) | ไม่มี | ✅ long-press 150ms + row menu |

---

## §5 Track (ลำดับที่ต้องทำ — systemize before styling)

### Track A — one surface (S/M) · ปิดข้อ 52 ให้จริง ✅

- [x] mount CM6 ตั้งแต่โหลดหน้าเอกสาร (idle) — ลบ `mountWritingSurface`/`paintRendered` swap path
      (cursor จากคลิก = CM6 native · scroll = sessionStorage anchor + heading map)
- [x] เลิกใช้ `offsetForElement` (text search) ทั้งหมด + คง scroll/anchor
- [x] `data-title-in-body` เซ็ตที่ server ครั้งเดียว จาก `CachedDoc.dedupe` (ลบ logic toggle แล้ว)
- [x] **SSE guard → `data-dirty`** + event `doku:saved` กัน echo ของ autosave ตัวเอง + เทสต์
- [x] `@media print` + a11y pass (`bun run shot` ผ่านทั้ง 2 ธีม + 360px/200% zoom/reduced motion)
- **DoD:** คลิกบรรทัดไหนカーตรงนั้น 100% (ชุดทดสอบข้อความซ้ำ) · ไม่มี request `/api/render` หลังแตะเอกสาร ·
  ไม่มี layout shift > 2px · no-JS ยังอ่านครบ · live reload ยังทำงานเมื่อ **ไม่มี** การแก้ที่ค้าง

### Track B — read-parity (M) · "ไม่เห็น markdown ดิบ" ✅

- [x] GFM parser (`markdownLanguage`) + `markdownKeymap` (Enter สืบ list · Backspace ลบ marker) — Tab nest ตาม block model = C3
- [x] widget: `:::` (หัว block จาก `BLOCK_LABELS` + ข้อความของผู้ใช้ `title` → `label` → `caption` + พื้น tint ตาม variant) · **fence เปิด reveal เมื่อカーแตะ** (สมมาตรกับ fence ปิด — [08 ข้อ 79](08-decisions.md)) · math (`$…$` inline · `$$…$$` หลายบรรทัดผ่าน `blockMathField` เพราะ CM6 ห้าม plugin ทำ block decoration) · **checkbox คลิกได้** (เขียนกลับ `[x]`/`[ ]`) · `hr` · image · inline `:badge[…]` (attribute ชุดเดียวกับ renderer → CSS เดิมครอบ) · placeholder ต่อ block = E
- [x] code block: chrome (พื้น/ระยะ) + token mapping กับ Shiki github-light/dark ผ่าน `--k-code-*` — per-language ยังไม่ทำ (ไม่มี dependency ภาษาในบันเดิล)
- [x] marker policy: atomic **เฉพาะ delimiter** · ซ่อนเมื่อカーไม่สัมผัส · **composition guard** ([08 ข้อ 69](08-decisions.md)) · เพิ่มแล้ว: `<link /static/katex.css>` เมื่อเอกสารมีสมการ (เดิม route มีแต่ไม่เคย link → math ไม่มีสไตล์)
- **DoD:** screenshot read ↔ edit ต่างกันเฉพาะที่จำเป็น · พิมพ์ไทยต่อเนื่อง (สระ/วรรณยุกต์/คำผสม) ไม่มีカーเพี้ยน ·
  `bun run shot` เพิ่ม scenario "พิมพ์ไทย + IME"

### Track C — block layer (L) · "the Notion experience" ✅

- [x] **C1** `BlockInfo` + hover gutter (`+` / `⋮⋮`) + block highlight · follow mouse ต่อ frame · pin · delay 200ms + hit-area
      · โมดูล `web/editor/blocks.ts` (block model + op เป็น pure function → เทสต์ได้ · ไม่เดินทั้งเอกสาร ใช้ visible range)
- [x] **C2** block selection (`Esc` · โมดูลเลือกด้วย ⋮⋮ · ลาก/เลือกข้อความข้าม block) + multi-block + block-aware `Cmd+A`/`Backspace`
      (`hoverBlockField`/`blockSelectionField` = StateField · client เป็นเจ้าของ overlay ไม่ inline DOM hack)
- [x] **C3** ⌨️ คีย์ลัดทั้งหมด: `Mod+Shift+↑/↓` move · `Mod+D` duplicate · `Mod+/` turn into · `Tab`/`Shift+Tab` nest · `Shift+Delete` ลบ block
      (Tab ใช้ `shift:` แบบเดียวกับ `indentWithTab` ของ CM6 — ผูก `"Shift-Tab"` ตรง ๆ ไม่ถูก match)
      · เขียนกลับด้วย **change ที่เล็กที่สุด** (prefix/suffix ร่วม) → カーไม่กระโดด + undo ละเอียด
- [x] **C4** 🖱️ drag & drop: drop indicator · depth จากตำแหน่งแนวนอน · multi-block drag · long-press 150ms (touch) ·
      pointer ต่อ frame · ยกเลิกได้ (`pointercancel`/วางที่เดิม)
- **DoD:** ทุก op ที่ทำด้วยเมาส์มีคีย์ลัดเทียบเท่า · mouseup นอก editor = ยกเลิก ไม่แตะไฟล์ ·
  perf: pointer ≤ 1 งาน/frame · เลือก parent = เลือกลูก

### Track D — inline layer (M) ✅

- [x] bubble toolbar เมื่อเลือกข้อความ (B · I · S · code · link · highlight) → เขียน markdown
      (`.z-doku-inline-bar` + `.doku-inline-link` = overlay ของ client · สร้างครั้งเดียว + sync `aria-pressed` ในที่ ไม่ rebuild)
- [x] `Cmd+B/I/E` + **override `Mod-i`/`Mod-/`** ก่อน `defaultKeymap` (§2.3) · `Cmd+K` link popover (แก้/ลบ URL)
      (`Mod-/` = Turn into อยู่ที่ Track C แล้ว · คีย์ของผิวเอกสารชนะ chrome — [08 ข้อ 74](08-decisions.md))
- [x] paste URL ทับข้อความที่เลือก → link (`pasteURLAsLink` ของ lang-markdown — ไม่ต้องเขียนเอง)
- [x] smart paste HTML → markdown (ผ่าน `editor/inline.ts` ไม่ให้ logic ซ้ำ · `script`/`style`/`iframe` ทิ้งทั้งก้อน)
- [x] `:emoji:` (พิมพ์ `:name:` → อักขระจริง · IME guard)
- **DoD:** path bubble ไม่มี syntax โผล่ · paste จากหน้าเว็บได้ markdown ที่ `doku check` = 0 error ✅
      (เทสต์: `packages/server/test/inline.test.ts` + `inline-layer.test.ts` · smoke ใน Chromium จริง: bubble/B/I/E/Shift+S/K · วาง HTML · `:smile:` · autosave)

### Track E — feel / perf / a11y lock (S/M) ✅

- [x] focus line + active block + empty-block placeholder + motion/reduced-motion
  - `cm-doku-block-active` = ขีด accent บาง 35% ด้านซ้ายของ block ที่カーอยู่ (คำนวณจาก block model · visible range เท่านั้น
    · ซ่อนอัตโนมัติเมื่อไม่ focus หรือเป็น block selection ผ่าน `:not(.cm-doku-block-selected)` ใน CSS)
  - hint "พิมพ์ / เพื่อสั่ง" บนบรรทัดว่างตรงカー (decoration widget `aria-hidden` · ข้ามในโค้ด · ข้ามเมื่อเอกสารว่างทั้งใบ
    — กรณีนั้นเป็นหน้าที่ placeholder ของ CM)
  - `prefers-reduced-motion` ล็อกด้วยเทสต์ใน `tokens.test.ts` (ปิด animation/transition ทั้งหมด) + shot a11y ตรวจ DOM จริงในโหมด reduce
- [x] **perf budget เป็นเทสต์:** `packages/server/test/perf.test.ts` — Chromium จริง · เอกสาร 3,200 บรรทัด ·
  พิมพ์ 40 keystroke · budget `max ≤ 8ms` และ `mean ≤ 4ms` (วัดได้ max ≈ 0.7ms, median ≈ 0.2ms)
  · ใช้ `window.DokuEditor.perf` (ต้นทุน plugin + state field ต่อ update) · block math StateField เปลี่ยนเป็น **incremental**
  (cache ช่วง `$$…$$` + map ตำแหน่งตาม change · สแกนใหม่เฉพาะเมื่อวางข้อความที่มี `$$` หรือแตะ block/fence line — เดิมสแกนทั้งเอกสารทุก keystroke)
- [x] แยกไฟล์ `web/editor.ts`: `editor/{decorations,block-layer,inline-layer,blocks,inline,keymap}.ts`
  (775 บรรทัดจาก 1,931) · **`editor/gutter.ts` ไม่มี** — gutter เป็น overlay ของ client (ข้อ 66) ซึ่งอยู่ใน `client/main.ts`
  · **client ผ่าน bundler แล้ว** ([ข้อ 78](08-decisions.md)): `bun run build:client` → `public/client.js` เสิร์ฟเหมือน `editor.js`
  · seam ที่แยกแล้ว: `client/pure.ts` (S1 — heading/path/reload guard + `inRect`) · ที่เหลือทยอยย้ายจาก `main.ts` (`@ts-nocheck` = ratchet ที่ต้องลดลงเรื่อย ๆ)
- [x] `bun run shot` scenario โต้ตอบจริง (ทั้ง 2 ธีม): bubble · link popover · พิมพ์ไทย (insertText) ·
  **IME guard** (ระหว่าง composing ต้องไม่ rebuild + จบแล้ว rebuild) · Esc เลือก block · ลาก block (drop indicator + markdown ถูกจัดลำดับใหม่)
  · a11y ต่อหน้า: ชื่อคอนโทรล · focus ring · 200% zoom · 360px · reduced motion
  · สคริปต์ทำงานบน **สำเนา vault** (`var/tmp/shot-vault`) เพราะ scenario เขียนกลับได้ (autosave)
- **DoD:** `bun test` (346) + `bun run check` + `bun run typecheck` ผ่าน · `doku check examples/vault` = 0 error ·
  `docs/03` (visual spec ของ overlay/gutter/inline bar) + `docs/02`/`docs/06` (asset charset) + `AGENTS.md` sync ในคอมมิตเดียวกัน ✅

**บั๊กที่ scenario จับได้ (แก้ในรอบนี้):** `Escape` จังหวะแรกเคย blur editor → ยกเลิก block selection ไม่ได้และคีย์ chrome ไม่กลับมา
([08 ข้อ 76](08-decisions.md)) · decoration set ของ plugin ค้างตำแหน่งระหว่าง IME composition → CM throw
"Decorations that replace line breaks may not be specified via plugins" ([08 ข้อ 77](08-decisions.md))

**ประเมิน:** ~7–9 วันทำงาน (C4 = ก้อนใหญ่สุด · ถ้าจำเป็นให้ส่ง C1–C3 ก่อนแล้วปิด C4 ในรอบถัดไป — แต่ **อยู่ใน M3.2** ตาม [08 ข้อ 67](08-decisions.md))

---

## §6 เลื่อนออกจาก M3.2 / ตัดออก

| เรื่อง | สถานะ | เหตุผล |
|---|---|---|
| per-language code highlighting ใน editor | **เลื่อน** — ตอนนี้ map โทเคน/สี + chrome เท่านั้น | ไม่มี dependency ภาษาในบันเดิล (CSP self-host, ไม่มี lazy chunk) · ค่อยเพิ่มทีหลังเมื่อมีตัวที่คุ้ม |
| table widget (แก้ในที่) | **เลื่อน** — คง decoration ปัจจุบัน | [08 ข้อ 68](08-decisions.md): เสียงบ/ความคุ้มค่าไม่คุ้มในรอบนี้ |
| fold block | เฟส 2 ของ C (ถ้าเวลาไม่พอ) | ไม่ตัดออก แค่จัดลำดับ |
| underline | **ตัดออก** | markdown ไม่มี · `<u>` ขัด sanitize allowlist |
| comment / suggest edit | ตัดออก | ไม่มี auth/multi-user — นอก scope v1 |
| real-time collaboration | ตัดออก | vault = ไฟล์ · LAN · ไม่มี CRDT ในสโคป |
| drag ข้ามเอกสาร (`Move to`) | ตัดออก (ใช้ tree drag-drop ที่มีอยู่) | มีทางอื่นแล้ว |
| block id ในไฟล์ | ตัดออก | ขัด "ไฟล์คือความจริง" — block = line range |
| database / view | ตัดออก | นอก scope v1 |

---

## §7 Q7 — asset filename charset (ย้ายมาบังคับที่ M3.2)

เดิมค้างรอ upload API ที่ M4 ([08 Q7](08-decisions.md)) → **ย้ายมาที่ M3.2** ([08 ข้อ 72](08-decisions.md))
เพราะยังมีทางที่ asset เข้า vault อยู่แล้ว: เขียนไฟล์ตรงในโฟลเดอร์ vault (คน/AI), `mv` ผ่าน CLI/API, restore จาก trash

**สเปก (docs/06 §Path safety คงเดิม):** `[a-zA-Z0-9._\-\u0E00-\u0E7F ]+` · ห้าม `/` · ห้าม dotfile · ห้ามขึ้นต้น `.`

**จุดบังคับ (ทั้งสามชั้น):**

| ชั้น | พฤติกรรม |
|---|---|
| `core` | `isSafeAssetName()` ตัวเดียว (ใช้ร่วม CLI/server/MCP) + warning code ใหม่ `asset_name_invalid` (**error**) ใน `check.ts:CHECK_LEVELS` |
| `doku check` | รายงาน `asset_name_invalid` + `asset_name_suspect` (เตือนเมื่อตั้งชื่อที่เกือบผ่าน เช่น มีอักขระพิเศษโผล่) |
| route `/assets/*path` | ชื่อไม่ผ่าน → **404** (ไม่ serve) + ไม่แตะไฟล์ · log audit เมื่อ M4 |
| M4 upload API | ใช้ validator ตัวเดียวกันตอนรับไฟล์ (reject ก่อนเขียน) |
| render | อ้าง asset ที่ชื่อไม่ผ่าน → warning + placeholder (ไม่ 500) ตามหลัก "md พังยังได้เท่าที่ได้" |

---

## §8 ความเสี่ยง + มาตรการ

| ความเสี่ยง | ระดับ | มาตรการ |
|---|---|---|
| decoration/IME ทำพิมพ์ไทยเพี้ยน | **สูง** | composition guard + เทสต์พิมพ์ไทย + atomic เฉพาะ delimiter (§2.2) |
| one surface ทำ live reload/autosave ชนกัน | สูง | guard = `data-dirty` ([08 ข้อ 65](08-decisions.md)) + เทสต์ round-trip (พิมพ์ → autosave → watcher → SSE) |
| mount CM6 ทุกหน้าโหลดช้า | กลาง | mount idle + เฉพาะหน้าเอกสาร + วัด budget 8ms/keystroke |
| drag ทำข้อมูลหาย (drop ผิดที่) | กลาง | ทุก drag = 1 transaction เดียว (`view.dispatch`) + ยกเลิกได้ก่อน mouseup + revision ยังเก็บก่อน overwrite |
| overlay gutter หนีมือ | กลาง | delay 200ms + hit-area + pin + ต่อ frame (บทเรียน plugin) |
| ขอบเขตบาน (Notion clone) | กลาง | §6 = รายการที่ตัดออกแล้ว · ฟีเจอร์ใหม่ต้องเข้า docs/08 ก่อน |
| block model ผิดกับ markdown ที่ซ้อนกัน | กลาง | block model อ่านจาก Lezer + fence scan ตัวเดียวกับ renderer · `doku check` เป็น gate |

---

## §9 เกณฑ์ปิด M3.2

1. เปิดเอกสาร → คลิก/พิมพ์ได้ทันที **โดยไม่มีการแทนที่เนื้อหาทั้งบทความ** (ตรวจด้วย network log: 0 request `/api/render` หลังแตะ)
2. มี `+` และ `⋮⋮` ที่ตอบสนองเมาส์ + คีย์ลัดเทียบเท่าครบทุก action ใน §4 (ยกเว้นที่ระบุ)
3. พิมพ์ไทย/อังกฤษต่อเนื่องด้วย IME → カーและ decoration ไม่เพี้ยน
4. widget parity: `:::` · math · checkbox · image ตรงกับหน้าอ่าน (table = คงเดิมตามข้อ 68)
5. `bun test` · `bun run check` · `bun run typecheck` ผ่าน · `doku check examples/vault` = 0 error/warning เพิ่ม
6. `bun run shot` ผ่าน 2 ธีม + a11y (ชื่อคอนโทรล · focus ring · reduced motion · 360px · 200% zoom)
7. docs sync: `docs/03 §5` (visual spec) · `docs/07` (checkbox) · `docs/08` (ข้อ 63–72) · `AGENTS.md`
