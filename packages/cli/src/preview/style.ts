/**
 * CSS ของหน้า preview (`kairn render` → ไฟล์ HTML เดียว)
 *
 * ขอบเขต M0: typography + token ขั้นต่ำให้ "เปิดใน browser แล้วอ่านได้สวย"
 * ยังไม่ใช่ design system เต็ม (prose layer + block ทั้งชุดจะมาใน M2 ตาม docs/03 Part B
 * และ layout จริงจะย้ายไป packages/server/src/web/styles/ ตอน M1)
 */

export const PREVIEW_CSS = `
:root {
  --k-app-bg: #f4f7fd;
  --k-bg: #ffffff;
  --k-bg-subtle: #f6f8fa;
  --k-bg-muted: #eef2f5;
  --k-border: #d8dee6;
  --k-border-strong: #c2cbd6;
  --k-text: #1f2328;
  --k-text-muted: #656d76;
  --k-text-subtle: #8b949e;
  --k-accent: #3b7df0;
  --k-accent-weak: rgba(59, 125, 240, 0.10);
  --k-success: #1a7f37;
  --k-warning: #9a6700;
  --k-danger: #cf222e;
  --k-info: #0969da;
  --k-tip: #8250df;
  --k-quote: var(--k-text-muted);

  --k-font-sans: 'Inter', 'Noto Sans Thai', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --k-font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace;

  --k-text-sm: 0.875rem;
  --k-text-base: 1rem;
  --k-text-lg: 1.125rem;
  --k-text-xl: 1.375rem;
  --k-text-2xl: clamp(1.5rem, 1.3rem + 1vw, 1.875rem);
  --k-text-3xl: clamp(1.75rem, 1.5rem + 1.4vw, 2.25rem);
  --k-leading-body: 1.75;
  --k-measure: 68ch;

  --k-space-1: 0.25rem; --k-space-2: 0.5rem; --k-space-3: 0.75rem; --k-space-4: 1rem;
  --k-space-6: 1.5rem; --k-space-8: 2rem; --k-space-12: 3rem;
  --k-radius-sm: 0.5rem; --k-radius-md: 0.75rem; --k-radius-lg: 1rem; --k-radius-pill: 999px;
  --k-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --k-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.08);
  --k-dur: 200ms;
  --k-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}

[data-theme='dark'] {
  --k-app-bg: #0a0d12;
  --k-bg: #0d1117;
  --k-bg-subtle: #161b22;
  --k-bg-muted: #21262d;
  --k-border: #30363d;
  --k-border-strong: #484f58;
  --k-text: #e6edf3;
  --k-text-muted: #8b949e;
  --k-text-subtle: #6e7681;
  --k-accent: #58a6ff;
  --k-accent-weak: rgba(88, 166, 255, 0.14);
  --k-success: #3fb950;
  --k-warning: #d2991d;
  --k-danger: #f85149;
  --k-info: #58a6ff;
  --k-tip: #bc8cff;
  --k-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.4);
}

/* per-document accent (docs/03 §1.2) — validate เป็น #rrggbb มาก่อนแล้วจาก Zod */
html[data-accent] {
  --k-accent: var(--doc-accent);
  --k-accent-weak: color-mix(in srgb, var(--doc-accent) 12%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--k-app-bg);
  color: var(--k-text);
  font-family: var(--k-font-sans);
  font-size: var(--k-text-base);
  line-height: var(--k-leading-body);
  -webkit-font-smoothing: antialiased;
}

.kairn-page { padding: var(--k-space-8) var(--k-space-4); }

.kairn-card {
  max-width: var(--k-measure);
  margin: 0 auto;
  background: var(--k-bg);
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius-lg);
  box-shadow: var(--k-shadow-md);
  padding: clamp(1.25rem, 4vw, 3rem);
}

.kairn-doc-header { margin-bottom: var(--k-space-8); }
.kairn-doc-header .kairn-doc-title {
  margin: 0 0 var(--k-space-2);
  font-size: var(--k-text-3xl);
  line-height: 1.25;
  text-wrap: balance;
}
.kairn-doc-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--k-space-2) var(--k-space-3);
  align-items: center;
  color: var(--k-text-muted);
  font-size: var(--k-text-sm);
}
.kairn-doc-path { font-family: var(--k-font-mono); color: var(--k-text-subtle); }
.kairn-tag {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: var(--k-radius-pill);
  background: var(--k-accent-weak);
  color: var(--k-accent);
  font-size: 0.75rem;
}
.kairn-status {
  padding: 0.1rem 0.5rem;
  border-radius: var(--k-radius-pill);
  border: 1px solid var(--k-border);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.kairn-warnings {
  margin: 0 0 var(--k-space-8);
  border: 1px solid var(--k-border);
  border-left: 3px solid var(--k-warning);
  border-radius: var(--k-radius-sm);
  background: var(--k-bg-subtle);
  padding: var(--k-space-3) var(--k-space-4);
  font-size: var(--k-text-sm);
  color: var(--k-text-muted);
}
.kairn-warnings ul { margin: var(--k-space-2) 0 0; padding-left: var(--k-space-4); }
.kairn-warnings code { font-size: 0.8em; }

.kairn-toc {
  margin: 0 0 var(--k-space-8);
  padding: var(--k-space-3) var(--k-space-4);
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius-sm);
  background: var(--k-bg-subtle);
  font-size: var(--k-text-sm);
}
.kairn-toc-title { font-weight: 600; color: var(--k-text-muted); }
.kairn-toc ul { list-style: none; margin: var(--k-space-2) 0 0; padding: 0; }
.kairn-toc li + li { margin-top: var(--k-space-1); }
.kairn-toc a { color: var(--k-text-muted); text-decoration: none; }
.kairn-toc a:hover { color: var(--k-accent); }
.kairn-toc .kairn-toc-h3 { padding-left: var(--k-space-4); }

/* ── prose layer (เนื้อหาเอกสาร — ไม่ใช้ Tailwind โดยเจตนา) ───────────────── */

.kairn-prose { overflow-wrap: break-word; }
.kairn-prose > * + * { margin-top: var(--k-space-4); }
.kairn-prose :is(h1, h2, h3, h4, h5, h6) {
  margin: var(--k-space-8) 0 var(--k-space-3);
  line-height: 1.3;
  text-wrap: balance;
  scroll-margin-top: var(--k-space-8);
}
.kairn-prose h1 { font-size: var(--k-text-3xl); }
.kairn-prose h2 { font-size: var(--k-text-2xl); padding-bottom: var(--k-space-2); border-bottom: 1px solid var(--k-border); }
.kairn-prose h3 { font-size: var(--k-text-xl); }
.kairn-prose h4 { font-size: var(--k-text-lg); }
.kairn-prose p { margin: 0; text-wrap: pretty; }
.kairn-prose :lang(th) { line-height: 1.9; }
.kairn-prose a { color: var(--k-accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
.kairn-prose strong { font-weight: 650; }
.kairn-prose mark {
  background: linear-gradient(transparent 55%, var(--k-accent-weak) 55%);
  color: inherit;
  padding: 0 0.15em;
}
.kairn-prose :is(ul, ol) { padding-left: 1.5rem; }
.kairn-prose li + li { margin-top: var(--k-space-1); }
.kairn-prose li.task-list-item { list-style: none; margin-left: -1.5rem; }
.kairn-prose blockquote {
  margin: 0;
  padding: var(--k-space-2) var(--k-space-6);
  border-left: 3px solid var(--k-border-strong);
  color: var(--k-text-muted);
}
.kairn-prose hr { border: 0; border-top: 1px solid var(--k-border); margin: var(--k-space-8) 0; }
.kairn-prose img { max-width: 100%; height: auto; border-radius: var(--k-radius-sm); }
.kairn-prose kbd {
  font-family: var(--k-font-mono);
  font-size: 0.8em;
  padding: 0.1em 0.4em;
  border: 1px solid var(--k-border-strong);
  border-bottom-width: 2px;
  border-radius: var(--k-radius-sm);
  background: var(--k-bg-subtle);
}

/* code */
.kairn-prose code {
  font-family: var(--k-font-mono);
  font-size: 0.875em;
  background: var(--k-bg-subtle);
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius-sm);
  padding: 0.1em 0.35em;
}
.kairn-prose pre {
  margin: 0;
  padding: var(--k-space-4);
  overflow: auto;
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius-md);
  background: var(--k-bg-subtle);
  font-size: var(--k-text-sm);
  line-height: 1.6;
}
.kairn-prose pre code { background: none; border: 0; padding: 0; font-size: 1em; }
.kairn-prose pre.shiki { background: var(--k-bg-subtle) !important; }
.kairn-prose pre.shiki .line { display: inline-block; width: 100%; }

/* shiki dual theme → ใช้สีฝั่ง dark เมื่อธีมเป็น dark */
[data-theme='dark'] .kairn-prose pre.shiki span { color: var(--shiki-dark) !important; }
[data-theme='dark'] .kairn-prose pre.shiki { background: var(--shiki-dark-bg) !important; }
@media (prefers-color-scheme: dark) {
  [data-theme='auto'] .kairn-prose pre.shiki span { color: var(--shiki-dark) !important; }
  [data-theme='auto'] .kairn-prose pre.shiki { background: var(--shiki-dark-bg) !important; }
}

/* table */
.kairn-prose table { border-collapse: collapse; width: 100%; font-size: var(--k-text-sm); }
.kairn-prose :is(th, td) { border: 1px solid var(--k-border); padding: var(--k-space-2) var(--k-space-3); text-align: left; }
.kairn-prose thead th { background: var(--k-bg-subtle); }

/* details */
.kairn-prose details {
  border: 1px solid var(--k-border);
  border-radius: var(--k-radius-sm);
  padding: var(--k-space-2) var(--k-space-4);
  background: var(--k-bg-subtle);
}
.kairn-prose summary { cursor: pointer; font-weight: 600; }

/* heading anchor */
.kairn-anchor { margin-left: 0.35em; color: var(--k-text-subtle); text-decoration: none; opacity: 0; transition: opacity var(--k-dur) var(--k-ease); }
.kairn-prose :is(h1, h2, h3, h4, h5, h6):hover .kairn-anchor { opacity: 1; }
.kairn-anchor:hover { color: var(--k-accent); }

/* math */
.kairn-prose .katex-display { overflow-x: auto; overflow-y: hidden; padding: var(--k-space-2) 0; }

/* footer */
.kairn-footer {
  max-width: var(--k-measure);
  margin: var(--k-space-6) auto 0;
  color: var(--k-text-subtle);
  font-size: 0.75rem;
  text-align: center;
  font-family: var(--k-font-mono);
}

@media print {
  body { background: #fff; }
  .kairn-card { border: 0; box-shadow: none; max-width: none; padding: 0; }
  .kairn-toc, .kairn-warnings, .kairn-footer, .kairn-anchor { display: none; }
  .kairn-prose a { color: inherit; text-decoration: underline; }
  .kairn-prose pre, .kairn-prose table { break-inside: avoid; }
}
`
