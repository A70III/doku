/**
 * Design tokens (docs/03 Part B §1) — `--k-*` = สี/สถานะ, `--d-*` = มิติ/ระยะ/ฟอนต์
 *
 * ทุกอย่างในระบบอิง token เหล่านี้เท่านั้น (ห้าม hardcode ใน component)
 * ใช้ร่วมทั้งเว็บแอป (server) และหน้า preview ของ CLI → อยู่ที่ @doku/core
 * (CLI import server ไม่ได้ตามทิศทาง dependency — docs/08 ข้อ 28)
 *
 * M3.1 (docs/08 ข้อ 47–48): ค่าสีคำนวณใน OKLCH แล้ว verify contrast เป็นคู่จริง
 * — ทุก hue มี lightness เท่ากันต่อธีม และข้อความบน tint ของสีใช้ `--k-<hue>-ink`
 *   (docs/03 §1.1) · คู่สีทั้งหมดถูกล็อกด้วย `contrast.test.ts`
 */

/** ค่า token สำหรับ dark theme — ใช้ทั้ง `[data-theme='dark']` และ auto ตาม OS */
const DARK_TOKENS = `
  --k-app-bg: #14120f;
  --k-bg: #1a1815;
  --d-bg-subtle: #221f1a;
  --d-bg-muted: #2b2721;

  --d-border: #332f28;
  --d-border-strong: #4a443a;
  --d-border-control: #6c6964;

  --k-text: #ece7de;
  --d-text-muted: #a8a196;
  --d-text-subtle: #948e87;

  /* น้ำเงินตัวเดียวกันกับ light แค่สว่างขึ้น — ลด chroma จาก .152 (นีออนเย็นบนพื้นอุ่น) */
  --d-accent: #5b93e0;
  --k-on-accent: #14120f;
  --d-selection: color-mix(in srgb, var(--d-accent) 30%, transparent);

  /* palette — L ≈ 0.65 เท่ากันทุก hue, chroma จำกัดไม่ให้นีออนบนพื้นน้ำตาล */
  --k-red: #d77166;
  --k-orange: #c57e4c;
  --k-amber: #b08842;
  --k-yellow: #a18e41;
  --k-green: #559e67;
  --k-teal: #3a9d9c;
  --k-blue: #5a91d6;
  --k-purple: #a77bd7;

  --k-shadow-sm: 0 1px 2px rgb(0 0 0 / 0.30);
  --k-shadow-md: 0 2px 8px rgb(0 0 0 / 0.35);
  --k-shadow-lg: 0 4px 16px rgb(0 0 0 / 0.40);
`

export const TOKENS_CSS = `
:root {
  /* ── surface (warm neutrals — ตระกูลเดียวกับเส้นและตัวอักษร) ── */
  --k-app-bg: #f6f4ef;
  --k-bg: #fffefb;
  --d-bg-subtle: #f1eee8;
  --d-bg-muted: #e9e5dd;

  /* ── line (3 ระดับ: ประดับ → โครงสร้าง → คอนโทรล) ──
     --d-border* contrast ต่ำได้เพราะเป็นเครื่องประดับ
     --d-border-control เป็นเส้นขอบที่ *บอกว่าสิ่งนี้คือคอนโทรล* → WCAG 1.4.11 ต้อง ≥ 3:1 */
  --d-border: #e2dcd2;
  --d-border-strong: #cfc8bc;
  --d-border-control: #8d8984;

  /* ── text (warm ink · ทุกตัวผ่าน AA บนทุกพื้นรวม --d-bg-muted) ── */
  --k-text: #1c1a17;
  --d-text-muted: #5a544b;
  --d-text-subtle: #6b655f;

  /* ── accent (เดียว · ใช้กับสถานะปัจจุบันเท่านั้น) ──
     #2b5fc4 = น้ำเงินตัวเดียวกับ decision ข้อ 5 (5.9:1 บนพื้นเอกสาร · 4.73:1 บน bg-muted) */
  --d-accent: #2b5fc4;
  --k-on-accent: #fffefb;

  /* ── palette ── L (OKLCH lightness) เท่ากันทุก hue → หนักเบาเท่ากัน ไม่มีตัวไหนสกปรก/นีออน ── */
  --k-red: #b83933;
  --k-orange: #a05100;
  --k-amber: #875f00;
  --k-yellow: #796400;
  --k-green: #057635;
  --k-teal: #007273;
  --k-blue: #1766bd;
  --k-purple: #824db4;

  /* ── overlay / selection ── */
  --k-scrim: rgb(28 26 23 / 0.88);
  --k-on-scrim: #fffefb;

  /* ── derived จาก accent (นิยามที่เดียว — เปลี่ยน --d-accent แล้วตามหมด) ──
     [data-accent] ต่อท้ายไฟล์ recompute ชุดนี้จาก --doc-accent */
  --d-accent-weak: color-mix(in srgb, var(--d-accent) 14%, transparent);
  --d-accent-tint: color-mix(in srgb, var(--d-accent) 8%, var(--k-bg));
  --d-selection: color-mix(in srgb, var(--d-accent) 24%, transparent);

  /* ── hue-ink: ข้อความที่วางบน tint ของ hue นั้น ──
     ผสมกับ --k-text → light ได้เฉดเข้ม dark ได้เฉดอ่อน อัตโนมัติทั้งสองธีม
     (ห้ามใช้ --k-<hue> กับข้อความบน tint — ผ่านแค่ 4.1–4.5:1 · docs/08 ข้อ 47) */
  --k-red-ink: color-mix(in oklab, var(--k-red) 78%, var(--k-text));
  --k-orange-ink: color-mix(in oklab, var(--k-orange) 78%, var(--k-text));
  --k-amber-ink: color-mix(in oklab, var(--k-amber) 78%, var(--k-text));
  --k-yellow-ink: color-mix(in oklab, var(--k-yellow) 78%, var(--k-text));
  --k-green-ink: color-mix(in oklab, var(--k-green) 78%, var(--k-text));
  --k-teal-ink: color-mix(in oklab, var(--k-teal) 78%, var(--k-text));
  --k-blue-ink: color-mix(in oklab, var(--k-blue) 78%, var(--k-text));
  --k-purple-ink: color-mix(in oklab, var(--k-purple) 78%, var(--k-text));

  /* ── semantic = alias ของ palette (ไม่ใช่สีชุดที่สอง) ── */
  --k-success: var(--k-green);
  --k-warning: var(--k-amber);
  --k-danger: var(--k-red);
  --k-info: var(--k-blue);
  --k-tip: var(--k-purple);
  --k-quote: var(--d-text-muted);
  --k-success-ink: var(--k-green-ink);
  --k-warning-ink: var(--k-amber-ink);
  --k-danger-ink: var(--k-red-ink);
  --k-info-ink: var(--k-blue-ink);
  --k-tip-ink: var(--k-purple-ink);

  /* ── typography: chrome scale (rail/toolbar/panel) ── */
  --d-font-sans: 'Inter', 'Noto Sans Thai', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --d-font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace;

  --d-text-xs: 0.75rem;
  --d-text-sm: 0.875rem;
  --d-text-base: 1rem;
  --d-text-lg: 1.125rem;
  --d-text-xl: 1.375rem;
  --d-text-2xl: clamp(1.5rem, 1.3rem + 1vw, 1.875rem);
  --d-text-3xl: clamp(1.75rem, 1.5rem + 1.4vw, 2.25rem);

  /* ── typography: reading scale (.doku-prose เท่านั้น) ── */
  --d-read: 1.0625rem;
  --d-read-lede: 1.125rem;
  --d-read-h4: 1.0625rem;
  --d-read-h3: 1.25rem;
  --d-read-h2: clamp(1.5rem, 1.35rem + 0.6vw, 1.75rem);
  --d-read-h1: clamp(2rem, 1.6rem + 1.4vw, 2.75rem);

  --k-leading-body: 1.7;
  --k-leading-th: 1.9;
  --k-measure: 70ch;

  /* ── space ── (สเกลเดียวที่ยอมให้ใช้ · ห้ามอ้าง step ที่ไม่ถูก define — docs/08 ข้อ 50) */
  --d-space-1: 0.25rem;
  --d-space-2: 0.5rem;
  --d-space-3: 0.75rem;
  --d-space-4: 1rem;
  --d-space-5: 1.25rem;
  --d-space-6: 1.5rem;
  --d-space-8: 2rem;
  --d-space-10: 2.5rem;
  --d-space-12: 3rem;
  --d-space-16: 4rem;
  --d-space-20: 5rem;
  --d-space-24: 6rem;

  /* ── rhythm: chrome ── */
  --d-gutter: var(--d-space-6);

  /* ── rhythm: prose (มาก่อน heading · น้อยหลัง heading) ── */
  --d-flow: var(--d-space-6);
  --d-flow-loose: var(--d-space-8);
  --d-rhythm-h2: var(--d-space-16);
  --d-rhythm-h3: var(--d-space-12);
  --d-rhythm-h4: var(--d-space-8);
  --d-rhythm-after: var(--d-space-3);

  /* ── radius / shadow ── */
  --d-radius-sm: 2px;
  --d-radius-md: 4px;
  --d-radius-lg: 6px;
  --d-radius-pill: 999px;

  --k-shadow-sm: 0 1px 2px rgb(28 26 23 / 0.05);
  --k-shadow-md: 0 2px 8px rgb(28 26 23 / 0.08);
  --k-shadow-lg: 0 4px 16px rgb(28 26 23 / 0.10);

  /* ── motion ── */
  --d-dur-fast: 120ms;
  --d-dur: 200ms;
  --d-dur-slow: 320ms;
  --d-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --k-reveal-y: 8px;
}

[data-theme='dark'] {${DARK_TOKENS}}

/* data-theme='auto' (default) → ตาม OS · ขาด block นี้ = โหมด auto ไม่มีวันเป็น dark */
@media (prefers-color-scheme: dark) {
  [data-theme='auto'] {${DARK_TOKENS}}
}

/* per-document accent (docs/03 §1.2) — Zod validate #rrggbb มาก่อนแล้ว
   ต้อง recompute ทุกตัวที่ derive จาก accent ไม่ใช่แค่ --d-accent */
html[data-accent] {
  --d-accent: var(--doc-accent);
  --d-accent-weak: color-mix(in srgb, var(--doc-accent) 14%, transparent);
  --d-accent-tint: color-mix(in srgb, var(--doc-accent) 8%, var(--k-bg));
  --d-selection: color-mix(in srgb, var(--doc-accent) 24%, transparent);
}

/* สีที่ map จาก \`color=\` ของ block — ใช้เป็น fallback chain ใน component
   คู่กับ --k-<hue>-ink สำหรับ *ข้อความ* (ห้ามใช้ --dk-mapped-color กับข้อความบน tint) */
[data-color='red']    { --dk-mapped-color: var(--k-red);    --dk-mapped-ink: var(--k-red-ink);    --dk-mapped-bg: color-mix(in srgb, var(--k-red) 12%, var(--k-bg)); }
[data-color='orange'] { --dk-mapped-color: var(--k-orange); --dk-mapped-ink: var(--k-orange-ink); --dk-mapped-bg: color-mix(in srgb, var(--k-orange) 12%, var(--k-bg)); }
[data-color='amber']  { --dk-mapped-color: var(--k-amber);  --dk-mapped-ink: var(--k-amber-ink);  --dk-mapped-bg: color-mix(in srgb, var(--k-amber) 12%, var(--k-bg)); }
[data-color='yellow'] { --dk-mapped-color: var(--k-yellow); --dk-mapped-ink: var(--k-yellow-ink); --dk-mapped-bg: color-mix(in srgb, var(--k-yellow) 12%, var(--k-bg)); }
[data-color='green']  { --dk-mapped-color: var(--k-green);  --dk-mapped-ink: var(--k-green-ink);  --dk-mapped-bg: color-mix(in srgb, var(--k-green) 12%, var(--k-bg)); }
[data-color='teal']   { --dk-mapped-color: var(--k-teal);   --dk-mapped-ink: var(--k-teal-ink);   --dk-mapped-bg: color-mix(in srgb, var(--k-teal) 12%, var(--k-bg)); }
[data-color='blue']   { --dk-mapped-color: var(--k-blue);   --dk-mapped-ink: var(--k-blue-ink);   --dk-mapped-bg: color-mix(in srgb, var(--k-blue) 12%, var(--k-bg)); }
[data-color='purple'] { --dk-mapped-color: var(--k-purple); --dk-mapped-ink: var(--k-purple-ink); --dk-mapped-bg: color-mix(in srgb, var(--k-purple) 12%, var(--k-bg)); }

/* prefers-reduced-motion: ปิด animation/transition ทั้งหมดที่ block ใช้ (docs/03 §1.5) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`
