/**
 * Block styles (docs/03 Part B §3) — ยิงด้วย data attribute ไม่ตั้งชื่อ class ใหม่
 *
 * ทุก selector อยู่ใต้ `.doku-prose` (เนื้อหาเอกสาร) ยกเว้น overlay ของ figure zoom
 * ที่ต้องหลุด stacking context
 */

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
.doku-prose [data-block='callout'][data-variant='note']    { --dk-variant-color: var(--k-info);    --dk-variant-bg: color-mix(in srgb, var(--k-info) 9%, var(--k-bg));    --dk-icon: 'ℹ'; }
.doku-prose [data-block='callout'][data-variant='info']    { --dk-variant-color: var(--k-info);    --dk-variant-bg: color-mix(in srgb, var(--k-info) 9%, var(--k-bg));    --dk-icon: 'ℹ'; }
.doku-prose [data-block='callout'][data-variant='tip']     { --dk-variant-color: var(--k-tip);     --dk-variant-bg: color-mix(in srgb, var(--k-tip) 9%, var(--k-bg));     --dk-icon: '✦'; }
.doku-prose [data-block='callout'][data-variant='success'] { --dk-variant-color: var(--k-success); --dk-variant-bg: color-mix(in srgb, var(--k-success) 9%, var(--k-bg)); --dk-icon: '✓'; }
.doku-prose [data-block='callout'][data-variant='warning'] { --dk-variant-color: var(--k-warning); --dk-variant-bg: color-mix(in srgb, var(--k-warning) 10%, var(--k-bg)); --dk-icon: '⚠'; }
.doku-prose [data-block='callout'][data-variant='danger']  { --dk-variant-color: var(--k-danger);  --dk-variant-bg: color-mix(in srgb, var(--k-danger) 9%, var(--k-bg));  --dk-icon: '✕'; }
.doku-prose [data-block='callout'][data-variant='quote']   { --dk-variant-color: var(--k-quote);   --dk-variant-bg: var(--d-bg-subtle);                                  --dk-icon: '❝'; }
`

export const BLOCKS_CSS = `
/* ── callout ─────────────────────────────────────────────────────────────── */
.doku-prose [data-block='callout'] {
  --dk-color: var(--dk-mapped-color, var(--dk-variant-color, var(--k-info)));
  --dk-color-bg: var(--dk-mapped-bg, var(--dk-variant-bg, var(--d-bg-subtle)));
  position: relative;
  margin: 0;
  padding: var(--d-space-4) var(--d-space-4) var(--d-space-4) calc(var(--d-space-4) + 1.5em);
  border: 1px solid color-mix(in srgb, var(--dk-color) 26%, var(--d-border));
  border-inline-start: 4px solid var(--dk-color);
  border-radius: var(--d-radius-md);
  background: var(--dk-color-bg);
}
.doku-prose [data-block='callout']::before {
  content: var(--dk-icon, 'ℹ');
  position: absolute;
  inset-block-start: var(--d-space-4);
  inset-inline-start: var(--d-space-3);
  color: var(--dk-color);
  font-weight: 700;
  line-height: 1.2;
}
.doku-prose [data-block='callout'] > * + * { margin-top: var(--d-space-2); }
.doku-prose [data-part='callout-title'] {
  margin: 0;
  font-weight: 600;
  color: var(--dk-color);
}
${CALLOUT_VARIANTS}

/* ── badge / stat ────────────────────────────────────────────────────────── */
.doku-prose [data-block='badge'] {
  display: inline-block;
  padding: 0.05rem 0.5rem;
  border-radius: var(--d-radius-pill);
  background: var(--dk-mapped-bg, var(--d-accent-weak));
  color: var(--dk-mapped-color, var(--d-accent));
  border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
  font-size: var(--d-text-xs);
  font-weight: 600;
  line-height: 1.7;
}
.doku-prose [data-block='badge'][data-strike] { text-decoration: line-through; opacity: 0.75; }

.doku-prose [data-block='stats'] {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
  gap: var(--d-space-4);
}
.doku-prose [data-block='stat'][data-variant='tile'] {
  display: flex;
  flex-direction: column;
  gap: var(--d-space-1);
  padding: var(--d-space-4);
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-md);
  background: var(--d-bg-subtle);
}
.doku-prose [data-block='stat'][data-variant='inline'] {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35em;
}
.doku-prose [data-part='stat-value'] {
  font-size: var(--d-text-2xl);
  font-weight: 700;
  line-height: 1.1;
  color: var(--dk-mapped-color, var(--d-accent));
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
  margin: 0;
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
.doku-prose [data-block='figure'][data-missing] {
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
  margin: 0;
  padding: var(--d-space-6);
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, #000 82%, transparent);
  backdrop-filter: blur(2px);
}
.doku-prose [data-block='figure'][data-zoomed] img {
  width: auto;
  max-width: 96vw;
  max-height: 92vh;
  border: 0;
  cursor: zoom-out;
}
.doku-prose [data-block='figure'][data-zoomed] [data-part='figure-caption'] { color: #fff; }

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

/* ── card / section / grid / col ─────────────────────────────────────────── */
.doku-prose a[data-block='card'] {
  display: block;
  padding: var(--d-space-4);
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-md);
  background: var(--k-bg);
  color: inherit;
  text-decoration: none;
  box-shadow: var(--k-shadow-sm);
  transition: box-shadow var(--d-dur) var(--d-ease), transform var(--d-dur) var(--d-ease);
}
.doku-prose a[data-block='card']:hover {
  border-color: var(--d-border-strong);
  box-shadow: var(--k-shadow-md);
  transform: translateY(-1px);
}
.doku-prose [data-block='card'] [data-part='card-head'] { display: flex; align-items: center; gap: var(--d-space-2); }
.doku-prose [data-block='card'] [data-part='card-title'] { font-weight: 600; color: var(--k-text); }
.doku-prose [data-block='card'] [data-part='card-badge'] { margin-inline-start: auto; }
.doku-prose [data-block='card'] [data-part='card-body'] {
  display: block;
  margin-top: var(--d-space-2);
  color: var(--d-text-muted);
  font-size: var(--d-text-sm);
}
.doku-prose [data-block='card'] [data-part='card-body'] > * + * { margin-top: var(--d-space-2); }
.doku-prose [data-block='card'] [data-part='card-body'] > :last-child { margin-bottom: 0; }

.doku-prose [data-block='section'][data-variant='hero'] {
  padding: var(--d-space-6);
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-md);
  background: var(--d-bg-subtle);
}
.doku-prose [data-block='section'][data-variant='hero'] > :first-child { margin-top: 0; }
.doku-prose hr[data-block='section'][data-variant='divider'] {
  border: 0;
  border-top: 1px solid var(--d-border);
  margin: var(--d-space-8) 0;
}

.doku-prose [data-block='grid'] { display: grid; gap: var(--d-space-4); }
.doku-prose [data-block='grid'][data-cols='2'] { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.doku-prose [data-block='grid'][data-cols='3'] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.doku-prose [data-block='grid'][data-cols='4'] { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.doku-prose [data-block='grid'][data-gap='sm'] { gap: var(--d-space-2); }
.doku-prose [data-block='grid'][data-gap='lg'] { gap: var(--d-space-6); }
.doku-prose [data-block='col'] { min-width: 0; }
.doku-prose [data-block='col'] > * + * { margin-top: var(--d-space-4); }

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
.doku-prose [data-block='kv'] {
  margin: 0;
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-md);
  overflow: hidden;
}
.doku-prose [data-part='kv-row'] { display: grid; grid-template-columns: minmax(7rem, 30%) 1fr; }
.doku-prose [data-part='kv-row'] + [data-part='kv-row'] { border-top: 1px solid var(--d-border); }
.doku-prose [data-part='kv-key'] {
  margin: 0;
  padding: var(--d-space-2) var(--d-space-3);
  background: var(--d-bg-subtle);
  color: var(--d-text-muted);
  font-weight: 600;
  font-size: var(--d-text-sm);
}
.doku-prose [data-part='kv-value'] {
  margin: 0;
  padding: var(--d-space-2) var(--d-space-3);
  font-size: var(--d-text-sm);
}

.doku-prose [data-block='progress'] { display: flex; align-items: center; gap: var(--d-space-3); }
.doku-prose [data-block='progress'] progress {
  flex: 1;
  height: 0.6rem;
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
.doku-prose [data-part='progress-label'] { color: var(--d-text-muted); font-size: var(--d-text-sm); white-space: nowrap; }

.doku-prose [data-block='steps'] > ol,
.doku-prose [data-block='steps'] > ul {
  list-style: none;
  counter-reset: doku-step;
  padding-left: 0;
  margin: 0;
}
.doku-prose [data-block='steps'] li {
  counter-increment: doku-step;
  position: relative;
  padding-left: 2.5rem;
}
.doku-prose [data-block='steps'] li::before {
  content: counter(doku-step);
  position: absolute;
  inset-inline-start: 0;
  inset-block-start: 0.1em;
  width: 1.7rem;
  height: 1.7rem;
  display: grid;
  place-items: center;
  border-radius: var(--d-radius-pill);
  background: var(--d-accent-weak);
  color: var(--d-accent);
  font-size: var(--d-text-xs);
  font-weight: 700;
}
.doku-prose [data-block='steps'] li + li { margin-top: var(--d-space-3); }

.doku-prose [data-block='timeline'] {
  list-style: none;
  margin: 0;
  padding: 0 0 0 var(--d-space-4);
  border-inline-start: 2px solid var(--d-border);
}
.doku-prose [data-part='timeline-item'] { position: relative; }
.doku-prose [data-part='timeline-item'] + [data-part='timeline-item'] { margin-top: var(--d-space-4); }
.doku-prose [data-part='timeline-item']::before {
  content: '';
  position: absolute;
  inset-inline-start: calc(-1 * var(--d-space-4) - 5px);
  inset-block-start: 0.5em;
  width: 8px;
  height: 8px;
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

/* ── margin-note ─────────────────────────────────────────────────────────── */
.doku-prose [data-block='margin-note'] {
  margin: 0;
  padding: var(--d-space-3) var(--d-space-4);
  border-inline-start: 3px solid var(--d-border-strong);
  border-radius: var(--d-radius-sm);
  background: var(--d-bg-subtle);
  color: var(--d-text-muted);
  font-size: var(--d-text-sm);
}
.doku-prose [data-block='margin-note'] > * + * { margin-top: var(--d-space-2); }
@media (min-width: 1400px) {
  .doku-prose [data-block='margin-note'] {
    float: inline-end;
    clear: both;
    width: 15rem;
    margin: 0 calc(-1 * var(--d-space-12)) var(--d-space-4) var(--d-space-4);
  }
  .doku-prose [data-block='margin-note'][data-side='left'] {
    float: inline-start;
    margin: 0 var(--d-space-4) var(--d-space-4) calc(-1 * var(--d-space-12));
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
  padding: var(--d-space-2) var(--d-space-4);
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-sm);
  background: var(--d-bg-subtle);
}
.doku-prose [data-block='details'] > summary { cursor: pointer; font-weight: 600; }
.doku-prose [data-block='details'][open] > summary { margin-bottom: var(--d-space-2); }
.doku-prose [data-block='details'] > :not(summary) + :not(summary) { margin-top: var(--d-space-2); }

.doku-prose [data-block='tabs'] {
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-md);
  overflow: hidden;
}
.doku-prose [data-part='tablist'] {
  display: flex;
  flex-wrap: wrap;
  gap: var(--d-space-1);
  padding: var(--d-space-2);
  border-bottom: 1px solid var(--d-border);
  background: var(--d-bg-subtle);
}
.doku-prose [data-part='tab-button'] {
  appearance: none;
  border: 0;
  border-radius: var(--d-radius-sm);
  background: transparent;
  color: var(--d-text-muted);
  font: inherit;
  font-size: var(--d-text-sm);
  font-weight: 600;
  padding: 0.35rem 0.8rem;
  cursor: pointer;
}
.doku-prose [data-part='tab-button']:hover { background: var(--d-bg-muted); }
.doku-prose [data-part='tab-button'][aria-selected='true'] {
  background: var(--k-bg);
  color: var(--d-accent);
  box-shadow: var(--k-shadow-sm);
}
.doku-prose [data-part='tab-panel'] { padding: var(--d-space-4); }
.doku-prose [data-part='tab-panel'] > * + * { margin-top: var(--d-space-4); }
.doku-prose [data-part='tab-panel'] > :first-child { margin-top: 0; }
/* ไม่มี JS: แสดงทุก panel ซ้อนกัน (อ่านได้) — JS ใส่ data-enhanced แล้วโชว์เฉพาะ active */
.doku-prose [data-part='tab-panel'] + [data-part='tab-panel'] { border-top: 1px dashed var(--d-border); }
.doku-prose [data-block='tabs'][data-enhanced] [data-part='tab-panel'] { display: none; }
.doku-prose [data-block='tabs'][data-enhanced] [data-part='tab-panel'][data-active='true'] { display: block; }
`
