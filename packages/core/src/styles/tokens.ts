/**
 * Design tokens (docs/03 Part B §1) — `--k-*` = สี/สถานะ, `--d-*` = มิติ/ระยะ/ฟอนต์
 *
 * ทุกอย่างในระบบอิง token เหล่านี้เท่านั้น (ห้าม hardcode ใน component)
 * ใช้ร่วมทั้งเว็บแอป (server) และหน้า preview ของ CLI → อยู่ที่ @doku/core
 * (CLI import server ไม่ได้ตามทิศทาง dependency — docs/08 ข้อ 28)
 */

export const TOKENS_CSS = `
:root {
  /* ── surface ── */
  --k-app-bg: #f4f7fd;
  --k-bg: #ffffff;
  --d-bg-subtle: #f6f8fa;
  --d-bg-muted: #eef2f5;

  /* ── line ── */
  --d-border: #d8dee6;
  --d-border-strong: #c2cbd6;

  /* ── text ── */
  --k-text: #1f2328;
  --d-text-muted: #656d76;
  --d-text-subtle: #8b949e;

  /* ── accent (default; override ได้ต่อเอกสาร) ── */
  --d-accent: #3b7df0;
  --d-accent-weak: rgba(59, 125, 240, 0.10);

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

  --d-radius-sm: 0.5rem; --d-radius-md: 0.75rem; --d-radius-lg: 1rem; --d-radius-pill: 999px;

  --k-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --k-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.08);
  --k-shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.12);

  /* ── motion ── */
  --d-dur-fast: 120ms;
  --d-dur: 200ms;
  --d-dur-slow: 320ms;
  --d-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --k-reveal-y: 8px;
}

[data-theme='dark'] {
  --k-app-bg: #0a0d12;
  --k-bg: #0d1117;
  --d-bg-subtle: #161b22;
  --d-bg-muted: #21262d;

  --d-border: #30363d;
  --d-border-strong: #484f58;

  --k-text: #e6edf3;
  --d-text-muted: #8b949e;
  --d-text-subtle: #6e7681;

  --d-accent: #58a6ff;
  --d-accent-weak: rgba(88, 166, 255, 0.14);

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

  --k-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --k-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.4);
  --k-shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.55);
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
