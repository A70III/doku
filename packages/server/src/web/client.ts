/**
 * client JS — serve ที่ `/static/client.js` (script-src 'self' ตาม CSP, ไม่มี inline script)
 * งานของมัน: จำ state การพับของ sidebar tree (localStorage) + live-reload ผ่าน `/sse`
 */

export const CLIENT_JS = `(() => {
  "use strict";

  const TREE_KEY = "doku.tree-state";

  // ── sidebar tree: จำ state การพับ (localStorage — ไม่แตะ vault, docs/01) ──
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(TREE_KEY) ?? "{}");
  } catch {}

  const persist = () => {
    try {
      localStorage.setItem(TREE_KEY, JSON.stringify(saved));
    } catch {}
  };

  for (const details of document.querySelectorAll("details[data-tree]")) {
    const path = details.getAttribute("data-tree");
    if (path in saved) details.open = saved[path];
    details.addEventListener("toggle", () => {
      saved[path] = details.open;
      persist();
    });
  }

  // ── live reload ผ่าน SSE (docs/01: watcher → SSE) ──
  const source = new EventSource("/sse");
  source.addEventListener("change", () => {
    // เหตุการณ์เดียวที่ client ทำคือ reload — เนื้อหาใหม่มาจาก server เสมอ
    window.location.reload();
  });
})();
`
