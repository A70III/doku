/**
 * CSS ของหน้า preview (`doku render` → ไฟล์ HTML เดียว)
 *
 * ขอบเขต M0: typography + token ขั้นต่ำให้ "เปิดใน browser แล้วอ่านได้สวย"
 * ยังไม่ใช่ design system เต็ม (prose layer + block ทั้งชุดจะมาใน M2 ตาม docs/03 Part B
 * และ layout จริงจะย้ายไป packages/server/src/web/styles/ ตอน M1)
 */

export const PREVIEW_CSS = `
:root {
  --k-app-bg: #f4f7fd;
  --k-bg: #ffffff;
  --d-bg-subtle: #f6f8fa;
  --d-bg-muted: #eef2f5;
  --d-border: #d8dee6;
  --d-border-strong: #c2cbd6;
  --k-text: #1f2328;
  --d-text-muted: #656d76;
  --d-text-subtle: #8b949e;
  --d-accent: #3b7df0;
  --d-accent-weak: rgba(59, 125, 240, 0.10);
  --k-success: #1a7f37;
  --k-warning: #9a6700;
  --k-danger: #cf222e;
  --k-info: #0969da;
  --k-tip: #8250df;
  --k-quote: var(--d-text-muted);

  --d-font-sans: 'Inter', 'Noto Sans Thai', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --d-font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace;

  --d-text-sm: 0.875rem;
  --d-text-base: 1rem;
  --d-text-lg: 1.125rem;
  --d-text-xl: 1.375rem;
  --d-text-2xl: clamp(1.5rem, 1.3rem + 1vw, 1.875rem);
  --d-text-3xl: clamp(1.75rem, 1.5rem + 1.4vw, 2.25rem);
  --k-leading-body: 1.75;
  --k-measure: 68ch;

  --d-space-1: 0.25rem; --d-space-2: 0.5rem; --d-space-3: 0.75rem; --d-space-4: 1rem;
  --d-space-6: 1.5rem; --d-space-8: 2rem; --d-space-12: 3rem;
  --d-radius-sm: 0.5rem; --d-radius-md: 0.75rem; --d-radius-lg: 1rem; --d-radius-pill: 999px;
  --k-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --k-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.08);
  --d-dur: 200ms;
  --d-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
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
  --k-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.4);
}

/* per-document accent (docs/03 §1.2) — validate เป็น #rrggbb มาก่อนแล้วจาก Zod */
html[data-accent] {
  --d-accent: var(--doc-accent);
  --d-accent-weak: color-mix(in srgb, var(--doc-accent) 12%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition: none !important; }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--k-app-bg);
  color: var(--k-text);
  font-family: var(--d-font-sans);
  font-size: var(--d-text-base);
  line-height: var(--k-leading-body);
  -webkit-font-smoothing: antialiased;
}

.doku-page { padding: var(--d-space-8) var(--d-space-4); }

.doku-card {
  max-width: var(--k-measure);
  margin: 0 auto;
  background: var(--k-bg);
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-lg);
  box-shadow: var(--k-shadow-md);
  padding: clamp(1.25rem, 4vw, 3rem);
}

.doku-doc-header { margin-bottom: var(--d-space-8); }
.doku-doc-header .doku-doc-title {
  margin: 0 0 var(--d-space-2);
  font-size: var(--d-text-3xl);
  line-height: 1.25;
  text-wrap: balance;
}
.doku-doc-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--d-space-2) var(--d-space-3);
  align-items: center;
  color: var(--d-text-muted);
  font-size: var(--d-text-sm);
}
.doku-doc-path { font-family: var(--d-font-mono); color: var(--d-text-subtle); }
.doku-tag {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: var(--d-radius-pill);
  background: var(--d-accent-weak);
  color: var(--d-accent);
  font-size: 0.75rem;
}
.doku-status {
  padding: 0.1rem 0.5rem;
  border-radius: var(--d-radius-pill);
  border: 1px solid var(--d-border);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.doku-warnings {
  margin: 0 0 var(--d-space-8);
  border: 1px solid var(--d-border);
  border-left: 3px solid var(--k-warning);
  border-radius: var(--d-radius-sm);
  background: var(--d-bg-subtle);
  padding: var(--d-space-3) var(--d-space-4);
  font-size: var(--d-text-sm);
  color: var(--d-text-muted);
}
.doku-warnings ul { margin: var(--d-space-2) 0 0; padding-left: var(--d-space-4); }
.doku-warnings code { font-size: 0.8em; }

.doku-toc {
  margin: 0 0 var(--d-space-8);
  padding: var(--d-space-3) var(--d-space-4);
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-sm);
  background: var(--d-bg-subtle);
  font-size: var(--d-text-sm);
}
.doku-toc-title { font-weight: 600; color: var(--d-text-muted); }
.doku-toc ul { list-style: none; margin: var(--d-space-2) 0 0; padding: 0; }
.doku-toc li + li { margin-top: var(--d-space-1); }
.doku-toc a { color: var(--d-text-muted); text-decoration: none; }
.doku-toc a:hover { color: var(--d-accent); }
.doku-toc .doku-toc-h3 { padding-left: var(--d-space-4); }

/* ── prose layer (เนื้อหาเอกสาร — ไม่ใช้ Tailwind โดยเจตนา) ───────────────── */

.doku-prose { overflow-wrap: break-word; }
.doku-prose > * + * { margin-top: var(--d-space-4); }
.doku-prose :is(h1, h2, h3, h4, h5, h6) {
  margin: var(--d-space-8) 0 var(--d-space-3);
  line-height: 1.3;
  text-wrap: balance;
  scroll-margin-top: var(--d-space-8);
}
.doku-prose h1 { font-size: var(--d-text-3xl); }
.doku-prose h2 { font-size: var(--d-text-2xl); padding-bottom: var(--d-space-2); border-bottom: 1px solid var(--d-border); }
.doku-prose h3 { font-size: var(--d-text-xl); }
.doku-prose h4 { font-size: var(--d-text-lg); }
.doku-prose p { margin: 0; text-wrap: pretty; }
.doku-prose :lang(th) { line-height: 1.9; }
.doku-prose a { color: var(--d-accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
.doku-prose strong { font-weight: 650; }
.doku-prose mark {
  background: linear-gradient(transparent 55%, var(--d-accent-weak) 55%);
  color: inherit;
  padding: 0 0.15em;
}
.doku-prose :is(ul, ol) { padding-left: 1.5rem; }
.doku-prose li + li { margin-top: var(--d-space-1); }
.doku-prose li.task-list-item { list-style: none; margin-left: -1.5rem; }
.doku-prose blockquote {
  margin: 0;
  padding: var(--d-space-2) var(--d-space-6);
  border-left: 3px solid var(--d-border-strong);
  color: var(--d-text-muted);
}
.doku-prose hr { border: 0; border-top: 1px solid var(--d-border); margin: var(--d-space-8) 0; }
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

/* code */
.doku-prose code {
  font-family: var(--d-font-mono);
  font-size: 0.875em;
  background: var(--d-bg-subtle);
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-sm);
  padding: 0.1em 0.35em;
}
.doku-prose pre {
  margin: 0;
  padding: var(--d-space-4);
  overflow: auto;
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-md);
  background: var(--d-bg-subtle);
  font-size: var(--d-text-sm);
  line-height: 1.6;
}
.doku-prose pre code { background: none; border: 0; padding: 0; font-size: 1em; }
.doku-prose pre.shiki { background: var(--d-bg-subtle) !important; }
.doku-prose pre.shiki .line { display: inline-block; width: 100%; }

/* shiki dual theme → ใช้สีฝั่ง dark เมื่อธีมเป็น dark */
[data-theme='dark'] .doku-prose pre.shiki span { color: var(--shiki-dark) !important; }
[data-theme='dark'] .doku-prose pre.shiki { background: var(--shiki-dark-bg) !important; }
@media (prefers-color-scheme: dark) {
  [data-theme='auto'] .doku-prose pre.shiki span { color: var(--shiki-dark) !important; }
  [data-theme='auto'] .doku-prose pre.shiki { background: var(--shiki-dark-bg) !important; }
}

/* table */
.doku-prose table { border-collapse: collapse; width: 100%; font-size: var(--d-text-sm); }
.doku-prose :is(th, td) { border: 1px solid var(--d-border); padding: var(--d-space-2) var(--d-space-3); text-align: left; }
.doku-prose thead th { background: var(--d-bg-subtle); }

/* details */
.doku-prose details {
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-sm);
  padding: var(--d-space-2) var(--d-space-4);
  background: var(--d-bg-subtle);
}
.doku-prose summary { cursor: pointer; font-weight: 600; }

/* heading anchor */
.doku-anchor { margin-left: 0.35em; color: var(--d-text-subtle); text-decoration: none; opacity: 0; transition: opacity var(--d-dur) var(--d-ease); }
.doku-prose :is(h1, h2, h3, h4, h5, h6):hover .doku-anchor { opacity: 1; }
.doku-anchor:hover { color: var(--d-accent); }

/* math */
.doku-prose .katex-display { overflow-x: auto; overflow-y: hidden; padding: var(--d-space-2) 0; }

/* footer */
.doku-footer {
  max-width: var(--k-measure);
  margin: var(--d-space-6) auto 0;
  color: var(--d-text-subtle);
  font-size: 0.75rem;
  text-align: center;
  font-family: var(--d-font-mono);
}

@media print {
  body { background: #fff; }
  .doku-card { border: 0; box-shadow: none; max-width: none; padding: 0; }
  .doku-toc, .doku-warnings, .doku-footer, .doku-anchor { display: none; }
  .doku-prose a { color: inherit; text-decoration: underline; }
  .doku-prose pre, .doku-prose table { break-inside: avoid; }
}
`
