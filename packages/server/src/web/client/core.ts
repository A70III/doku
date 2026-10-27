import { INTERACTIONS_JS } from "@doku/core"

/**
 * client JS — tree state · ตัวกรองแผนผัง · SSE
 *
 * ⚠️ ไฟล์นี้เป็น "ข้อความ JS" (template string) ไม่ใช่โค้ดที่รันตรง ๆ:
 * ทั้งหมดถูกต่อกันใน `client/index.ts` แล้วเสิร์ฟเป็น `/static/client.js`
 * — แก้ที่นี่ได้ แต่ต้องคง syntax ของ JS ข้างในให้ถูก (มี test ตรวจ CLIENT_JS)
 */
export const CORE_JS = `(() => {
  "use strict";

${INTERACTIONS_JS}

  // ── sidebar tree: จำ state การพับ (localStorage — ไม่แตะ vault, docs/01) ──
  const TREE_KEY = "doku.tree-state";
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

  // ── ตัวกรองแผนผัง (client-side) — พิมพ์เพื่อกรองชื่อเอกสาร/โฟลเดอร์ ──
  const treeFilterEl = document.getElementById("doku-tree-filter");

  function applyTreeFilter(query) {
    const tree = document.querySelector(".doku-tree");
    if (!tree) return;
    const needle = query.trim().toLowerCase();
    for (const row of tree.querySelectorAll("li.doku-row")) row.hidden = false;

    if (!needle) {
      // คืนสถานะพับ/เปิดเดิมของผู้ใช้
      for (const details of tree.querySelectorAll("details[data-tree]")) {
        const path = details.getAttribute("data-tree");
        details.open = path in saved ? saved[path] : details.open;
      }
      return;
    }

    for (const details of tree.querySelectorAll("details[data-tree]")) details.open = true;

    // เอกสาร: เหลือเฉพาะที่ชื่อหรือ path ตรง
    for (const row of tree.querySelectorAll("li.doku-row[data-doc-id]")) {
      const label = ((row.getAttribute("data-doc-id") || "") + " " + (row.textContent || "")).toLowerCase();
      row.hidden = label.indexOf(needle) === -1;
    }

    // โฟลเดอร์: ซ่อนเมื่อตัวเองไม่ตรงและไม่มีลูกที่เห็น (ไล่จากลึกไปตื้น)
    const folders = Array.from(tree.querySelectorAll("li.doku-row-folder")).reverse();
    for (const folder of folders) {
      const summary = folder.querySelector(":scope > details > summary");
      const own = ((summary && summary.textContent) || "").toLowerCase().indexOf(needle) !== -1;
      if (own) {
        for (const row of folder.querySelectorAll("li.doku-row")) row.hidden = false;
      }
      const visibleChild = !!folder.querySelector("li.doku-row:not([hidden])");
      folder.hidden = !(own || visibleChild);
    }
  }

  if (treeFilterEl) {
    treeFilterEl.addEventListener("input", () => applyTreeFilter(treeFilterEl.value));
    treeFilterEl.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && treeFilterEl.value) {
        event.stopPropagation();
        treeFilterEl.value = "";
        applyTreeFilter("");
        treeFilterEl.blur();
      }
    });
  }

  // เอกสารที่เปิดอยู่ถูกซ่อนในโฟลเดอร์ที่พับ → เปิดให้เห็น (ถ้าผู้ใช้เห็นอยู่แล้วไม่แตะ)
  const activeRow = document.querySelector(".doku-row-link.is-active");
  if (activeRow) {
    if (activeRow.offsetParent === null) {
      let node = activeRow.parentElement;
      while (node) {
        if (node.tagName === "DETAILS") {
          node.open = true;
          const path = node.getAttribute("data-tree");
          if (path) saved[path] = true;
        }
        node = node.parentElement;
      }
      persist();
    }
    if (activeRow.scrollIntoView) activeRow.scrollIntoView({ block: "nearest" });
  }

  // ── live reload ผ่าน SSE (docs/01: watcher → SSE) ──
  // ระหว่างแก้ไข (data-editing) ห้าม reload — จะทับงานที่ยังไม่บันทึก
  const source = new EventSource("/sse");
  source.addEventListener("change", () => {
    if (document.documentElement.hasAttribute("data-editing")) return;
    window.location.reload();
  });
})();

/* ══ M3 chrome: actions / palette / editor / trash ══════════════════════ */
(() => {
  "use strict";

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const docEl = document.documentElement;
  const menuEl = $("#doku-menu");
  const paletteEl = $("#doku-palette");
  const paletteInput = $("#doku-palette-input");
  const paletteList = $("#doku-palette-list");
  const toastEl = $("#doku-toast");
  const metaPanel = $("#doku-meta-panel");
  const metaForm = $("#doku-meta-form");
  const metaStatus = $("#doku-meta-status");
  const folderOverlay = $("#doku-folder-overlay");
  const folderForm = $("#doku-folder-form");
  const folderStatus = $("#doku-folder-status");
  const articleEl = $("article[data-doc-id]");
  const bodyEl = $("#doku-doc-body");
  const embeddedEl = $("#doku-doc-md");
  const docStatusEl = $("#doku-doc-status");
  const tocSheetEl = $("#doku-toc-sheet");
  const askEl = $("#doku-ask");
  const askForm = $("#doku-ask-form");
  const askInput = $("#doku-ask-input");
  const askTitle = $("#doku-ask-title");
  const askHint = $("#doku-ask-hint");
  const askLabel = $("#doku-ask-label");
  const askSubmit = $("#doku-ask-submit");
  const keysEl = $("#doku-keys");
  const toTopEl = $(".doku-to-top");

`
