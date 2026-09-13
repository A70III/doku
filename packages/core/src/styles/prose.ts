/**
 * Prose layer `.doku-prose` + doc chrome ของเนื้อหา (docs/03 Part B §2/§3/§7/§8)
 *
 * เนื้อหาเอกสารใช้ layer นี้ — **ห้ามใช้ Tailwind กับ content block** (hard invariant)
 *
 * M3.1: ใช้ reading scale (`--d-read*`) + rhythm token (`--d-flow*`, `--d-rhythm-*`)
 * แทนสเกล chrome · กฎคือ **มาก่อน heading · น้อยหลัง heading** เพราะตาต้องรู้ว่า
 * หัวข้อเป็นเจ้าของย่อหน้าถัดไป ไม่ใช่ของย่อหน้าก่อน
 */

export const PROSE_CSS = `
* { box-sizing: border-box; }

/* ── doc header (title block) ─────────────────────────────────────────────
   ไม่มี hairline ปิดท้าย — แยกจากเนื้อหาด้วยระยะ (บันได container ขั้น 1) */
.doku-doc-header {
  margin-bottom: var(--d-rhythm-h3);
}
.doku-doc-header .doku-doc-title {
  margin: 0;
  font-size: var(--d-read-h1);
  font-weight: 600;
  line-height: 1.15;
  letter-spacing: -0.014em;
  text-wrap: balance;
}
.doku-doc-lede {
  margin: var(--d-space-4) 0 0;
  max-width: 60ch;
  font-size: var(--d-read-lede);
  line-height: 1.6;
  color: var(--d-text-muted);
  text-wrap: pretty;
}
.doku-doc-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--d-space-1) var(--d-space-4);
  align-items: baseline;
  margin-top: var(--d-space-5);
  color: var(--d-text-subtle);
  font-size: var(--d-text-sm);
  font-variant-numeric: tabular-nums;
}
.doku-doc-path { font-family: var(--d-font-mono); color: var(--d-text-subtle); }
.doku-tag { color: var(--d-text-subtle); font-size: var(--d-text-sm); }
.doku-status { color: var(--d-text-subtle); font-size: var(--d-text-sm); }

/* ── colophon ท้ายเอกสาร (docs/08 ข้อ 49 — แทน shelfmark เหนือ h1) ───────── */
.doku-colophon {
  display: flex;
  flex-wrap: wrap;
  gap: var(--d-space-1) var(--d-space-5);
  align-items: baseline;
  margin-top: var(--d-rhythm-h2);
  padding-top: var(--d-space-5);
  border-top: 1px solid var(--d-border);
  font-size: var(--d-text-xs);
  color: var(--d-text-subtle);
}
.doku-colophon code {
  border: 0;
  background: none;
  padding: 0;
  color: var(--d-text-subtle);
}

.doku-warnings {
  margin: 0 0 var(--d-rhythm-h3);
  border: 1px solid var(--d-border);
  border-inline-start: 3px solid var(--k-warning);
  border-radius: var(--d-radius-sm);
  background: var(--d-bg-subtle);
  padding: var(--d-space-3) var(--d-space-4);
  font-size: var(--d-text-sm);
  color: var(--d-text-muted);
}
.doku-warnings ul { margin: var(--d-space-2) 0 0; padding-left: var(--d-space-4); }
.doku-warnings code { font-size: 0.8em; }

/* ── TOC (docs/08 ข้อ 49) ────────────────────────────────────────────────
   เดิมเป็น block ในบทความ สูง 352px (39% ของ viewport) — ตอนนี้เป็นคอลัมน์ sticky
   ไม่มีเส้น/ขอบของตัวเอง: แยกด้วยระยะของคอลัมน์ ไม่ใช่ด้วยกรอบ */
.doku-toc {
  margin: 0;
  font-size: var(--d-text-sm);
}
.doku-toc-title {
  display: block;
  margin-bottom: var(--d-space-3);
  color: var(--d-text-subtle);
  font-size: var(--d-text-xs);
  font-weight: 500;
}
.doku-toc ul { list-style: none; margin: 0; padding: 0; }
.doku-toc li { margin: 0; }
.doku-toc li + li { margin-top: var(--d-space-1); }
.doku-toc a {
  display: block;
  padding-block: var(--d-space-1);
  color: var(--d-text-muted);
  text-decoration: none;
  line-height: 1.5;
  transition: color var(--d-dur-fast) var(--d-ease);
}
.doku-toc a:hover { color: var(--k-text); }
.doku-toc a[aria-current='true'] { color: var(--d-accent); font-weight: 500; }
.doku-toc .doku-toc-h3 { padding-left: var(--d-space-3); }
/* จอแคบ: TOC เป็น <details> ท้ายเอกสาร — ย่อได้ ต้องอ่านออก */
.doku-toc[data-variant='inline'] { margin-top: var(--d-rhythm-h2); }
.doku-toc[data-variant='inline'] summary {
  cursor: pointer;
  color: var(--d-text-subtle);
  font-size: var(--d-text-sm);
}

/* ── prose ───────────────────────────────────────────────────────────────── */

.doku-prose {
  font-size: var(--d-read);
  line-height: var(--k-leading-body);
  overflow-wrap: break-word;
}
.doku-prose > * + * { margin-top: var(--d-flow); }
.doku-prose :is(h1, h2, h3, h4, h5, h6) {
  margin-block-start: var(--d-rhythm-h4);
  margin-block-end: var(--d-rhythm-after);
  font-weight: 600;
  line-height: 1.25;
  text-wrap: balance;
  scroll-margin-top: var(--d-space-16);
}
/* มาก่อน heading · น้อยหลัง heading — ห้ามให้สองด้านเท่ากัน */
.doku-prose h2 { margin-block-start: var(--d-rhythm-h2); font-size: var(--d-read-h2); letter-spacing: -0.008em; }
.doku-prose h3 { margin-block-start: var(--d-rhythm-h3); font-size: var(--d-read-h3); }
.doku-prose h4 { font-size: var(--d-read-h4); }
.doku-prose h5 { font-size: var(--d-text-sm); }
.doku-prose h6 { font-size: var(--d-text-sm); color: var(--d-text-muted); }
/* h1 ในเนื้อหา (เอกสารที่ไม่มี meta.title) — เท่ากับชื่อเรื่องบน header */
.doku-prose h1 { margin-block-start: 0; font-size: var(--d-read-h1); letter-spacing: -0.014em; }
.doku-prose > :is(h1, h2, h3, h4, h5, h6):first-child { margin-block-start: 0; }
/* หัวข้อไม่ต้องมีเส้นใต้ — hierarchy มาจากขนาด + ระยะ (docs/08 ข้อ 47–48) */
.doku-prose p { margin: 0; text-wrap: pretty; }
.doku-prose :lang(th) { line-height: var(--k-leading-th); }
.doku-prose a { color: var(--d-accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
.doku-prose strong { font-weight: 600; }
.doku-prose :is(ul, ol) { padding-left: var(--d-space-6); }
.doku-prose li + li { margin-top: var(--d-space-1); }
.doku-prose li > :is(ul, ol) { margin-top: var(--d-space-1); }
.doku-prose li.task-list-item { list-style: none; margin-left: calc(var(--d-space-6) * -1); }
.doku-prose blockquote {
  margin: 0;
  padding: var(--d-space-1) var(--d-space-6);
  border-left: 2px solid var(--d-border-strong);
  color: var(--d-text-muted);
}
.doku-prose hr { border: 0; border-top: 1px solid var(--d-border); margin-block: var(--d-rhythm-h2); }
.doku-prose img { max-width: 100%; height: auto; border-radius: var(--d-radius-sm); }
.doku-prose kbd {
  font-family: var(--d-font-mono);
  font-size: 0.8em;
  padding: 0.1em 0.4em;
  border: 1px solid var(--d-border-strong);
  border-bottom-width: 2px;
  border-radius: var(--d-radius-sm);
  background: var(--d-bg-subtle);
}

/* highlight (==…==) — brush underline ตาม docs/08 ข้อ 6 · สีอิ่มใช้กับ "เส้น" ไม่ใช่ข้อความ
   ต้องปิด background-color ของ UA (mark มี background-color: Mark เป็น default) ไม่งั้นได้พื้นเหลืองทึบ
   ทับเส้นขีดทับ — เป็น inversion ที่ผู้ใช้มองเห็นจริง */
.doku-prose [data-block='mark'] {
  color: inherit;
  padding: 0 0.1em;
  background-color: transparent;
  background-image: linear-gradient(
    transparent 58%,
    var(--dk-mapped-bg, var(--d-accent-weak)) 58%
  );
  background-repeat: no-repeat;
}

/* ── code ── พื้นจาง + ไม่มีกรอบ (บันไดขั้น 5 ไม่ใช่ 6) */
.doku-prose code {
  font-family: var(--d-font-mono);
  font-size: 0.875em;
  background: var(--d-bg-subtle);
  border-radius: var(--d-radius-sm);
  padding: 0.12em 0.35em;
}
.doku-prose pre {
  position: relative;
  margin: 0;
  padding: var(--d-space-4) var(--d-space-5);
  overflow: auto;
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-md);
  background: var(--d-bg-subtle);
  font-size: var(--d-text-sm);
  line-height: 1.65;
  tab-size: 2;
}
.doku-prose pre code { background: none; border: 0; padding: 0; font-size: 1em; }
.doku-prose pre.shiki { background: var(--d-bg-subtle) !important; }
.doku-prose pre.shiki .line { display: inline-block; width: 100%; }

[data-theme='dark'] .doku-prose pre.shiki span { color: var(--shiki-dark) !important; }
[data-theme='dark'] .doku-prose pre.shiki { background: var(--shiki-dark-bg) !important; }
@media (prefers-color-scheme: dark) {
  [data-theme='auto'] .doku-prose pre.shiki span { color: var(--shiki-dark) !important; }
  [data-theme='auto'] .doku-prose pre.shiki { background: var(--shiki-dark-bg) !important; }
}

/* code: copy button ถูกเพิ่มโดย client JS (หลัง sanitize) */
[data-part='copy-code'] {
  position: absolute;
  inset-block-start: var(--d-space-2);
  inset-inline-end: var(--d-space-2);
  border: 1px solid var(--d-border-control);
  border-radius: var(--d-radius-sm);
  background: var(--k-bg);
  color: var(--d-text-muted);
  font: inherit;
  font-size: var(--d-text-xs);
  padding: 0.15rem 0.5rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--d-dur) var(--d-ease);
}
.doku-prose pre:hover [data-part='copy-code'],
[data-part='copy-code']:focus-visible { opacity: 1; }

/* ── table ── เส้นแนวนอนเท่านั้น (ไม่เป็นกริดเต็ม) · ตัวเลขชิดขวา */
.doku-prose table {
  border-collapse: collapse;
  width: 100%;
  font-size: var(--d-text-sm);
}
.doku-prose :is(th, td) {
  border: 0;
  border-bottom: 1px solid var(--d-border);
  padding: var(--d-space-2) var(--d-space-3);
  text-align: left;
  vertical-align: top;
}
.doku-prose thead th {
  border-bottom: 1px solid var(--d-border-strong);
  color: var(--k-text);
  font-weight: 600;
}
.doku-prose tr:last-child td { border-bottom: 0; }

/* heading anchor — ต้องโผล่ด้วย keyboard ไม่ใช่แค่ hover */
.doku-anchor {
  margin-left: 0.35em;
  color: var(--d-text-subtle);
  text-decoration: none;
  opacity: 0;
  transition: opacity var(--d-dur) var(--d-ease);
}
.doku-prose :is(h1, h2, h3, h4, h5, h6):hover .doku-anchor,
.doku-prose :is(h1, h2, h3, h4, h5, h6):focus-within .doku-anchor,
.doku-anchor:focus-visible { opacity: 1; }
.doku-anchor:hover { color: var(--d-accent); }

/* math — error color มาจาก token (KaTeX ใส่ inline style เอง → !important อย่างเดียวที่ชนะได้)
   ห้ามส่ง errorColor เข้า rehype-katex เพราะจะ hardcode สีและไม่ตามธีม (docs/08 ข้อ 47) */
.doku-prose .katex-error { color: var(--k-danger) !important; }
.doku-prose .katex-display { overflow-x: auto; overflow-y: hidden; padding: var(--d-space-3) 0; }

/* ── reading UX (progress bar / zoom overlay) ────────────────────────────── */

.doku-progress {
  position: fixed;
  inset-block-start: 0;
  inset-inline: 0;
  height: 2px;
  z-index: 40;
  pointer-events: none;
}
.doku-progress > [data-part='progress-fill'] {
  height: 100%;
  width: 0;
  background: var(--d-accent);
  transition: width 80ms linear;
}

/* ── print (docs/03 §8) ──────────────────────────────────────────────────── */

@media print {
  .doku-progress, .doku-toc, .doku-warnings, .doku-footer, .doku-anchor,
  [data-part='copy-code'], [data-part='tablist'] { display: none !important; }
  .doku-card, article { border: 0 !important; box-shadow: none !important; max-width: none !important; padding: 0 !important; }
  .doku-prose a { color: inherit; text-decoration: underline; }
  .doku-prose pre, .doku-prose table, .doku-prose [data-block='callout'] { break-inside: avoid; }
  .doku-prose [data-block='margin-note'] { float: none; width: auto; margin: var(--d-space-3) 0; }
  .doku-prose [data-part='tab-panel'] { display: block !important; }
}
`
