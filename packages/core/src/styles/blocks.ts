/**
 * Block styles (docs/03 Part B §3) — ยิงด้วย data attribute ไม่ตั้งชื่อ class ใหม่
 *
 * ทุก selector อยู่ใต้ `.doku-prose` (เนื้อหาเอกสาร) ยกเว้น overlay ของ figure zoom
 * ที่ต้องหลุด stacking context
 *
 * ไอคอนของ block: ส่งชื่อผ่าน `data-icon` → CSS mask (docs/08 ข้อ 35 · ห้าม inline svg)
 */

import { ICON_MASK_CSS } from "../icons/index.ts"

/** mask rule ต่อไอคอน — scoped ใต้ `.doku-prose` (chrome ใช้ inline svg คนละทาง) */
const BLOCK_ICON_CSS = ICON_MASK_CSS.replaceAll("[data-icon=", ".doku-prose [data-icon=")

/** ไอคอนที่แสดงเป็น `::before` ของ block — ใช้ `--dk-icon-mask` ที่ผูกจาก data-icon */
const BLOCK_ICON_BASE_CSS = `
.doku-prose [data-block][data-icon]::before {
  content: '';
  display: inline-block;
  inline-size: 1.1em;
  block-size: 1.1em;
  background-color: var(--dk-color, currentColor);
  -webkit-mask: var(--dk-icon-mask) center / contain no-repeat;
  mask: var(--dk-icon-mask) center / contain no-repeat;
}
`

/** figure width 5–100% (สเต็ป 5) — เลี่ยง inline style เพื่อคง allowlist ของ sanitize */
const FIGURE_WIDTH_CSS = Array.from(
  { length: 20 },
  (_, index) =>
    `.doku-prose [data-block='figure'][data-width='${(index + 1) * 5}'] { width: ${(index + 1) * 5}%; }`,
).join("\n")

/** motion delay/duration เป็นสเต็ป 100ms — ค่าถูก quantize ตั้งแต่ฝั่ง renderer */
const MOTION_DELAY_CSS = Array.from(
  { length: 21 },
  (_, index) =>
    `[data-block='motion'][data-delay='${index * 100}'] { animation-delay: ${index * 100}ms; }`,
).join("\n")

const MOTION_DURATION_CSS = Array.from(
  { length: 30 },
  (_, index) =>
    `[data-block='motion'][data-duration='${(index + 1) * 100}'] { animation-duration: ${(index + 1) * 100}ms; }`,
).join("\n")

const CALLOUT_VARIANTS = `
.doku-prose [data-block='callout'][data-variant='note']    { --dk-variant-color: var(--k-info);    --dk-variant-ink: var(--k-info-ink);    --dk-variant-bg: color-mix(in srgb, var(--k-info) 9%, var(--k-bg)); }
.doku-prose [data-block='callout'][data-variant='info']    { --dk-variant-color: var(--k-info);    --dk-variant-ink: var(--k-info-ink);    --dk-variant-bg: color-mix(in srgb, var(--k-info) 9%, var(--k-bg)); }
.doku-prose [data-block='callout'][data-variant='tip']     { --dk-variant-color: var(--k-tip);     --dk-variant-ink: var(--k-tip-ink);     --dk-variant-bg: color-mix(in srgb, var(--k-tip) 9%, var(--k-bg)); }
.doku-prose [data-block='callout'][data-variant='success'] { --dk-variant-color: var(--k-success); --dk-variant-ink: var(--k-success-ink); --dk-variant-bg: color-mix(in srgb, var(--k-success) 9%, var(--k-bg)); }
.doku-prose [data-block='callout'][data-variant='warning'] { --dk-variant-color: var(--k-warning); --dk-variant-ink: var(--k-warning-ink); --dk-variant-bg: color-mix(in srgb, var(--k-warning) 10%, var(--k-bg)); }
.doku-prose [data-block='callout'][data-variant='danger']  { --dk-variant-color: var(--k-danger);  --dk-variant-ink: var(--k-danger-ink);  --dk-variant-bg: color-mix(in srgb, var(--k-danger) 9%, var(--k-bg)); }
.doku-prose [data-block='callout'][data-variant='quote']   { --dk-variant-color: var(--k-quote);   --dk-variant-ink: var(--k-quote);       --dk-variant-bg: var(--d-bg-subtle); }
`

export const BLOCKS_CSS = `
/* ── callout ───────────────────────────────────────────────────────────────
   คง container ไว้ — พื้น tint + rule ซ้าย *บอกความหมาย* (เตือน/เกร็ด) ไม่ใช่ประดับ
   ข้อความใช้ --dk-ink (ไม่ใช่ --dk-color) — สีอิ่มสงวนไว้กับ rule/icon (docs/08 ข้อ 47) */
.doku-prose [data-block='callout'] {
  --dk-color: var(--dk-mapped-color, var(--dk-variant-color, var(--k-info)));
  --dk-ink: var(--dk-mapped-ink, var(--dk-variant-ink, var(--k-info-ink)));
  --dk-color-bg: var(--dk-mapped-bg, var(--dk-variant-bg, var(--d-bg-subtle)));
  position: relative;
  padding: var(--d-space-4) var(--d-space-5) var(--d-space-4) calc(var(--d-space-5) + 1.4em);
  border: 0;
  border-inline-start: 3px solid var(--dk-color);
  border-radius: var(--d-radius-sm);
  background: var(--dk-color-bg);
}
.doku-prose [data-block='callout'][data-icon]::before {
  position: absolute;
  inset-block-start: calc(var(--d-space-4) + 0.15em);
  inset-inline-start: var(--d-space-4);
  --dk-color: var(--dk-mapped-color, var(--dk-variant-color, var(--k-info)));
}
/* ระยะภายใน callout มาจาก prose rhythm (②c) — ห้ามตั้ง margin ที่นี่ */
.doku-prose [data-part='callout-title'] {
  font-weight: 600;
  color: var(--dk-ink);
}
${CALLOUT_VARIANTS}

/* ── badge / stat ────────────────────────────────────────────────────────── */
.doku-prose [data-block='badge'] {
  display: inline-block;
  padding: 0.05rem 0.45rem;
  border-radius: var(--d-radius-sm);
  background: var(--dk-mapped-bg, var(--d-accent-tint));
  color: var(--dk-mapped-ink, var(--d-accent));
  font-size: var(--d-text-xs);
  font-weight: 600;
  line-height: 1.7;
}
.doku-prose [data-block='badge'][data-strike] { text-decoration: line-through; opacity: 0.75; }

/* stats — ไม่มี container: ตัวเลขกับ label ยืนบนพื้นหน้า คั่นด้วยช่องว่าง */
.doku-prose [data-block='stats'] {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
  gap: var(--d-space-6);
}
.doku-prose [data-block='stat'][data-variant='tile'] {
  display: flex;
  flex-direction: column;
  gap: var(--d-space-1);
}
.doku-prose [data-block='stat'][data-variant='inline'] {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35em;
}
.doku-prose [data-part='stat-value'] {
  font-size: var(--d-text-2xl);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--dk-mapped-ink, var(--d-accent));
}
.doku-prose [data-variant='inline'] [data-part='stat-value'] {
  font-size: var(--d-text-lg);
}
.doku-prose [data-part='stat-label'] { color: var(--d-text-muted); font-size: var(--d-text-sm); }

/* ── figure / gallery / video ────────────────────────────────────────────── */
.doku-prose [data-block='figure'] {
  display: flex;
  flex-direction: column;
  gap: var(--d-space-2);
  max-width: 100%;
}
.doku-prose [data-block='figure'][data-align='left'] { align-items: flex-start; }
.doku-prose [data-block='figure'][data-align='center'] { align-items: center; text-align: center; margin-inline: auto; }
.doku-prose [data-block='figure'][data-align='right'] { align-items: flex-end; text-align: right; margin-inline-start: auto; }
.doku-prose [data-block='figure'][data-align='full'] { width: 100%; }
.doku-prose [data-block='figure'] img {
  width: 100%;
  height: auto;
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-md);
  background: var(--d-bg-subtle);
}
.doku-prose [data-block='figure'][data-missing],
.doku-prose [data-block='video'][data-missing] {
  border: 1px dashed var(--d-border-strong);
  border-radius: var(--d-radius-md);
  padding: var(--d-space-4);
  color: var(--d-text-subtle);
  font-size: var(--d-text-sm);
}
.doku-prose [data-part='figure-caption'] {
  color: var(--d-text-muted);
  font-size: var(--d-text-sm);
  line-height: 1.6;
}
${FIGURE_WIDTH_CSS}

.doku-prose [data-block='figure'][data-zoom] img { cursor: zoom-in; }
.doku-prose [data-block='figure'][data-zoom][data-zoomed] {
  position: fixed;
  inset: 0;
  z-index: 60;
  width: auto;
  max-width: none;
  /* overlay เต็มจอ — ห้ามรับ flow margin ของ prose (ตั้งที่ตัวเอง ไม่สู้ specificity) */
  --dk-flow: 0;
  padding: var(--d-space-6);
  align-items: center;
  justify-content: center;
  background: var(--k-scrim);
}
.doku-prose [data-block='figure'][data-zoomed] img {
  width: auto;
  max-width: 96vw;
  max-height: 92vh;
  border: 0;
  cursor: zoom-out;
}
.doku-prose [data-block='figure'][data-zoomed] [data-part='figure-caption'] { color: var(--k-on-scrim); }

.doku-prose [data-block='gallery'] { display: grid; gap: var(--d-space-4); }
.doku-prose [data-block='gallery'][data-cols='2'] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.doku-prose [data-block='gallery'][data-cols='3'] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.doku-prose [data-block='gallery'][data-cols='4'] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.doku-prose [data-block='gallery'] [data-block='figure'] { width: 100%; }

.doku-prose [data-block='video'] {
  display: block;
  width: 100%;
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-md);
  background: var(--d-bg-subtle);
}

/* YouTube embed (docs/08 ข้อ 65) — figure ครอบ iframe 16:9 · ไม่มีเงา/สีเพิ่ม
   ปล่อยให้ iframe แบนในกรอบเดียวกับ player อื่น */
/* เนื้อในของ :::video (ไม่ใช่ส่วนของ player) → ห่อ figure: media ต้องเต็มความกว้างเหมือนเดิม */
.doku-prose [data-block='video'] > :is(video, audio) {
  display: block;
  width: 100%;
}

.doku-prose [data-block='video'][data-provider='youtube'] {
  overflow: hidden;
}
.doku-prose [data-block='video'][data-provider='youtube'] iframe {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  border: 0;
}

/* ── card / section / grid / col ──────────────────────────────────────────
   card = object จริงที่มีการกระทำ → คงกรอบไว้ แต่ **ตัด shadow/hover-lift**
   (depth มาจาก hairline + พื้น ไม่ใช่เงา — docs/08 ข้อ 33) */
.doku-prose [data-block='card'] {
  display: block;
  padding: var(--d-space-4) var(--d-space-5);
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-md);
  background: var(--k-bg);
  color: inherit;
  text-decoration: none;
  transition: border-color var(--d-dur-fast) var(--d-ease);
}
.doku-prose a[data-block='card']:hover { border-color: var(--d-border-strong); }
.doku-prose [data-block='card'] [data-part='card-head'] { display: flex; align-items: center; gap: var(--d-space-2); }
.doku-prose [data-block='card'][data-icon]::before {
  --dk-color: var(--d-accent);
  flex: none;
}
.doku-prose [data-block='card'] [data-part='card-title'] { font-weight: 600; color: var(--k-text); }
.doku-prose [data-block='card'] [data-part='card-badge'] { margin-inline-start: auto; }
.doku-prose [data-block='card'] [data-part='card-body'] {
  display: block;
  margin-top: var(--d-space-2);
  color: var(--d-text-muted);
  font-size: var(--d-text-sm);
}

/* section — ไม่มี container: แยกด้วยระยะ + heading size (บันไดขั้น 1/3) */
.doku-prose [data-block='section'][data-variant='hero'] > :is(h1, h2, h3) {
  font-size: var(--d-read-h2);
  letter-spacing: -0.008em;
}
.doku-prose [data-block='section'][data-variant='divider'] > hr {
  border: 0;
  border-top: 1px solid var(--d-border);
  margin-block: var(--d-rhythm-h2);
}

.doku-prose [data-block='grid'] { display: grid; gap: var(--d-space-6); }
.doku-prose [data-block='grid'][data-cols='2'] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.doku-prose [data-block='grid'][data-cols='3'] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.doku-prose [data-block='grid'][data-cols='4'] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.doku-prose [data-block='grid'][data-gap='sm'] { gap: var(--d-space-3); }
.doku-prose [data-block='grid'][data-gap='lg'] { gap: var(--d-space-8); }
.doku-prose [data-block='col'] { min-width: 0; }

/* responsive: ลดคอลัมน์ให้อ่านรู้เรื่องบนจอเล็ก (docs/03 §2) */
@media (max-width: 900px) {
  .doku-prose [data-block='gallery'][data-cols='3'],
  .doku-prose [data-block='gallery'][data-cols='4'],
  .doku-prose [data-block='grid'][data-cols='3'],
  .doku-prose [data-block='grid'][data-cols='4'] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .doku-prose [data-block='gallery'],
  .doku-prose [data-block='grid'] { grid-template-columns: 1fr; }
}

/* ── kv / progress / steps / timeline ────────────────────────────────────── */
/* kv = definition list: ไม่มีกรอบนอก · hairline เฉพาะระหว่างแถว (บันไดขั้น 2) */
.doku-prose [data-part='kv-row'] {
  display: grid;
  grid-template-columns: minmax(6rem, 24%) 1fr;
  gap: var(--d-space-4);
  padding-block: var(--d-space-3);
  border-bottom: 1px solid var(--d-border);
}
.doku-prose [data-part='kv-row']:last-child { border-bottom: 0; padding-bottom: 0; }
.doku-prose [data-part='kv-row']:first-child { padding-top: 0; }
.doku-prose [data-part='kv-key'] {
  color: var(--d-text-muted);
  font-size: var(--d-text-sm);
}
.doku-prose [data-part='kv-value'] {
  font-size: var(--d-text-sm);
}

.doku-prose [data-block='progress'] { display: flex; align-items: center; gap: var(--d-space-3); }
.doku-prose [data-block='progress'] progress {
  flex: 1;
  height: 0.5rem;
  border: 0;
  border-radius: var(--d-radius-pill);
  background: var(--d-bg-muted);
  overflow: hidden;
  appearance: none;
  -webkit-appearance: none;
}
.doku-prose progress::-webkit-progress-bar { background: var(--d-bg-muted); border-radius: var(--d-radius-pill); }
.doku-prose progress::-webkit-progress-value { background: var(--d-accent); border-radius: var(--d-radius-pill); }
.doku-prose progress::-moz-progress-bar { background: var(--d-accent); border-radius: var(--d-radius-pill); }
.doku-prose [data-part='progress-label'] { color: var(--d-text-muted); font-size: var(--d-text-sm); white-space: nowrap; font-variant-numeric: tabular-nums; }

/* steps — เลขลำดับเป็น *ตัวอักษร* ไม่ใช่ pill ทึบ (หมายเลขสื่อลำดับอยู่แล้ว) */
.doku-prose [data-block='steps'] > ol,
.doku-prose [data-block='steps'] > ul {
  list-style: none;
  counter-reset: doku-step;
  padding-left: 0;
}
.doku-prose [data-block='steps'] li {
  counter-increment: doku-step;
  position: relative;
  padding-left: var(--d-space-8);
}
.doku-prose [data-block='steps'] li::before {
  content: counter(doku-step);
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0;
  color: var(--d-accent);
  font-size: var(--d-text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.doku-prose [data-block='steps'] li + li { margin-top: var(--d-space-4); }

/* timeline — เส้นเดียว + จุด (บันไดขั้น 2) */
.doku-prose [data-block='timeline'] {
  list-style: none;
  padding: 0 0 0 var(--d-space-5);
  border-inline-start: 1px solid var(--d-border-strong);
}
.doku-prose [data-part='timeline-item'] { position: relative; }
.doku-prose [data-part='timeline-item'] + [data-part='timeline-item'] { margin-top: var(--d-space-5); }
.doku-prose [data-part='timeline-item']::before {
  content: '';
  position: absolute;
  inset-inline-start: calc(-1 * var(--d-space-5) - 3px);
  inset-block-start: 0.5em;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--d-accent);
}
.doku-prose [data-part='timeline-label'] {
  display: block;
  color: var(--d-text-muted);
  font-size: var(--d-text-sm);
  font-weight: 600;
}
.doku-prose [data-part='timeline-text'] { display: block; }

/* ── margin-note ── rule ซ้ายเส้นเดียว ไม่มีพื้น (บันไดขั้น 2) */
.doku-prose [data-block='margin-note'] {
  padding: var(--d-space-1) 0 var(--d-space-1) var(--d-space-4);
  border-inline-start: 2px solid var(--d-border-strong);
  color: var(--d-text-muted);
  font-size: var(--d-text-sm);
}
/* ≥1400px: ลอยข้างคอลัมน์ — จัดระยะเองผ่าน \`--dk-flow\` (margin สี่ด้านจะไปทับ flow ไม่ได้) */
@media (min-width: 1400px) {
  .doku-prose [data-block='margin-note'] {
    float: inline-end;
    clear: both;
    width: 15rem;
    --dk-flow: 0;
    margin-block-end: var(--d-space-4);
    margin-inline: var(--d-space-4) calc(-1 * var(--d-space-12));
  }
  .doku-prose [data-block='margin-note'][data-side='left'] {
    float: inline-start;
    margin-inline: calc(-1 * var(--d-space-12)) var(--d-space-4);
  }
}

/* ── motion / details / tabs ─────────────────────────────────────────────── */
@keyframes doku-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes doku-fade-up { from { opacity: 0; transform: translateY(var(--k-reveal-y)); } to { opacity: 1; transform: none; } }
@keyframes doku-fade-down { from { opacity: 0; transform: translateY(calc(-1 * var(--k-reveal-y))); } to { opacity: 1; transform: none; } }
@keyframes doku-slide-left { from { opacity: 0; transform: translateX(var(--k-reveal-y)); } to { opacity: 1; transform: none; } }
@keyframes doku-slide-right { from { opacity: 0; transform: translateX(calc(-1 * var(--k-reveal-y))); } to { opacity: 1; transform: none; } }
@keyframes doku-scale { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes doku-blur-in { from { opacity: 0; filter: blur(6px); } to { opacity: 1; filter: none; } }

[data-block='motion'][data-effect='fade'] { --dk-motion-name: doku-fade; }
[data-block='motion'][data-effect='fade-up'] { --dk-motion-name: doku-fade-up; }
[data-block='motion'][data-effect='fade-down'] { --dk-motion-name: doku-fade-down; }
[data-block='motion'][data-effect='slide-left'] { --dk-motion-name: doku-slide-left; }
[data-block='motion'][data-effect='slide-right'] { --dk-motion-name: doku-slide-right; }
[data-block='motion'][data-effect='scale'] { --dk-motion-name: doku-scale; }
[data-block='motion'][data-effect='blur-in'] { --dk-motion-name: doku-blur-in; }

/* JS ติด \`data-motion-ready\` ที่ <html> → ค่อยซ่อนก่อน แล้ว observer ใส่ data-visible
   (ถ้า JS ไม่ทำงาน เนื้อหายังอ่านได้ครบ) */
html[data-motion-ready] [data-block='motion']:not([data-visible]) { opacity: 0; }
[data-block='motion'][data-visible] {
  animation-name: var(--dk-motion-name, doku-fade-up);
  animation-timing-function: var(--d-ease);
  animation-fill-mode: both;
}
${MOTION_DELAY_CSS}
${MOTION_DURATION_CSS}

[data-motion='off'] [data-block='motion'] { opacity: 1 !important; animation: none !important; }
@media (prefers-reduced-motion: reduce) {
  html[data-motion-ready] [data-block='motion'] { opacity: 1 !important; animation: none !important; }
}

.doku-prose [data-block='details'] {
  padding: 0;
  border: 0;
  background: none;
}
.doku-prose [data-block='details'] > summary {
  cursor: pointer;
  padding-block: var(--d-space-2);
  border-bottom: 1px solid var(--d-border);
  font-weight: 600;
}
.doku-prose [data-block='details'][open] > summary { margin-bottom: var(--d-space-3); }

/* tabs — hairline คั่น header + tab ที่ active ขีด accent (ไม่มี pill/เงา/กรอบ) */
.doku-prose [data-block='tabs'] { border: 0; }
.doku-prose [data-part='tablist'] {
  display: flex;
  flex-wrap: wrap;
  gap: var(--d-space-5);
  padding: 0;
  border-bottom: 1px solid var(--d-border);
  background: none;
}
.doku-prose [data-part='tab-button'] {
  appearance: none;
  border: 0;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--d-text-muted);
  font: inherit;
  font-size: var(--d-text-sm);
  padding: var(--d-space-2) 0;
  cursor: pointer;
  transition: color var(--d-dur-fast) var(--d-ease), border-color var(--d-dur-fast) var(--d-ease);
}
.doku-prose [data-part='tab-button']:hover { color: var(--k-text); }
.doku-prose [data-part='tab-button'][aria-selected='true'] {
  color: var(--d-accent);
  border-bottom-color: var(--d-accent);
  font-weight: 600;
}
.doku-prose [data-part='tab-panel'] { padding: var(--d-space-5) 0 0; }
/* ไม่มี JS: แสดงทุก panel ซ้อนกัน (อ่านได้) — JS ใส่ data-enhanced แล้วโชว์เฉพาะ active */
.doku-prose [data-part='tab-panel'] + [data-part='tab-panel'] { border-top: 1px solid var(--d-border); }
.doku-prose [data-block='tabs'][data-enhanced] [data-part='tab-panel'] { display: none; }
.doku-prose [data-block='tabs'][data-enhanced] [data-part='tab-panel'][data-active='true'] { display: block; }
${BLOCK_ICON_CSS}
${BLOCK_ICON_BASE_CSS}
`
