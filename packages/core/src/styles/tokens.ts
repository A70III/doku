/**
 * Design tokens (docs/03 Part B §1) — `--k-*` = สี/สถานะ, `--d-*` = มิติ/ระยะ/ฟอนต์
 *
 * ทุกอย่างในระบบอิง token เหล่านี้เท่านั้น (ห้าม hardcode ใน component)
 * ใช้ร่วมทั้งเว็บแอป (server) และหน้า preview ของ CLI → อยู่ที่ @doku/core
 * (CLI import server ไม่ได้ตามทิศทาง dependency — docs/08 ข้อ 28)
 */

/** ค่า token สำหรับ dark theme — ใช้ทั้ง `[data-theme='dark']` และ auto ตาม OS */
const DARK_TOKENS = `
  --k-app-bg: #14120f;
  --k-bg: #1a1815;
  --d-bg-subtle: #221f1a;
  --d-bg-muted: #2b2721;

  --d-border: #332f28;
  --d-border-strong: #4a443a;

  --k-text: #ece7de;
  --d-text-muted: #a8a196;
  --d-text-subtle: #948d80;

  --d-accent: #58a6ff;
  --d-accent-weak: color-mix(in srgb, var(--d-accent) 14%, transparent);

  --k-success: #3fb950;
  --k-warning: #d2991d;
  --k-danger: #f85149;
  --k-info: #58a6ff;
  --k-tip: #bc8cff;

  --k-red: #f85149;
  --k-orange: #f0883e;
  --k-amber: #d2991d;
  --k-yellow: #e3b341;
  --k-green: #3fb950;
  --k-teal: #2dd4bf;
  --k-blue: #58a6ff;
  --k-purple: #bc8cff;

  --k-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --k-shadow-md: 0 2px 8px rgba(0, 0, 0, 0.35);
  --k-shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.4);
`

export const TOKENS_CSS = `
:root {
  /* ── surface (warm neutrals — same family as lines and ink) ── */
  --k-app-bg: #f7f5f1;
  --k-bg: #fffefb;
  --d-bg-subtle: #f1eee8;
  --d-bg-muted: #e9e5dd;

  /* ── line (warm grey, one family) ── */
  --d-border: #e2dcd2;
  --d-border-strong: #cfc8bc;

  /* ── text (warm ink, not pure black) ── */
  --k-text: #1c1a17;
  --d-text-muted: #5d574e;
  --d-text-subtle: #6f695f;

  /* ── accent (เดียว · ใช้กับสถานะปัจจุบันเท่านั้น) ──
     #3b7df0 บนพื้นอุ่นได้ contrast 3.87:1 → ไม่ผ่าน WCAG AA สำหรับ link
     จึงลดความสว่างลงเป็น #2b5fc4 (5.9:1) — สีเดียวกัน เข้มกว่า */
  --d-accent: #2b5fc4;
  --d-accent-weak: color-mix(in srgb, var(--d-accent) 10%, transparent);

  /* ── semantic ── */
  --k-success: #1a7f37;
  --k-warning: #9a6700;
  --k-danger: #cf222e;
  --k-info: #0969da;
  --k-tip: #8250df;
  --k-quote: var(--d-text-muted);

  /* ── palette (mark / badge / callout color=) ── */
  --k-red: #cf222e;
  --k-orange: #bc4c00;
  --k-amber: #9a6700;
  --k-yellow: #8a6d00;
  --k-green: #1a7f37;
  --k-teal: #0f766e;
  --k-blue: #0969da;
  --k-purple: #8250df;

  /* ── typography ── */
  --d-font-sans: 'Inter', 'Noto Sans Thai', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --d-font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace;

  --d-text-xs: 0.75rem;
  --d-text-sm: 0.875rem;
  --d-text-base: 1rem;
  --d-text-lg: 1.125rem;
  --d-text-xl: 1.375rem;
  --d-text-2xl: clamp(1.5rem, 1.3rem + 1vw, 1.875rem);
  --d-text-3xl: clamp(1.75rem, 1.5rem + 1.4vw, 2.25rem);

  --k-leading-body: 1.75;
  --k-measure: 68ch;

  /* ── space / radius / shadow ── */
  --d-space-1: 0.25rem; --d-space-2: 0.5rem;  --d-space-3: 0.75rem; --d-space-4: 1rem;
  --d-space-6: 1.5rem;  --d-space-8: 2rem;    --d-space-12: 3rem;

  --d-radius-sm: 2px; --d-radius-md: 4px; --d-radius-lg: 6px; --d-radius-pill: 999px;

  --k-shadow-sm: 0 1px 2px rgba(28, 26, 23, 0.05);
  --k-shadow-md: 0 2px 8px rgba(28, 26, 23, 0.08);
  --k-shadow-lg: 0 4px 16px rgba(28, 26, 23, 0.10);

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

/* per-document accent (docs/03 §1.2) — Zod validate #rrggbb มาก่อนแล้ว */
html[data-accent] {
  --d-accent: var(--doc-accent);
  --d-accent-weak: color-mix(in srgb, var(--doc-accent) 12%, transparent);
}

/* สีที่ map จาก \`color=\` ของ block — ใช้เป็น fallback chain ใน component */
[data-color='red']    { --dk-mapped-color: var(--k-red);    --dk-mapped-bg: color-mix(in srgb, var(--k-red) 12%, var(--k-bg)); }
[data-color='orange'] { --dk-mapped-color: var(--k-orange); --dk-mapped-bg: color-mix(in srgb, var(--k-orange) 12%, var(--k-bg)); }
[data-color='amber']  { --dk-mapped-color: var(--k-amber);  --dk-mapped-bg: color-mix(in srgb, var(--k-amber) 14%, var(--k-bg)); }
[data-color='yellow'] { --dk-mapped-color: var(--k-yellow); --dk-mapped-bg: color-mix(in srgb, var(--k-yellow) 16%, var(--k-bg)); }
[data-color='green']  { --dk-mapped-color: var(--k-green);  --dk-mapped-bg: color-mix(in srgb, var(--k-green) 12%, var(--k-bg)); }
[data-color='teal']   { --dk-mapped-color: var(--k-teal);   --dk-mapped-bg: color-mix(in srgb, var(--k-teal) 12%, var(--k-bg)); }
[data-color='blue']   { --dk-mapped-color: var(--k-blue);   --dk-mapped-bg: color-mix(in srgb, var(--k-blue) 12%, var(--k-bg)); }
[data-color='purple'] { --dk-mapped-color: var(--k-purple); --dk-mapped-bg: color-mix(in srgb, var(--k-purple) 12%, var(--k-bg)); }

/* prefers-reduced-motion: ปิด animation/transition ทั้งหมดที่ block ใช้ (docs/03 §1.5) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`
