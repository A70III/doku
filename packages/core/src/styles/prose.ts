/**
 * Prose layer `.doku-prose` + doc chrome ของเนื้อหา (docs/03 Part B §2/§7/§8)
 *
 * เนื้อหาเอกสารใช้ layer นี้ — **ห้ามใช้ Tailwind กับ content block** (hard invariant)
 */

export const PROSE_CSS = `
* { box-sizing: border-box; }

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
.doku-toc a[aria-current='true'] { color: var(--d-accent); font-weight: 600; }
.doku-toc .doku-toc-h3 { padding-left: var(--d-space-4); }

/* ── prose ───────────────────────────────────────────────────────────────── */

.doku-prose { overflow-wrap: break-word; }
.doku-prose > * + * { margin-top: var(--d-space-4); }
.doku-prose :is(h1, h2, h3, h4, h5, h6) {
  margin: var(--d-space-8) 0 var(--d-space-3);
  line-height: 1.3;
  text-wrap: balance;
  scroll-margin-top: var(--d-space-8);
}
.doku-prose > :is(h1, h2, h3, h4, h5, h6):first-child { margin-top: 0; }
.doku-prose h1 { font-size: var(--d-text-3xl); }
.doku-prose h2 { font-size: var(--d-text-2xl); padding-bottom: var(--d-space-2); border-bottom: 1px solid var(--d-border); }
.doku-prose h3 { font-size: var(--d-text-xl); }
.doku-prose h4 { font-size: var(--d-text-lg); }
.doku-prose p { margin: 0; text-wrap: pretty; }
.doku-prose :lang(th) { line-height: 1.9; }
.doku-prose a { color: var(--d-accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
.doku-prose strong { font-weight: 650; }
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

/* highlight (==…==) — brush underline ตาม docs/08 ข้อ 6 */
.doku-prose [data-block='mark'] {
  color: inherit;
  padding: 0 0.1em;
  background-image: linear-gradient(
    transparent 58%,
    var(--dk-mapped-bg, var(--d-accent-weak)) 58%
  );
  background-repeat: no-repeat;
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

[data-theme='dark'] .doku-prose pre.shiki span { color: var(--shiki-dark) !important; }
[data-theme='dark'] .doku-prose pre.shiki { background: var(--shiki-dark-bg) !important; }
@media (prefers-color-scheme: dark) {
  [data-theme='auto'] .doku-prose pre.shiki span { color: var(--shiki-dark) !important; }
  [data-theme='auto'] .doku-prose pre.shiki { background: var(--shiki-dark-bg) !important; }
}

/* code: copy button ถูกเพิ่มโดย client JS (หลัง sanitize) */
.doku-prose pre { position: relative; }
[data-part='copy-code'] {
  position: absolute;
  inset-block-start: var(--d-space-2);
  inset-inline-end: var(--d-space-2);
  border: 1px solid var(--d-border);
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

/* table */
.doku-prose table { border-collapse: collapse; width: 100%; font-size: var(--d-text-sm); }
.doku-prose :is(th, td) { border: 1px solid var(--d-border); padding: var(--d-space-2) var(--d-space-3); text-align: left; }
.doku-prose thead th { background: var(--d-bg-subtle); }

/* heading anchor */
.doku-anchor {
  margin-left: 0.35em;
  color: var(--d-text-subtle);
  text-decoration: none;
  opacity: 0;
  transition: opacity var(--d-dur) var(--d-ease);
}
.doku-prose :is(h1, h2, h3, h4, h5, h6):hover .doku-anchor,
.doku-anchor:focus-visible { opacity: 1; }
.doku-anchor:hover { color: var(--d-accent); }

/* math */
.doku-prose .katex-display { overflow-x: auto; overflow-y: hidden; padding: var(--d-space-2) 0; }

/* ── reading UX (progress bar / zoom overlay) ────────────────────────────── */

.doku-progress {
  position: fixed;
  inset-block-start: 0;
  inset-inline: 0;
  height: 3px;
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
