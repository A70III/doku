/**
 * client JS ของเว็บแอป — serve ที่ `/static/client.js` (script-src 'self' ตาม CSP)
 *
 * ประกอบจาก:
 * - `INTERACTIONS_JS` จาก `@doku/core` — reading UX ของ block (progress/TOC/motion/tabs/zoom/copy)
 *   ตัวเดียวกับที่ CLI preview ใช้ (ไม่ให้ logic ซ้ำ)
 * - ส่วนของ server (M3): sidebar tree + drag-drop · REST actions (new/rename/move/delete/meta)
 *   · trash · revisions · CodeMirror editor + live preview · command palette · zen mode · theme
 *
 * ทุกอย่างเป็น progressive enhancement — ปิด JS แล้วยังอ่านและนำทางได้
 */

import { INTERACTIONS_JS } from "@doku/core"

export const CLIENT_JS = `(() => {
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

  // ── live reload ผ่าน SSE (docs/01: watcher → SSE) ──
  // one surface (docs/08 ข้อ 65): "แก้ไขอยู่" ตลอดเวลา → guard ที่ถูกคือ data-dirty
  // (มีงานค้างจริงเท่านั้น) · echo ของ autosave ตัวเองกันด้วย event "doku:saved"
  let suppressReloadUntil = 0;
  window.addEventListener("doku:saved", () => {
    suppressReloadUntil = Date.now() + 1500;
  });

  /** ควร reload ตาม SSE ไหม — pure function ให้เทสต์ได้ตรง ๆ (docs/09 §8) */
  function shouldReloadOnChange(dirty, suppressUntil, now) {
    if (dirty) return false;
    return !(suppressUntil > 0 && now < suppressUntil);
  }

  const source = new EventSource("/sse");
  source.addEventListener("change", () => {
    const dirty = document.documentElement.hasAttribute("data-dirty");
    if (!shouldReloadOnChange(dirty, suppressReloadUntil, Date.now())) return;
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

  /* ── helpers ─────────────────────────────────────────────────────────── */

  let toastTimer = 0;
  function toast(message, kind) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.setAttribute("data-kind", kind || "info");
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, kind === "error" ? 6000 : 3000);
  }

  const encodePath = (path) =>
    path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

  async function api(path, options) {
    const response = await fetch(path, options);
    let body = null;
    try {
      body = await response.json();
    } catch {}
    if (!response.ok) {
      const error = new Error((body && body.error && body.error.message) || "HTTP " + response.status);
      error.status = response.status;
      error.code = body && body.error ? body.error.code : undefined;
      error.fields = body && body.error ? body.error.fields : undefined;
      const etag = response.headers.get("etag");
      if (etag) error.etag = etag.replace(/"/g, "");
      throw error;
    }
    return body;
  }

  function jsonRequest(method, path, payload, headers) {
    const merged = Object.assign({ "content-type": "application/json" }, headers || {});
    return api(path, { method, headers: merged, body: JSON.stringify(payload) });
  }

  function fail(error) {
    const fields = error.fields && error.fields.length ? " (" + error.fields.join(", ") + ")" : "";
    toast(error.message + fields, "error");
  }

  function basename(path) {
    const index = path.lastIndexOf("/");
    return index === -1 ? path : path.slice(index + 1);
  }

  function dirname(path) {
    const index = path.lastIndexOf("/");
    return index === -1 ? "" : path.slice(0, index);
  }

  function joinPath(dir, name) {
    return dir ? dir + "/" + name : name;
  }

  function currentDocPath() {
    const article = $("article[data-doc-id]");
    return article ? article.getAttribute("data-doc-id") : null;
  }

  function reload() {
    window.location.reload();
  }

  /* ── theme + zen ─────────────────────────────────────────────────────── */

  const THEME_KEY = "doku.theme";
  const ZEN_KEY = "doku.zen";
  const THEMES = ["auto", "light", "dark"];

  function setTheme(mode) {
    docEl.setAttribute("data-theme", mode);
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch {}
  }

  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored && docEl.getAttribute("data-theme") === "auto" && THEMES.indexOf(stored) !== -1) {
      docEl.setAttribute("data-theme", stored);
    }
    if (localStorage.getItem(ZEN_KEY) === "1") docEl.setAttribute("data-zen", "");
  } catch {}

  function cycleTheme() {
    const current = docEl.getAttribute("data-theme") || "auto";
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    setTheme(next);
    toast("ธีม: " + next);
  }

  function toggleZen() {
    const on = docEl.toggleAttribute("data-zen");
    try {
      localStorage.setItem(ZEN_KEY, on ? "1" : "0");
    } catch {}
  }

  /* ── menu ────────────────────────────────────────────────────────────── */

  function closeMenu() {
    if (menuEl) menuEl.hidden = true;
  }

  function openMenu(anchor, header, items) {
    if (!menuEl) return;
    menuEl.textContent = "";
    if (header) {
      const head = document.createElement("div");
      head.className = "doku-menu-head";
      head.textContent = header;
      menuEl.appendChild(head);
    }
    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement("div");
        sep.className = "doku-menu-sep";
        menuEl.appendChild(sep);
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      if (item.danger) button.setAttribute("data-danger", "1");
      if (item.icon) {
        const span = document.createElement("span");
        span.className = "doku-menu-icon";
        button.appendChild(span);
      }
      button.appendChild(document.createTextNode(item.label));
      button.addEventListener("click", () => {
        closeMenu();
        item.run();
      });
      menuEl.appendChild(button);
    }
    menuEl.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const width = menuEl.offsetWidth;
    const left = Math.max(8, Math.min(rect.left + window.scrollX, window.innerWidth - width - 8));
    menuEl.style.left = left + "px";
    menuEl.style.top = rect.bottom + window.scrollY + 4 + "px";
  }

  document.addEventListener("click", (event) => {
    if (menuEl && !menuEl.hidden && !menuEl.contains(event.target)) closeMenu();
    // ── flush ก่อน navigate (docs/08 ข้อ 65) ──────────────────────────────
    // one surface: ไม่มี "โหมดเขียน" ให้ออก — เหลือแค่ "มีงานค้างไหม"
    // ถ้ามีงานค้าง (autosave ยังไม่ยิง) แล้วผู้ใช้คลิก "ลิงก์ไปหน้าอื่น" ใน chrome
    // ต้อง flush ให้จบก่อน — ห้ามปล่อย default navigation (fetch จะถูกยกเลิก)
    //   · modifier/middle-click → ปล่อยเบราว์เซอร์ (แท็บใหม่) ไม่ต้อง flush
    //   · anchor ภายในหน้า (#…) → ไม่ navigate หน้าใหม่ ไม่ต้อง flush
    if (!writing.dirty || !writing.path) return;
    const link = event.target.closest ? event.target.closest("a[href]") : null;
    if (!link || link.hasAttribute("download")) return;
    const href = link.getAttribute("href") || "";
    if (href.charAt(0) === "#") return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    // ลิงก์ไปเอกสารอื่น ๆ ของ doku เอง — flush เองก่อนค่อยไป
    event.preventDefault();
    void (async () => {
      await flushForNavigation();
      window.location.href = link.href;
    })();
  });

  // คลิกลิงก์เอกสารที่กำลังเปิดอยู่ = อยู่หน้าเดิม — ไม่ reload
  // (กรณีมีงานค้าง จัดการ flush ไปแล้วใน handler ด้านบน)
  document.addEventListener("click", (event) => {
    const link = event.target.closest ? event.target.closest("a[data-doc-link]") : null;
    if (!link) return;
    // modifier/middle-click → ปล่อยเบราว์เซอร์ (เปิดแท็บใหม่)
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    let sameDoc = false;
    try {
      sameDoc = new URL(link.href).pathname === window.location.pathname;
    } catch {}
    if (sameDoc && window.location.pathname.indexOf("/d/") === 0) event.preventDefault();
  });
  window.addEventListener("resize", closeMenu);

  /* ── doc / folder actions ────────────────────────────────────────────── */

  async function newDoc(dir) {
    const suggestion = dir ? dir + "/" : "";
    const input = window.prompt("path ของเอกสารใหม่ (relative จาก vault, ไม่ต้องมี .md)", suggestion);
    if (!input) return;
    const path = input.trim().replace(/^\\.?\\//, "").replace(/\\.md$/, "");
    if (!path) return;
    try {
      await jsonRequest("POST", "/api/docs/" + encodePath(path), { md: "# " + basename(path) + "\\n\\n" });
      window.location.href = "/d/" + encodePath(path);
    } catch (error) {
      fail(error);
    }
  }

  async function newFolder(dir) {
    const suggestion = dir ? dir + "/" : "";
    const input = window.prompt("path ของโฟลเดอร์ใหม่", suggestion);
    if (!input) return;
    const path = input.trim();
    if (!path) return;
    try {
      await jsonRequest("POST", "/api/folders/" + encodePath(path), {});
      reload();
    } catch (error) {
      fail(error);
    }
  }

  async function moveDoc(id, presetTarget) {
    const target = presetTarget || window.prompt("ย้ายไปที่ (path ใหม่)", id);
    if (!target || target === id) return;
    try {
      await jsonRequest("POST", "/api/docs/" + encodePath(id) + "/move", { to: target.trim() });
      toast("ย้ายแล้ว: " + target);
      reload();
    } catch (error) {
      fail(error);
    }
  }

  async function renameDoc(id) {
    // เปลี่ยนชื่อ = inline editor ใน sidebar (แทน prompt — UX อยู่ในแถวเดิม)
    const row = $('[data-doc-id="' + CSS.escape(id) + '"]');
    const label = row ? row.querySelector("a[data-doc-link]") : null;
    if (label) startInlineRename("doc", id, label);
  }

  /** inline rename ในแถว sidebar — คอร์เดียวทั้งเอกสาร/โฟลเดอร์ (แทนการ prompt)
   *  · doc: แทนที่ <a> ทั้งก้อนด้วย wrapper ที่คง class เดิม (doku-row-link is-active)
   *    เพราะ input ในลิงก์โดน default action ของ <a> — และ layout ของ <li> ไม่เลื่อน
   *  · folder: แทนที่ข้อความ label ใน summary (เก็บ icon/ปุ่มอื่น) — ป้องกัน summary
   *    toggle ตอนคลิก/พิมพ์ด้วย preventDefault+stopPropagation ระหว่างโหมดแก้
   *  Enter/blur = commit · Esc = คืน DOM เดิม · ว่าง/ชื่อเดิม = ยกเลิกเฉย ๆ
   *  มี # = ห้าม (ข้อ 56) toast + ค้างโหมดแก้ · API error = fail() + ค้างโหมดแก้ */
  function startInlineRename(kind, path, labelEl) {
    if (!labelEl || labelEl.getAttribute("data-renaming") === "1") return;
    const initial = basename(path);
    const input = document.createElement("input");
    input.type = "text";
    input.className = "doku-rename-input";
    input.value = initial;
    input.draggable = false; // อยู่ใน <li draggable> — เลือกข้อความได้ปกติ ไม่ลากแถว
    input.setAttribute("aria-label", kind === "doc" ? "เปลี่ยนชื่อเอกสาร" : "เปลี่ยนชื่อโฟลเดอร์");

    // wrapper คง class เดิมของ label + ตัวระบุโหมดแก้ — input กว้างเต็มช่อง label เหมือนเดิม
    const wrapper = document.createElement("span");
    wrapper.className = labelEl.className + " doku-rename-label";
    wrapper.setAttribute("data-renaming", "1");
    wrapper.appendChild(input);
    labelEl.replaceWith(wrapper);
    input.select();

    let done = false;
    let committing = false;
    const restore = () => {
      done = true;
      wrapper.replaceWith(labelEl); // Esc/cancel — คืน DOM เดิมทั้งก้อน
    };
    const commit = () => {
      if (done || committing) return;
      const name = input.value.trim();
      if (!name || name === initial) {
        restore(); // ว่าง/ตรงชื่อเดิม = ยกเลิกเฉย ๆ
        return;
      }
      if (name.indexOf("#") !== -1) {
        // ห้าม # ในชื่อไฟล์ (docs/08 ข้อ 56) — ค้างโหมดแก้ให้แก้ต่อ
        toast("ห้ามใช้ # ในชื่อไฟล์", "error");
        input.select();
        return;
      }
      // เรียก move (มัน reload หน้าเองเมื่อสำเร็จ — tree order/active เปลี่ยน)
      // error จาก API (เช่น 409 ชื่อซ้ำ) = moveDoc/moveFolder fail() เอง → คงโหมดแก้
      committing = true;
      const target = joinPath(dirname(path), name);
      const moved = kind === "doc" ? moveDoc(path, target) : moveFolder(path, target);
      moved.then(() => {}, () => {}).then(() => {
        committing = false;
      });
    };
    input.addEventListener("keydown", (event) => {
      event.stopPropagation(); // กัน global keydown (palette/Esc ปิดอย่างอื่น) ขณะแก้
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        restore();
      }
    });
    input.addEventListener("blur", () => commit());
    // input อยู่ใน <summary> — คลิกต้องไม่ toggle ระหว่างโหมดแก้
    input.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  }

  async function deleteDoc(id) {
    if (!window.confirm("ย้าย \\"" + id + "\\" ไป trash? (กู้คืนได้)")) return;
    try {
      await api("/api/docs/" + encodePath(id), { method: "DELETE" });
      toast("ย้ายไป trash แล้ว");
      reload();
    } catch (error) {
      fail(error);
    }
  }

  async function moveFolder(path, presetTarget) {
    const target = presetTarget || window.prompt("ย้ายโฟลเดอร์ไปที่", path);
    if (!target || target === path) return;
    try {
      await jsonRequest("POST", "/api/folders/" + encodePath(path) + "/move", { to: target.trim() });
      toast("ย้ายแล้ว: " + target);
      reload();
    } catch (error) {
      fail(error);
    }
  }

  async function deleteFolder(path) {
    if (!window.confirm("ย้ายโฟลเดอร์ \\"" + path + "\\" ไป trash?")) return;
    try {
      await api("/api/folders/" + encodePath(path), { method: "DELETE" });
      toast("ย้ายไป trash แล้ว");
      reload();
    } catch (error) {
      if (error.code === "folder_not_empty") {
        if (!window.confirm("โฟลเดอร์ไม่ว่าง — ย้ายทั้งโฟลเดอร์ (รวมเนื้อหาข้างใน) ไป trash?")) return;
        try {
          await api("/api/folders/" + encodePath(path) + "?recursive=true", { method: "DELETE" });
          toast("ย้ายไป trash แล้ว");
          reload();
        } catch (recursiveError) {
          fail(recursiveError);
        }
        return;
      }
      fail(error);
    }
  }

  function copyDocLink(id) {
    const url = window.location.origin + "/d/" + encodePath(id);
    navigator.clipboard.writeText(url).then(
      () => toast("คัดลอกลิงก์แล้ว"),
      () => toast("คัดลอกไม่สำเร็จ", "error"),
    );
  }

  /* ── meta form ───────────────────────────────────────────────────────── */

  let metaPath = null;
  let metaEtag = null;

  async function openMeta(id) {
    try {
      const doc = await api("/api/docs/" + encodePath(id));
      metaPath = id;
      metaEtag = doc.etag;
      const meta = doc.meta || {};
      metaForm.elements.title.value = meta.title || "";
      metaForm.elements.summary.value = meta.summary || "";
      metaForm.elements.tags.value = (meta.tags || []).join(", ");
      metaForm.elements.status.value = meta.status || "active";
      metaForm.elements.order.value = meta.order === undefined ? "" : meta.order;
      metaForm.elements.mode.value = meta.theme && meta.theme.mode ? meta.theme.mode : "";
      const render = meta.render || {};
      metaForm.elements.toc.checked = render.toc !== false;
      metaForm.elements.pinned.checked = Boolean(meta.pinned);
      metaStatus.textContent = "";
      if (metaPanel) {
        metaPanel.hidden = false;
        metaPanel.scrollIntoView({ block: "nearest" });
      }
      metaForm.elements.title.focus();
    } catch (error) {
      fail(error);
    }
  }

  if (metaForm) {
    metaForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!metaPath) return;
      const form = metaForm.elements;
      const patch = {};
      const title = form.title.value.trim();
      if (title) patch.title = title;
      patch.summary = form.summary.value.trim();
      const tags = form.tags.value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      patch.tags = tags;
      patch.status = form.status.value;
      patch.pinned = form.pinned.checked;
      const order = form.order.value.trim();
      if (order !== "") patch.order = Number(order);
      const mode = form.mode.value;
      patch.theme = mode ? { mode } : {};
      patch.render = { toc: form.toc.checked };
      const clean = {};
      for (const key of Object.keys(patch)) {
        if (patch[key] !== undefined) clean[key] = patch[key];
      }
      try {
        const result = await jsonRequest("PATCH", "/api/docs/" + encodePath(metaPath), { meta: clean }, {
          "if-match": '"' + metaEtag + '"',
        });
        metaEtag = result.etag;
        metaStatus.textContent = "บันทึกแล้ว";
        toast("บันทึกคุณสมบัติแล้ว", "ok");
        setTimeout(reload, 350);
      } catch (error) {
        if (error.status === 409) {
          metaStatus.textContent = "ถูกแก้จากที่อื่น — ปิดแล้วลองใหม่";
        } else if (error.fields) {
          metaStatus.textContent = "ไม่ผ่าน schema: " + error.fields.join(", ");
        } else {
          metaStatus.textContent = error.message;
        }
        fail(error);
      }
    });
  }

  /* ── folder form ─────────────────────────────────────────────────────── */

  let folderPath = null;

  function openFolderSettings(path) {
    const row = $('[data-folder-path="' + CSS.escape(path) + '"]');
    folderPath = path;
    folderForm.elements.title.value = (row && row.getAttribute("data-folder-title")) || "";
    folderForm.elements.icon.value = (row && row.getAttribute("data-folder-icon")) || "";
    folderForm.elements.color.value = (row && row.getAttribute("data-folder-color")) || "";
    folderForm.elements.order.value = (row && row.getAttribute("data-folder-order")) || "";
    folderStatus.textContent = "";
    folderOverlay.hidden = false;
    folderForm.elements.title.focus();
  }

  if (folderForm) {
    folderForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!folderPath) return;
      const form = folderForm.elements;
      const patch = {};
      const title = form.title.value.trim();
      if (title) patch.title = title;
      const icon = form.icon.value;
      if (icon) patch.icon = icon;
      const color = form.color.value.trim();
      if (color) patch.color = color;
      const order = form.order.value.trim();
      if (order !== "") patch.order = Number(order);
      try {
        await jsonRequest("PATCH", "/api/folders/" + encodePath(folderPath), patch);
        folderStatus.textContent = "บันทึกแล้ว";
        toast("บันทึกโฟลเดอร์แล้ว", "ok");
        setTimeout(reload, 300);
      } catch (error) {
        folderStatus.textContent = error.fields ? error.fields.join(", ") : error.message;
        fail(error);
      }
    });
  }

  /* ── revisions ───────────────────────────────────────────────────────── */

  async function openHistory(id, anchor) {
    try {
      const result = await api("/api/revisions/" + encodePath(id));
      const items = [{ label: "เก็บ revision ของสถานะปัจจุบัน", run: () => api("/api/revisions/" + encodePath(id), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).then(reload, fail) }];
      if (!result.items.length) {
        items.length = 0;
        toast("ยังไม่มี revision ของเอกสารนี้");
        return;
      }
      for (const entry of result.items.slice(0, 20)) {
        const when = new Date(entry.at);
        items.push({
          label: (Number.isNaN(when.getTime()) ? entry.at : when.toLocaleString("th-TH")) + (entry.hasMeta ? " · meta" : ""),
          run: async () => {
            if (!window.confirm("กู้คืน revision นี้? สถานะปัจจุบันจะถูกเก็บเป็น revision ใหม่")) return;
            try {
              await jsonRequest("POST", "/api/revisions/" + encodePath(id), { ts: entry.ts });
              toast("กู้คืนแล้ว");
              reload();
            } catch (error) {
              fail(error);
            }
          },
        });
      }
      openMenu(anchor, id, items);
    } catch (error) {
      fail(error);
    }
  }

  /* ── writing surface: one surface — mount editor ตั้งแต่โหลด (docs/08 ข้อ 63/65) ──
     ไม่มีปุ่ม/โหมดแก้ไข · ไม่มี overlay · ไม่มี split · ไม่มี swap ตอนผู้ใช้แตะ
     server render HTML ไว้ก่อน (no-JS + first paint) แล้ว client mount CM6 ทับ
     **ครั้งเดียวตอน idle** — หลังจากนั้นผู้ใช้คลิก/พิมพ์/ลากได้เองโดยไม่มีการแทนที่เนื้อหา
     ทุกอย่างยังเขียนกลับเป็น markdown เสมอ */

  const writing = {
    path: null,
    etag: null,
    handle: null,
    textarea: null,
    mounted: null,
    fallback: false,
    dirty: false,
    /** promise ของ PUT ที่กำลังวิ่ง — guard ไม่ให้ยิงซ้อน + ให้ nav/keepalive รอจนจบ */
    saving: null,
    timer: 0,
    schema: null,
  };

  /** codepoint ของ backtick — ห้ามเขียนตรง ๆ โค้ดนี้อยู่ใน template literal */
  const TICK = String.fromCharCode(96);

  /** id หัวข้อ → offset ใน markdown (TOC เลื่อนカー · สร้างจาก md + TOC ของ server) */
  let headingPositions = null;

  function readEmbedded() {
    if (!embeddedEl) return null;
    try {
      return JSON.parse(embeddedEl.textContent || "{}");
    } catch {
      return null;
    }
  }

  function setDocStatus(state, text) {
    if (!docStatusEl) return;
    if (state === "clean") docStatusEl.removeAttribute("data-state");
    else docStatusEl.setAttribute("data-state", state);
    docStatusEl.textContent = text || "";
  }

  function currentText() {
    if (writing.handle) return writing.handle.getDoc();
    return writing.textarea ? writing.textarea.value : "";
  }

  /** มีงานค้าง = data-dirty (SSE guard อ่านค่านี้ — docs/08 ข้อ 65) */
  function markDirty() {
    writing.dirty = true;
    docEl.setAttribute("data-dirty", "1");
    setDocStatus("dirty", "กำลังบันทึก…");
    scheduleSave();
  }

  function markClean() {
    writing.dirty = false;
    docEl.removeAttribute("data-dirty");
    setDocStatus("clean", "");
  }

  /** แปลง path ใน markdown ให้เป็น URL ของ asset (relative จากโฟลเดอร์ของเอกสาร) */
  function makeAssetResolver(docPath) {
    const dir = dirname(docPath);
    return (src) => {
      if (/^(https?:)?\\/\\//.test(src) || src.startsWith("data:")) return src;
      if (src.startsWith("/assets/")) return src;
      const clean = src.replace(/^\\.\\//, "");
      if (src.startsWith("/")) return "/assets" + src;
      return "/assets/" + (dir ? dir + "/" : "") + clean;
    };
  }

  /* ── heading map: TOC → offset (CM6 ไม่มี id ใน DOM — ต้องแมพจาก markdown เอง) ── */

  /** เทียบข้อความหัวข้อแบบหลวม ๆ — ตัด marker ที่ render ออกแล้ว
   *  หมายเหตุ: normalize ถูกใช้ทั้งกับข้อความจาก markdown และ text ของ TOC (server)
   *  การตัดอักขระจึงสมมาตร · ยกเว้นลิงก์/รูปที่เป็นโครงสร้างของ markdown เท่านั้น */
  function normalizeHeading(text) {
    const linked = String(text).replace(/!?\\[([^\\]]*)\\]\\([^)]*\\)/g, "$1");
    let out = "";
    for (const ch of linked) {
      if ("*_~[](){}=".indexOf(ch) !== -1 || ch === TICK) continue;
      out += ch;
    }
    return out.replace(/ +/g, " ").trim().toLowerCase();
  }

  /** fence marker ของ CommonMark: {char,len,rest} หรือ null — ปิดต้องเทียบ char+len
   *  (fence backtick 4 ตัวครอบ fence 3 ตัว ไม่ควร toggle กลางบล็อก) */
  function fenceMarker(line) {
    const match = new RegExp("^ {0,3}([" + TICK + "]{3,}|~{3,})(.*)$").exec(line);
    if (!match) return null;
    const marker = match[1];
    // info string ของ backtick fence ห้ามมี backtick (CommonMark)
    if (marker.charAt(0) === TICK && match[2].indexOf(TICK) !== -1) return null;
    return { char: marker.charAt(0), len: marker.length, rest: match[2] };
  }

  /** ความยาว frontmatter ของ markdown ดิบ — offset ของ heading ต้องนับจากเอกสาร
   *  ที่ editor เห็น (มี frontmatter) · ใช้สูตร md.length − body.length เท่านั้น
   *  (body ตัด newline หลัง block ออกหนึ่งตัว เหมือน core/frontmatter.ts) */
  function frontmatterLength(md) {
    const match = /^(?:\\ufeff)?---[ \\t]*\\r?\\n[\\s\\S]*?\\r?\\n(?:---|\\.\\.\\.)[ \\t]*(?:\\r?\\n|$)/.exec(md);
    if (!match) return 0;
    return md.length - md.slice(match[0].length).replace(/^\\r?\\n/, "").length;
  }

  /** หัวข้อระดับ h2/h3 ตามลำดับในเอกสาร + offset (ข้าม code fence · รู้จัก setext)
   *  renderer (mdast) นับ setext (Title ตามด้วยขีด) เป็น h2 ด้วย — ถ้าไม่นับ จำนวน heading
   *  จะไม่ตรงกับ TOC แล้วการจับคู่ด้วย index จะ drift ทั้งชุด */
  function headingsInMarkdown(md) {
    const found = [];
    const start = frontmatterLength(md);
    let fence = null;
    let offset = 0;
    let prevText = null;
    let prevOffset = 0;
    let prevIsParagraph = false;
    for (const line of md.slice(start).split("\\n")) {
      const marker = fenceMarker(line);
      if (fence) {
        if (
          marker &&
          marker.char === fence.char &&
          marker.len >= fence.len &&
          marker.rest.trim() === ""
        ) {
          fence = null;
        }
        prevIsParagraph = false;
      } else if (marker) {
        fence = marker;
        prevIsParagraph = false;
      } else {
        const atx = /^(#{1,6}) +(.*)$/.exec(line);
        if (atx) {
          const depth = atx[1].length;
          if (depth === 2 || depth === 3) {
            found.push({ depth, text: normalizeHeading(atx[2]), pos: start + offset });
          }
          prevIsParagraph = false;
        } else {
          // setext underline: ขีด = h2 · เท่ากับ = h1 · ต้องตามหลังย่อหน้าจริง (ไม่ใช่บรรทัดว่าง)
          const setext = /^ {0,3}(-+|=+)[ \\t]*$/.exec(line);
          if (setext && prevIsParagraph) {
            const depth = setext[1].charAt(0) === "=" ? 1 : 2;
            if (depth === 2) {
              found.push({ depth, text: normalizeHeading(prevText), pos: start + prevOffset });
            }
            prevIsParagraph = false;
          } else {
            prevIsParagraph = line.trim() !== "";
          }
        }
      }
      prevText = line;
      prevOffset = offset;
      offset += line.length + 1;
    }
    return found;
  }

  /** จับคู่ TOC entry (server) กับบรรทัดจริง — ลำดับ + ข้อความ + ถอยหลังได้ไม่เกิน 4 */
  function buildHeadingMap(md) {
    const found = headingsInMarkdown(md);
    const map = new Map();
    const seen = new Set();
    let index = 0;
    for (const link of $$("[data-toc-link]")) {
      const id = link.getAttribute("data-toc-link");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const text = normalizeHeading(link.textContent || "");
      let pick = found[index];
      if (pick && text && pick.text !== text) {
        for (let i = index; i < found.length && i < index + 4; i += 1) {
          if (found[i].text === text) {
            index = i;
            pick = found[i];
            break;
          }
        }
      }
      if (pick) map.set(id, pick.pos);
      index += 1;
    }
    headingPositions = map;
  }

  /* ── scroll: การจำตำแหน่งอ่านเป็นของเรา (ไม่พึ่ง scroll restoration ของเบราว์เซอร์) ──
     mount เปลี่ยนความสูงของเอกสาร → ถ้าปล่อยให้เบราว์เซอร์ restore เอง ตำแหน่งจะเพี้ยน
     ใช้ offset ของ CM6 เอง (posAtCoords) + จำใน sessionStorage ต่อ path (docs/09 §3.1) */

  const SCROLL_KEY = "doku.scroll";
  try {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  } catch {}

  function anchorY() {
    if (!articleEl) return 8;
    const rect = articleEl.getBoundingClientRect();
    return Math.max(Math.min(rect.top, window.innerHeight - 1), 0) + 4;
  }

  /** จำ "บรรทัดบนสุดที่มองเห็น" ตอนออกจากหน้า — ใช้ตอนกลับมา/โหลดใหม่ */
  function saveScrollAnchor() {
    if (!writing.handle || !writing.path) return;
    try {
      const top = anchorY();
      const offset = writing.handle.offsetAtCoords(top);
      if (typeof offset !== "number") return;
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ path: writing.path, offset, top }));
    } catch {}
  }

  /** คืนตำแหน่ง scroll หลัง swap ครั้งเดียว (≤ 2px — วัดจาก coords จริงของบรรทัด)
   *  ขั้นแรกใช้ scrollIntoView ของ CM6 (บรรทัดที่ยังไม่ render ก็ใช้ได้) แล้วแก้ delta
   *  จริงในเฟรมถัดไป (หลัง render บรรทัดนั้นแล้วจึงวัด coords ได้) */
  function restoreScroll(anchor) {
    if (!anchor || !writing.handle) return;
    writing.handle.scrollTo(anchor.offset);
    const align = () => {
      if (!writing.handle) return;
      const coords = writing.handle.coordsAt(anchor.offset);
      if (!coords) return;
      const delta = Math.round(coords.top - anchor.top);
      if (Math.abs(delta) > 2 && Math.abs(delta) < window.innerHeight * 2) {
        window.scrollBy(0, delta);
      }
    };
    window.requestAnimationFrame(align);
    // pass ที่สอง — ให้ height map ของ CM6 นิ่งก่อน (บรรทัดบนสุดอาจยังเป็นค่าประมาณ)
    window.setTimeout(align, 160);
  }

  function savedScrollAnchor() {
    try {
      const raw = sessionStorage.getItem(SCROLL_KEY);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || entry.path !== writing.path) return null;
      sessionStorage.removeItem(SCROLL_KEY);
      return { offset: entry.offset, top: entry.top };
    } catch {
      return null;
    }
  }

  /** hash ปัจจุบัน (#หัวข้อ) → เลื่อนカーไปหัวข้อนั้น (docs/09 §3.1) */
  function scrollToHash() {
    const raw = window.location.hash;
    if (!raw || raw.length < 2) return false;
    let id = raw.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {}
    return scrollToHeading(id);
  }

  /** เลื่อนカーไปหัวข้อจาก TOC (ใช้เมื่อ editor mounted) */
  function scrollToHeading(id) {
    if (!writing.handle || !headingPositions) return false;
    const pos = headingPositions.get(id);
    if (typeof pos !== "number") return false;
    writing.handle.scrollTo(pos);
    return true;
  }

  function syncColophonWords(md) {
    const colophon = $(".doku-colophon");
    if (!colophon) return;
    const words = md.trim().split(/\\s+/u).filter(Boolean).length;
    const node = colophon.querySelector("[data-part='colophon-words']");
    if (node) node.textContent = words.toLocaleString("th-TH") + " คำ";
    const minutes = colophon.querySelector("[data-part='colophon-minutes']");
    if (minutes) minutes.textContent = "อ่าน ~" + Math.max(1, Math.round(words / 220)) + " นาที";
  }

  function surfaceOptions(md, schema) {
    return {
      doc: md,
      focus: false,
      placeholder: "พิมพ์ / เพื่อแทรก block",
      resolveAsset: makeAssetResolver(writing.path),
      slashItems: buildSlashItems(schema),
      blockLabels: BLOCK_LABELS,
      calloutTypes: (schema && schema.variants) || [],
      inlineBlocks: ((schema && schema.blocks) || [])
        .filter((block) => block.kind === "text")
        .map((block) => block.name),
      onDirective: (info) => renderDirectiveStrip(info),
      onMark: (info) => renderMarkStrip(info),
      onTurnInto: (target) => openTurnIntoMenu(target),
      onChange: markDirty,
      onSave: () => flushSave(true),
    };
  }

  /** swap ครั้งที่ 1 และครั้งเดียว: HTML จาก server → CM6 (docs/08 ข้อ 65) */
  async function mountSurface() {
    if (writing.handle || writing.fallback || !articleEl || !bodyEl) return;
    const payload = readEmbedded();
    if (!payload || typeof payload.md !== "string") return;
    writing.path = articleEl.getAttribute("data-doc-id");
    writing.etag = payload.etag || null;
    if (!window.DokuEditor) {
      installFallbackEntry();
      return;
    }
    const anchor = savedScrollAnchor();
    const schema = await loadSchema();
    if (writing.handle || writing.fallback) return; // mount ไปแล้วระหว่างรอ schema
    writing.schema = schema;
    const host = document.createElement("div");
    host.className = "doku-inline-editor";
    bodyEl.textContent = "";
    bodyEl.appendChild(host);
    writing.mounted = host;
    writing.handle = window.DokuEditor.create(host, surfaceOptions(payload.md, schema));
    docEl.setAttribute("data-editor-mounted", "1");
    buildHeadingMap(payload.md);
    // deep link: /d/x#หัวข้อ — หลัง mount ไม่มี id ใน DOM แล้ว ต้องใช้ heading map
    if (!scrollToHash()) restoreScroll(anchor);
    syncColophonWords(payload.md);
    setDocStatus("clean", "");
  }

  /** ไม่มี bundle (docs/08 ข้อ 37): degraded path — คลิกเอกสารแล้วได้ textarea
   *  (one surface ใช้ไม่ได้ถ้าไม่มี editor bundle · หน้าอ่านยังอ่านได้ปกติ) */
  function installFallbackEntry() {
    writing.fallback = true;
    articleEl.addEventListener("click", (event) => {
      if (writing.textarea) return;
      const payload = readEmbedded();
      if (!payload || typeof payload.md !== "string") return;
      if (
        event.target.closest &&
        event.target.closest("a, button, summary, input, select, textarea, .doku-doc-meta")
      ) {
        return;
      }
      event.preventDefault();
      mountTextarea(payload.md);
    });
  }

  function mountTextarea(md) {
    const host = document.createElement("div");
    host.className = "doku-inline-editor";
    bodyEl.textContent = "";
    bodyEl.appendChild(host);
    const textarea = document.createElement("textarea");
    textarea.className = "doku-inline-textarea";
    textarea.value = md;
    textarea.setAttribute("aria-label", "เนื้อหาเอกสาร (markdown)");
    textarea.addEventListener("input", markDirty);
    host.appendChild(textarea);
    writing.mounted = host;
    writing.textarea = textarea;
    docEl.setAttribute("data-editor-mounted", "1");
    textarea.focus();
  }

  function focusSurface() {
    if (writing.handle) writing.handle.focus();
    else if (writing.textarea) writing.textarea.focus();
  }

  function scheduleSave() {
    clearTimeout(writing.timer);
    writing.timer = setTimeout(() => flushSave(false), 800);
  }

  /** autosave · If-Match · 409 = ให้คนเลือก (ไม่ทับเงียบ — docs/08 ข้อ 54)
   *  **ห้าม markClean ก่อน PUT ตอบกลับ** — ระหว่าง round-trip data-dirty ต้องยังอยู่
   *  (nav guard + keepalive อาศัยค่านี้ — docs/08 ข้อ 65) · ยิงซ้อนไม่ได้
   *  (คืน promise เดิม) · ถ้าพิมพ์เพิ่มระหว่าง flight loop จะ save ต่อให้เอง */
  async function flushSave(explicit) {
    if (writing.saving) return writing.saving;
    if (!writing.dirty || (!writing.handle && !writing.textarea)) {
      if (explicit) setDocStatus("clean", "");
      return;
    }
    writing.saving = (async () => {
      try {
        while (writing.dirty) {
          const md = currentText();
          let result;
          try {
            result = await jsonRequest(
              "PUT",
              "/api/docs/" + encodePath(writing.path),
              { md },
              writing.etag ? { "if-match": '"' + writing.etag + '"' } : undefined,
            );
          } catch (error) {
            writing.dirty = true;
            docEl.setAttribute("data-dirty", "1");
            if (error.status === 409) {
              const force = window.confirm(
                "เอกสารถูกแก้จากที่อื่นหลังคุณเปิดหน้านี้" +
                  LF +
                  LF +
                  "เขียนทับด้วยเวอร์ชันของคุณหรือไม่?" +
                  LF +
                  "(ยกเลิก = เก็บงานของคุณไว้ก่อน ยังไม่เขียนทับ)",
              );
              if (error.etag) writing.etag = error.etag;
              if (force) {
                setDocStatus("dirty", "กำลังบันทึก…");
                continue; // ลองใหม่ด้วย etag ที่ server เพิ่งส่งกลับ
              }
              setDocStatus("error", "ถูกแก้จากที่อื่น");
              return;
            }
            setDocStatus("error", "บันทึกไม่สำเร็จ");
            fail(error);
            return;
          }
          if (result && result.etag) writing.etag = result.etag;
          // กัน SSE echo ของการเขียนของตัวเอง (watcher + debounce ~250–330ms)
          window.dispatchEvent(new Event("doku:saved"));
          // ล้าง dirty หลัง PUT สำเร็จ และเฉพาะเมื่อไม่มีงานใหม่ระหว่าง round-trip
          if (currentText() === md) markClean();
          syncColophonWords(md);
        }
      } finally {
        writing.saving = null;
      }
    })();
    return writing.saving;
  }

  /** flush ก่อน navigate ไปหน้าอื่น — ต้อง await จนจบจริงก่อนปล่อยไป (กันงานหาย) */
  async function flushForNavigation() {
    clearTimeout(writing.timer);
    try {
      await flushSave(true);
    } catch (error) {
      fail(error);
    }
  }

  /** best-effort ตอนปิด/ซ่อนหน้า — keepalive (เบราว์เซอร์จำกัด body ~64KB) */
  function flushKeepalive() {
    if (!writing.dirty || !writing.path) return;
    try {
      const md = currentText();
      writing.dirty = false;
      docEl.removeAttribute("data-dirty");
      fetch("/api/docs/" + encodePath(writing.path), {
        method: "PUT",
        keepalive: true,
        headers: Object.assign(
          { "content-type": "application/json" },
          writing.etag ? { "if-match": '"' + writing.etag + '"' } : {},
        ),
        body: JSON.stringify({ md }),
      }).catch(() => {});
    } catch {}
  }
  window.addEventListener("pagehide", () => {
    saveScrollAnchor();
    flushKeepalive();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") return;
    saveScrollAnchor();
    void flushSave(false);
  });

  /* ── slash menu + block control strip (docs/08 ข้อ 55) ─────────────────── */

  const LF = String.fromCharCode(10);
  const FENCE = String.fromCharCode(96).repeat(3); // ห้ามเขียน backtick ตรง ๆ — โค้ดนี้อยู่ใน template literal
  const BLOCK_LABELS = {
    note: "กล่องหมายเหตุ",
    info: "ข้อมูล",
    tip: "เคล็ดลับ",
    success: "สำเร็จ",
    warning: "คำเตือน",
    danger: "อันตราย",
    quote: "อ้างคำพูด",
    mark: "ไฮไลต์ข้อความ",
    badge: "ป้ายสถานะ",
    stat: "ตัวเลขเดี่ยว",
    stats: "ชุดตัวเลข",
    figure: "รูปภาพ + caption",
    gallery: "แกลเลอรีรูป",
    video: "วิดีโอ / เสียง",
    card: "การ์ดลิงก์",
    section: "หัวข้อใหญ่",
    grid: "ตารางแบ่งคอลัมน์",
    col: "คอลัมน์",
    kv: "คู่ key–value",
    progress: "แถบความคืบหน้า",
    steps: "ขั้นตอน",
    timeline: "ไทม์ไลน์",
    "margin-note": "โน้ตข้างขอบ",
    motion: "อนิเมชัน",
    details: "ส่วนพับได้",
    tabs: "แท็บ",
  };

  /** markdown พื้นฐานที่ Notion มีให้ในเมนู / */
  const MARKDOWN_ITEMS = [
    { keyword: "h2", label: "หัวข้อใหญ่", detail: "##", template: "## |" },
    { keyword: "h3", label: "หัวข้อย่อย", detail: "###", template: "### |" },
    { keyword: "list", label: "รายการ", detail: "-", template: "- |" },
    { keyword: "todo", label: "งานที่ต้องทำ", detail: "- [ ]", template: "- [ ] |" },
    { keyword: "num", label: "รายการมีลำดับ", detail: "1.", template: "1. |" },
    { keyword: "quote", label: "อ้างคำพูด", detail: ">", template: "> |" },
    { keyword: "code", label: "โค้ด", detail: "code", template: FENCE + "ts" + LF + "|" + LF + FENCE },
    { keyword: "table", label: "ตาราง", detail: "| … |", template: "| หัวข้อ | หัวข้อ |" + LF + "| --- | --- |" + LF + "| | |" },
    { keyword: "math", label: "สมการ", detail: "$$", template: "$$" + LF + "|" + LF + "$$" },
    { keyword: "image", label: "รูป", detail: "![]()", template: "![|](assets/)" },
    { keyword: "divider", label: "เส้นคั่น", detail: "---", template: "---" },
  ];

  let schemaPromise = null;
  function loadSchema() {
    if (!schemaPromise) {
      schemaPromise = api("/api/schema").catch(() => null);
    }
    return schemaPromise;
  }

  /** ใช้ example จาก registry เป็นเทมเพลต — ไม่มีข้อมูลชุดที่สองให้ดูแล
   *  block แบบ container → วางカーในบรรทัดว่างแรกหลัง fence เปิด */
  function schemaTemplate(block) {
    const example = String(block.example || "").replace(/s+$/, "");
    if (!example) return "";
    if (block.kind !== "container") return example;
    const lines = example.split(LF);
    let index = -1;
    for (let i = 1; i < lines.length - 1; i += 1) {
      if (!lines[i].trim()) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      // ไม่มีบรรทัดว่างใน example -> แทรกบรรทัดว่างก่อน fence ปิด เพื่อให้カーอยู่ "ใน" block
      lines.splice(lines.length - 1, 0, "|");
      return lines.join(LF);
    }
    lines[index] = "|";
    return lines.join(LF);
  }

  function buildSlashItems(schema) {
    const items = MARKDOWN_ITEMS.slice();
    if (!schema || !schema.blocks) return items;
    for (const block of schema.blocks) {
      const template = schemaTemplate(block);
      if (!template) continue;
      items.push({
        keyword: block.name,
        label: (BLOCK_LABELS[block.name] || block.name) + " · " + block.name,
        detail: ":::",
        template,
      });
    }
    return items;
  }

  /* block control strip — แถบลอยเมื่อカーเข้า directive block (docs/08 ข้อ 55)
     แผง "ไม่ผูกกับ focus ของ editor": editor รายงานตำแหน่ง directive จาก selection เสมอ
     → ฝั่ง client เป็นผู้ตัดสินว่าเมื่อไหร่ควรซ่อน — pin ระหว่างโต้ตอบ (คลิก select/input
     ในแผงต้องไม่ทำแผงหาย) และห้าม rebuild DOM กลาง interaction */
  let stripKey = null; // ตัวตนของ block ที่แผงแสดง (ชื่อ + fence + บรรทัด) — เปลี่ยน = rebuild
  let stripPin = false; // กำลังโต้ตอบกับแผง — ยังไม่ซ่อนแม้ focus หลุดจาก editor
  let stripInfo = null; // info ล่าสุด — ใช้ตอน scroll/resize
  let stripViewTop = null; // viewport-relative top ของ editor host ตอนวางแผงล่าสุด
  let patchTimer = 0;

  function stripEl() {
    let el = document.getElementById("doku-block-strip");
    if (!el && articleEl) {
      el = document.createElement("div");
      el.id = "doku-block-strip";
      el.className = "doku-block-strip";
      el.hidden = true;
      el.addEventListener("focusin", () => {
        stripPin = true;
      });
      el.addEventListener("focusout", (event) => {
        if (!el.contains(event.relatedTarget)) stripPin = false;
      });
      articleEl.appendChild(el);
    }
    return el;
  }

  /** พิกัดของ event อยู่ในกรอบ element ไหม — วัดด้วย rect ไม่ใช่ contains อย่างเดียว
   *  (กันเคส element ถูกแทนที่ระหว่างคลิก → target หลุดจาก DOM) */
  function inRect(el, event, pad) {
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    const p = pad || 0;
    return (
      event.clientX >= r.left - p &&
      event.clientX <= r.right + p &&
      event.clientY >= r.top - p &&
      event.clientY <= r.bottom + p
    );
  }

  function hideStrip() {
    stripPin = false;
    stripKey = null;
    stripInfo = null;
    const el = stripEl();
    if (el) el.hidden = true;
  }

  function stripControl(label, node) {
    const wrap = document.createElement("label");
    wrap.className = "doku-block-strip-field";
    const span = document.createElement("span");
    span.textContent = label;
    wrap.appendChild(span);
    wrap.appendChild(node);
    return wrap;
  }

  function positionStrip(el, info) {
    // วาง "เหนือ" บรรทัด fence และชิดขวาของคอลัมน์อ่าน
    // → ข้อความในบรรทัด fence ไม่ถูกบัง และหัวข้อ (ชิดซ้าย) ก็ไม่ถูกทับ
    const stripWidth = el.offsetWidth;
    const stripHeight = el.offsetHeight;
    const columnWidth = articleEl ? articleEl.clientWidth : stripWidth;
    el.style.top = Math.max(0, info.top - stripHeight - 4) + "px";
    el.style.left = Math.max(0, columnWidth - stripWidth) + "px";
    if (writing.mounted) stripViewTop = writing.mounted.getBoundingClientRect().top;
  }

  function syncStripValues(el, info) {
    // block เดิม — อัปเดตค่า control ที่มีอยู่แทนการ rebuild (dropdown ที่เปิดค้าง/focus
    // จึงไม่ถูกทำลาย) · ถ้ากำลังพิมพ์/เลือกอยู่ในแผง อย่าแตะค่าที่ control กำลังถือ
    if (el.contains(document.activeElement)) return;
    const variant = el.querySelector("[data-variant]");
    if (variant && variant.value !== info.name) variant.value = info.name;
    for (const control of el.querySelectorAll("[data-attr]")) {
      const next = info.attrs[control.getAttribute("data-attr")] || "";
      if (control.value !== next) control.value = next;
    }
  }

  /** text input ในแผงแก้แบบ live — debounce ~300ms ต่อการพิมพ์ */
  function schedulePatch(patch) {
    clearTimeout(patchTimer);
    patchTimer = setTimeout(() => {
      if (writing.handle) writing.handle.patchDirective(patch);
    }, 300);
  }

  function buildStrip(el, info, key) {
    const schema = writing.schema;
    const block = schema && schema.blocks ? schema.blocks.find((b) => b.name === info.name) : null;
    el.textContent = "";
    el.setAttribute("data-strip-key", key);

    const name = document.createElement("span");
    name.className = "doku-block-strip-name";
    name.textContent = BLOCK_LABELS[info.name] || info.name;
    el.appendChild(name);

    if (block) {
      // callout ทั้ง 7 type ใช้ renderer เดียวกัน → สลับชื่อ block ได้
      if (schema.variants && schema.variants.indexOf(info.name) !== -1) {
        const select = document.createElement("select");
        select.setAttribute("data-variant", "1");
        for (const variant of schema.variants) {
          const option = document.createElement("option");
          option.value = variant;
          option.textContent = BLOCK_LABELS[variant] || variant;
          if (variant === info.name) option.selected = true;
          select.appendChild(option);
        }
        select.addEventListener("change", () => {
          if (writing.handle) writing.handle.patchDirective({ name: select.value });
        });
        el.appendChild(stripControl("ชนิด", select));
      }
      for (const attr of block.attributes) {
        if (attr === "src" && info.name === "figure") continue;
        const allowed = block.values && block.values[attr];
        const current = info.attrs[attr] || "";
        let control;
        if (allowed && allowed.length && allowed.length <= 12) {
          control = document.createElement("select");
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = "—";
          control.appendChild(empty);
          for (const value of allowed) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            if (value === current) option.selected = true;
            control.appendChild(option);
          }
        } else if (attr === "color") {
          control = document.createElement("select");
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = "—";
          control.appendChild(empty);
          for (const value of (schema.colors || [])) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            if (value === current) option.selected = true;
            control.appendChild(option);
          }
        } else {
          control = document.createElement("input");
          control.type = "text";
          control.value = current;
          control.size = attr === "title" || attr === "caption" ? 14 : 7;
        }
        control.setAttribute("aria-label", attr);
        control.setAttribute("data-attr", attr);
        if (control.tagName === "INPUT") {
          control.addEventListener("input", () => {
            const patch = {};
            patch[attr] = control.value;
            schedulePatch(patch);
          });
        }
        control.addEventListener("change", () => {
          clearTimeout(patchTimer);
          const patch = {};
          patch[attr] = control.value;
          if (writing.handle) writing.handle.patchDirective(patch);
        });
        el.appendChild(stripControl(attr, control));
      }
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "doku-icon-btn doku-block-strip-remove";
    remove.title = "ลบ block นี้";
    remove.setAttribute("aria-label", "ลบ block นี้");
    remove.textContent = "×";
    remove.addEventListener("click", () => writing.handle && writing.handle.removeDirective());
    el.appendChild(remove);

    el.hidden = false;
    positionStrip(el, info);
  }

  function renderDirectiveStrip(info) {
    if (!writing.handle) {
      hideStrip();
      return;
    }
    // カーอยู่ใน mark → mark bar ชนะ — block strip หลบจนกว่าカーออกจาก mark
    if (markInfo) {
      hideStrip();
      return;
    }
    if (!info) {
      // カーย้ายออกนอก directive — ซ่อน ยกเว้นแผงกำลังถูก pin (โต้ตอบกับแผงอยู่)
      if (stripPin) {
        stripInfo = null;
        return;
      }
      hideStrip();
      return;
    }
    stripInfo = info;
    const el = stripEl();
    if (!el) return;
    const key = info.name + "@" + info.lineFrom + "/" + info.fence;
    if (!el.hidden && el.getAttribute("data-strip-key") === key) {
      // block เดิม (รวมกรณี patchDirective จากแผงแล้ว fence เปลี่ยน) — sync ค่า ไม่ rebuild
      syncStripValues(el, info);
      positionStrip(el, info);
      return;
    }
    buildStrip(el, info, key);
  }

  // pin/unpin ด้วย pointer — คลิกในแผง (แม้ target ถูกแทนที่ระหว่างคลิก) = ยัง pin อยู่
  document.addEventListener("pointerdown", (event) => {
    if (!writing.handle) return;
    const mark = markBarEl();
    if (mark && !mark.hidden && (mark.contains(event.target) || inRect(mark, event, 4))) {
      markPin = true; // แผง mark คนละ state กับ block strip — ห้ามไปแตะ pin ของอีกฝั่ง
      return;
    }
    markPin = false;
    const el = stripEl();
    if (el && !el.hidden && (el.contains(event.target) || inRect(el, event, 4))) {
      stripPin = true;
      return;
    }
    stripPin = false;
    // คลิกนอกทั้ง editor และแผง → ซ่อนแผง (การออกจากโหมดเขียนจัดการใน click handler หลัก)
    const inEditor =
      writing.mounted &&
      (writing.mounted.contains(event.target) || inRect(writing.mounted, event, 4));
    if (!inEditor) hideStrip();
    if (!inEditor) hideMarkBar();
  });

  // แผงลอยอยู่บนเอกสาร → ตำแหน่งต้องตาม scroll/resize ด้วย (delta ของ editor host)
  // ใช้กับทั้ง block strip และ mark swatch strip (แผงเดียว visible ต่อจังหวะ — กฎ mark-ชนะ)
  function onViewportMove() {
    if (!writing.mounted) return;
    const nowTop = writing.mounted.getBoundingClientRect().top;
    const delta = stripViewTop !== null ? nowTop - stripViewTop : 0;
    stripViewTop = nowTop;
    for (const [el, info] of [
      [stripEl(), stripInfo],
      [markBarEl(), markInfo],
    ]) {
      if (!el || el.hidden || !info) continue;
      if (delta) {
        el.style.top = Math.max(0, (parseFloat(el.style.top) || 0) + delta) + "px";
      }
      const barWidth = el.offsetWidth;
      const columnWidth = articleEl ? articleEl.clientWidth : barWidth;
      el.style.left = Math.max(0, columnWidth - barWidth) + "px";
    }
  }
  window.addEventListener("scroll", onViewportMove, true);
  window.addEventListener("resize", onViewportMove);

  /* ── คลิกบรรทัด meta = เปิด panel คุณสมบัติ (カーเข้า editor จัดการโดย CM6 เอง — docs/08 ข้อ 65) ── */

  if (articleEl && bodyEl) {
    articleEl.addEventListener("click", (event) => {
      const metaLine = event.target.closest ? event.target.closest(".doku-doc-meta") : null;
      if (!metaLine) return;
      event.preventDefault();
      openMeta(currentDocPath());
    });
  }

/* ── block layer: gutter overlay + block menu + drag & drop ───────────────
     docs/09 §3.3 (overlay ของ client) · Track C1–C4
     · follow mouse ต่อ frame (rAF) · delay ซ่อน 200ms + hit-area (handle ไม่หนีมือ)
     · ทุก operation เรียก handle ที่เขียนกลับเป็น markdown (ไม่มี state ซ่อน) */

  let gutterBlock = null; // block ที่ gutter ชี้อยู่
  let gutterHideTimer = 0;
  let gutterFrame = 0;
  let gutterPointer = null;
  let lastPointer = null;

  function gutterEl() {
    let el = document.getElementById("doku-gutter");
    if (!el && articleEl) {
      el = document.createElement("div");
      el.id = "doku-gutter";
      el.className = "z-doku-gutter";
      el.hidden = true;
      const add = document.createElement("button");
      add.type = "button";
      add.className = "doku-gutter-btn";
      add.setAttribute("data-gutter", "add");
      add.setAttribute("aria-label", "แทรก block ที่นี่");
      add.textContent = "+";
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "doku-gutter-btn doku-gutter-handle";
      handle.setAttribute("data-gutter", "handle");
      handle.setAttribute("aria-label", "เมนู block (คลิก = เปิด · ลาก = ย้าย)");
      handle.textContent = "⋮⋮";
      el.appendChild(add);
      el.appendChild(handle);
      articleEl.appendChild(el);
      el.addEventListener("pointerenter", () => {
        gutterPointer = true;
        clearTimeout(gutterHideTimer);
      });
      el.addEventListener("pointerleave", () => {
        gutterPointer = false;
        scheduleGutterHide();
      });
      el.addEventListener("click", (event) => {
        const btn = event.target.closest ? event.target.closest("[data-gutter]") : null;
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();
        if (btn.getAttribute("data-gutter") === "add") openInsertMenu(btn);
        else openBlockMenu(btn);
      });
    }
    return el;
  }

  function scheduleGutterHide() {
    clearTimeout(gutterHideTimer);
    gutterHideTimer = window.setTimeout(() => {
      if (gutterPointer || dragState) return;
      hideGutter();
    }, 200);
  }

  function hideGutter() {
    gutterBlock = null;
    const el = gutterEl();
    if (el) el.hidden = true;
    if (writing.handle) writing.handle.clearHighlight();
  }

  /** block ที่พิกัดจอ (clientX/clientY) — ใช้ทั้ง hover, long-press และ drag */
  function blockAtPoint(x, y) {
    if (!writing.handle) return null;
    return writing.handle.blockAtPoint(x, y);
  }

  function showGutter(block) {
    const el = gutterEl();
    if (!el || !writing.handle || !articleEl) return;
    clearTimeout(gutterHideTimer);
    gutterBlock = block;
    const coords = writing.handle.coordsAt(block.from);
    const rect = articleEl.getBoundingClientRect();
    if (coords) {
      el.style.top = Math.max(0, coords.top - rect.top) + "px";
    }
    el.style.left = Math.max(0, -44) + "px";
    el.hidden = false;
    writing.handle.highlight(block.from, block.to);
  }

  /** pointer ครั้งเดียวต่อ frame (docs/09 §3.3) */
  function onGutterPointerMove(event) {
    if (!writing.handle) return;
    if (event.pointerType === "touch") return; // touch = long-press ไม่มี hover (docs/08 ข้อ 71)
    const el = gutterEl();
    if (el && !el.hidden && inRect(el, event, 6)) {
      gutterPointer = true;
      clearTimeout(gutterHideTimer);
      return;
    }
    lastPointer = { x: event.clientX, y: event.clientY };
    if (gutterFrame) return;
    gutterFrame = window.requestAnimationFrame(() => {
      gutterFrame = 0;
      const point = lastPointer;
      if (!point || !writing.handle) return;
      const block = blockAtPoint(point.x, point.y);
      if (!block) {
        scheduleGutterHide();
        return;
      }
      showGutter(block);
    });
  }

  /* ── เมนูของ block (C1/C3: ทุกอย่างมีคีย์ลัดเทียบเท่า) ─────────────────── */

  function insertItems(schema) {
    return buildSlashItems(schema).map((item) => ({
      label: item.label,
      run: () => {
        if (!writing.handle || !gutterBlock) return;
        writing.handle.insertAt(gutterBlock.from, item.template);
      },
    }));
  }

  function openInsertMenu(anchor) {
    if (!writing.handle || !gutterBlock) return;
    const items = insertItems(writing.schema).slice(0, 24);
    openMenu(anchor, "แทรก block", [
      {
        label: "ย่อหน้า (พิมพ์ต่อท้าย)",
        run: () => {
          if (!gutterBlock || !writing.handle) return;
          writing.handle.insertAt(gutterBlock.from, "");
        },
      },
      ...items.map((item, index) => ({ separator: index === 0, ...item })),
    ]);
  }

  /** เมนู Turn into (Mod+/ หรือ ⋮⋮) — ใช้ target จาก editor (จาก/to/พิกัด) */
  function turnIntoItems(from, to) {
    const run = (target) => () => writing.handle && writing.handle.turnInto(from, to, target)
    return [
      { label: "หัวข้อใหญ่ (H1)", run: run("h1") },
      { label: "หัวข้อ (H2)", run: run("h2") },
      { label: "หัวข้อย่อย (H3)", run: run("h3") },
      { label: "ย่อหน้า", run: run("paragraph") },
      { label: "รายการ", run: run("list") },
      { label: "งานที่ต้องทำ", run: run("todo") },
      { label: "อ้างคำพูด", run: run("quote") },
      { label: "โค้ด", run: run("code") },
    ]
  }

  function openTurnIntoMenu(target) {
    const anchor = document.createElement("button");
    anchor.type = "button";
    anchor.style.position = "fixed";
    anchor.style.left = Math.max(0, Math.round(target.x)) + "px";
    anchor.style.top = Math.max(0, Math.round(target.y)) + "px";
    anchor.style.width = "1px";
    anchor.style.height = "1px";
    anchor.style.opacity = "0";
    anchor.style.pointerEvents = "none";
    document.body.appendChild(anchor);
    openMenu(anchor, "Turn into", turnIntoItems(target.from, target.to));
    window.setTimeout(() => anchor.remove(), 0);
  }

  function openBlockMenu(anchor) {
    if (!writing.handle || !gutterBlock) return;
    const block = gutterBlock;
    const words = writing.handle.textOfBlock(block.from, block.to).trim();
    const count = words ? words.split(/s+/u).filter(Boolean).length : 0;
    openMenu(anchor, "block #" + block.headLine + " · " + block.kind, [
      ...turnIntoItems(block.from, block.to),
      { separator: true },
      {
        label: "ย้ายขึ้น",
        hint: "Mod+Shift+↑",
        run: () => writing.handle.runBlockOp("moveUp", { from: block.from, to: block.to }),
      },
      {
        label: "ย้ายลง",
        hint: "Mod+Shift+↓",
        run: () => writing.handle.runBlockOp("moveDown", { from: block.from, to: block.to }),
      },
      {
        label: "ทำสำเนา",
        hint: "Mod+D",
        run: () => writing.handle.runBlockOp("duplicate", { from: block.from, to: block.to }),
      },
      { label: "ซ้อน (nest)", hint: "Tab", run: () => writing.handle.runBlockOp("indent", { from: block.from, to: block.to }) },
      { label: "ลดร่น (un-nest)", hint: "Shift+Tab", run: () => writing.handle.runBlockOp("outdent", { from: block.from, to: block.to }) },
      { separator: true },
      { label: "คัดลอกลิงก์เอกสาร", run: () => copyDocLink(currentDocPath()) },
      { label: count.toLocaleString("th-TH") + " คำ", run: () => {} },
      { separator: true },
      {
        label: "ลบ block",
        danger: true,
        hint: "Shift+Delete",
        run: () => writing.handle.runBlockOp("delete", { from: block.from, to: block.to }),
      },
    ]);
  }

  /* ── drag & drop: ลาก block (C4) ──────────────────────────────────────── */

  let dragState = null;
  let dragFrame = 0;
  let dragPointer = null;

  function dropIndicator() {
    let el = document.getElementById("doku-drop-indicator");
    if (!el && articleEl) {
      el = document.createElement("div");
      el.id = "doku-drop-indicator";
      el.className = "doku-drop-indicator";
      el.hidden = true;
      articleEl.appendChild(el);
    }
    return el;
  }

  /** ตำแหน่ง/ความลึกของ drop จากพิกัด pointer — ครั้งเดียวต่อ frame */
  function updateDropTarget() {
    dragFrame = 0;
    if (!dragState || !writing.handle || !dragPointer || !articleEl) return;
    const { x, y } = dragPointer;
    const blocks = writing.handle.blocks();
    // บรรทัดเป้าหมาย = block ที่ pointer อยู่ หรือ block ถัดไป (drop ระหว่างบรรทัด)
    let target = null;
    for (const block of blocks) {
      const coords = writing.handle.coordsAt(block.from);
      if (!coords) continue;
      if (coords.top <= y + 6) target = block;
      else break;
    }
    const next = target
      ? blocks.find((block) => block.from > target.from && block.depth <= target.depth)
      : blocks[0];
    const rect = articleEl.getBoundingClientRect();
    const depth = Math.max(
      0,
      Math.min(5, Math.round((x - rect.left - 24) / 24)),
    );
    const anchorBlock = next ?? target;
    const coords = anchorBlock && writing.handle.coordsAt(anchorBlock.from);
    const el = dropIndicator();
    if (el && coords) {
      el.style.top = Math.max(0, coords.top - rect.top - 3) + "px";
      el.style.left = Math.max(0, 24 + depth * 24) + "px";
      el.style.setProperty("--drop-depth", String(depth));
      el.hidden = false;
    }
    dragState.targetFrom = anchorBlock ? anchorBlock.from : writing.handle.offsetAtCoords(y) ?? 0;
    dragState.depth = depth;
    dragState.targetLine = anchorBlock ? anchorBlock.headLine - 1 : 0;
  }

  function endDrag(apply) {
    if (!dragState) return;
    const state = dragState;
    dragState = null;
    const el = dropIndicator();
    if (el) el.hidden = true;
    window.removeEventListener("pointermove", onDragMove, true);
    window.removeEventListener("pointerup", onDragUp, true);
    window.removeEventListener("pointercancel", onDragCancel, true);
    if (!apply || !writing.handle) return;
    if (!state.moved) {
      const handle = document.querySelector('[data-gutter="handle"]');
      if (handle) openBlockMenu(handle);
      return;
    }
    const targetPos = writing.handle.offsetAtCoords(dragPointer ? dragPointer.y : state.y);
    writing.handle.moveBlockTo(state.from, state.to, targetPos ?? state.targetFrom, state.depth);
  }

  function onDragMove(event) {
    dragPointer = { x: event.clientX, y: event.clientY };
    if (dragState) dragState.moved = true;
    if (dragFrame) return;
    dragFrame = window.requestAnimationFrame(updateDropTarget);
  }

  function onDragUp(event) {
    event.preventDefault();
    endDrag(true);
  }

  function onDragCancel() {
    endDrag(false);
  }

  function startDrag(event) {
    if (!gutterBlock || !writing.handle) return;
    dragState = {
      from: gutterBlock.from,
      to: gutterBlock.to,
      depth: gutterBlock.depth,
      targetFrom: gutterBlock.from,
      targetLine: gutterBlock.headLine - 1,
      moved: false,
      x: event.clientX,
      y: event.clientY,
    };
    dragPointer = { x: event.clientX, y: event.clientY };
    window.addEventListener("pointermove", onDragMove, true);
    window.addEventListener("pointerup", onDragUp, true);
    window.addEventListener("pointercancel", onDragCancel, true);
  }

  const gutterPointerDown = (event) => {
    const btn = event.target.closest ? event.target.closest('[data-gutter="handle"]') : null;
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    startDrag(event);
  };

  if (articleEl) {
    articleEl.addEventListener("pointerdown", gutterPointerDown);
    articleEl.addEventListener("pointermove", onGutterPointerMove);
    articleEl.addEventListener("pointerleave", scheduleGutterHide);
    // touch = long-press 150ms (docs/08 ข้อ 71) — ไม่มี hover บนมือถือ
    articleEl.addEventListener("touchstart", (event) => {
      if (!writing.handle) return;
      const touch = event.touches[0];
      if (!touch) return;
      const block = blockAtPoint(touch.clientX, touch.clientY);
      if (!block) return;
      longPressTimer = window.setTimeout(() => {
        showGutter(block);
        const handle = document.querySelector('[data-gutter="handle"]');
        if (handle) openBlockMenu(handle);
      }, 150);
    }, { passive: true });
    articleEl.addEventListener("touchend", () => clearTimeout(longPressTimer));
    articleEl.addEventListener("touchmove", () => clearTimeout(longPressTimer));
  }
  let longPressTimer = 0;

  /* ── mark swatch strip (docs/08 ข้อ 6/55) — แถบสีของ ==mark== เมื่อカーอยู่ในช่วง ──
     reuse กลไก pin/ไม่-rebuild ของ block strip เดิม (key ต่อบรรทัด · sync ค่าในที่
     · pin ระหว่างโต้ตอบ) — แผงลูกแยกจาก block strip เพราะ mark อยู่ “ใน” directive ได้
     ทั้งสองแผงจึงแข่งกัน — กฎ: カーอยู่ใน mark = mark bar ชนะ (ตัวเฉพาะจุดกว่า) */
  const MARK_COLORS = ["red", "orange", "amber", "yellow", "green", "teal", "blue", "purple"];
  // ชุดเดียวกับ schema.colors (BLOCK_COLORS — docs/08 ข้อ 30) · ชื่อไทยไว้ทำ aria-label
  const MARK_COLOR_LABELS = {
    red: "แดง",
    orange: "ส้ม",
    amber: "เหลืองอำพัน",
    yellow: "เหลือง",
    green: "เขียว",
    teal: "เขียวอมน้ำเงิน",
    blue: "น้ำเงิน",
    purple: "ม่วง",
  };
  let markKey = null; // ตัวตนของ mark ที่แถบแสดง (บรรทัด) — เปลี่ยน = rebuild
  let markPin = false; // กำลังโต้ตอบกับแถบ — ยังไม่ซ่อนแม้ focus หลุดจาก editor
  let markInfo = null; // info ล่าสุดของ mark ที่カーอยู่ (null = ไม่ได้อยู่ใน mark)

  function markBarEl() {
    let el = document.getElementById("doku-mark-strip");
    if (!el && articleEl) {
      el = document.createElement("div");
      el.id = "doku-mark-strip";
      el.className = "doku-mark-strip";
      el.hidden = true;
      el.addEventListener("focusin", () => {
        markPin = true;
      });
      el.addEventListener("focusout", (event) => {
        if (!el.contains(event.relatedTarget)) markPin = false;
      });
      articleEl.appendChild(el);
    }
    return el;
  }

  function hideMarkBar() {
    markPin = false;
    markKey = null;
    const el = markBarEl();
    if (el) el.hidden = true;
  }

  function syncMarkBar(el, info) {
    // mark เดิม — อัปเดต aria-pressed ในที่ (ไม่ rebuild) · ถ้ากำลังโฟกัสในแถบ อย่าแตะ
    if (el.contains(document.activeElement)) return;
    for (const button of el.querySelectorAll("button")) {
      // ปุ่ม swatch จับคู่ด้วย data-color · ปุ่ม "ไม่ระบุสี" ตรงเมื่อไม่มีสี (null === null)
      const color = button.classList.contains("doku-mark-clear") ? null : button.getAttribute("data-color");
      button.setAttribute("aria-pressed", String(color === info.color));
    }
  }

  function buildMarkBar(el, info, key) {
    el.textContent = "";
    el.setAttribute("data-mark-key", key);
    const name = document.createElement("span");
    name.className = "doku-block-strip-name";
    name.textContent = BLOCK_LABELS.mark;
    el.appendChild(name);
    for (const color of MARK_COLORS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "doku-mark-swatch";
      button.setAttribute("data-color", color);
      button.setAttribute("aria-label", "สีไฮไลต์: " + (MARK_COLOR_LABELS[color] || color));
      button.setAttribute("aria-pressed", String(color === info.color));
      button.addEventListener("click", () => {
        if (writing.handle) writing.handle.patchMark(color);
      });
      el.appendChild(button);
    }
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "doku-mark-clear";
    clear.textContent = "ไม่ระบุสี";
    clear.setAttribute("aria-label", "ไม่ระบุสี (ลบสีของไฮไลต์)");
    clear.setAttribute("aria-pressed", String(!info.color));
    clear.addEventListener("click", () => {
      if (writing.handle) writing.handle.patchMark(null);
    });
    el.appendChild(clear);
    el.hidden = false;
    positionStrip(el, info);
  }

  function renderMarkStrip(info) {
    if (!writing.handle) {
      hideMarkBar();
      return;
    }
    markInfo = info;
    if (!info) {
      // カ์ออกจาก mark — ซ่อน ยกเว้นกำลัง pin (โต้ตอบกับแถบอยู่)
      if (markPin) return;
      hideMarkBar();
      return;
    }
    // อยู่ใน mark → block strip หลบ (กฎ mark-ชนะ — ดูหัวข้อ)
    hideStrip();
    const el = markBarEl();
    if (!el) return;
    const key = "mark@" + info.lineFrom;
    if (!el.hidden && el.getAttribute("data-mark-key") === key) {
      // mark เดิม (patchMark แล้วข้อความเปลี่ยน) — sync สี ไม่ rebuild
      syncMarkBar(el, info);
      positionStrip(el, info);
      return;
    }
    buildMarkBar(el, info, key);
  }

  /* ── command palette ─────────────────────────────────────────────────── */

  let paletteDocs = null;
  let paletteItems = [];
  let paletteIndex = 0;

  function paletteCommands() {
    const commands = [
      { label: "เอกสารใหม่…", hint: "new", run: () => newDoc(currentDirForNew()) },
      { label: "โฟลเดอร์ใหม่…", hint: "folder", run: () => newFolder(currentDirForNew()) },
      { label: "สลับ zen mode", hint: "zen", run: toggleZen },
      { label: "สลับธีม", hint: "theme", run: cycleTheme },
      { label: "ไปที่ trash", hint: "trash", run: () => (window.location.href = "/trash") },
      { label: "ไปที่ styleguide", hint: "styleguide", run: () => (window.location.href = "/styleguide") },
      { label: "หน้าแรก", hint: "home", run: () => (window.location.href = "/") },
    ];
    const current = currentDocPath();
    if (current) {
      commands.unshift({ label: "カーในเอกสารนี้", hint: "edit", run: focusSurface });
      commands.push({ label: "คุณสมบัติเอกสารนี้", hint: "meta", run: () => openMeta(current) });
    }
    return commands;
  }

  function currentDirForNew() {
    const current = currentDocPath();
    return current ? dirname(current) : "";
  }

  function renderPalette(query) {
    const needle = (query || "").trim().toLowerCase();
    const commands = paletteCommands().map((command) => ({
      label: command.label,
      hint: command.hint,
      run: command.run,
    }));
    const docs = (paletteDocs || []).map((doc) => ({
      label: doc.title,
      hint: doc.id,
      run: () => {
        window.location.href = "/d/" + encodePath(doc.id);
      },
    }));
    const all = commands.concat(docs);
    paletteItems = needle
      ? all.filter((item) => (item.label + " " + item.hint).toLowerCase().indexOf(needle) !== -1)
      : all;
    paletteItems = paletteItems.slice(0, 40);
    paletteIndex = 0;
    paletteList.textContent = "";
    if (!paletteItems.length) {
      const empty = document.createElement("p");
      empty.className = "doku-palette-empty";
      empty.textContent = "ไม่พบผลลัพธ์";
      paletteList.appendChild(empty);
      return;
    }
    paletteItems.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "option");
      button.setAttribute("data-active", String(index === 0));
      button.appendChild(document.createTextNode(item.label));
      const hint = document.createElement("span");
      hint.className = "doku-palette-hint";
      hint.textContent = item.hint;
      button.appendChild(hint);
      button.addEventListener("click", () => runPaletteItem(index));
      paletteList.appendChild(button);
    });
  }

  function highlightPalette() {
    const buttons = $$("button", paletteList);
    buttons.forEach((button, index) => {
      button.setAttribute("data-active", String(index === paletteIndex));
    });
    const active = buttons[paletteIndex];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: "nearest" });
  }

  function runPaletteItem(index) {
    const item = paletteItems[index];
    closePalette();
    if (item) item.run();
  }

  function openPalette() {
    paletteEl.hidden = false;
    paletteInput.value = "";
    renderPalette("");
    paletteInput.focus();
    if (!paletteDocs) {
      api("/api/docs")
        .then((result) => {
          paletteDocs = result.docs || [];
          if (!paletteEl.hidden) renderPalette(paletteInput.value);
        })
        .catch(() => {});
    }
  }

  function closePalette() {
    if (paletteEl) paletteEl.hidden = true;
  }

  if (paletteInput) {
    paletteInput.addEventListener("input", () => renderPalette(paletteInput.value));
    paletteInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        paletteIndex = Math.min(paletteIndex + 1, paletteItems.length - 1);
        highlightPalette();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        paletteIndex = Math.max(paletteIndex - 1, 0);
        highlightPalette();
      } else if (event.key === "Enter") {
        event.preventDefault();
        runPaletteItem(paletteIndex);
      }
    });
  }
  if (paletteEl) {
    paletteEl.addEventListener("click", (event) => {
      if (event.target === paletteEl) closePalette();
    });
  }

  /* ── drag & drop ย้ายเอกสาร/โฟลเดอร์ ─────────────────────────────────── */

  let dragging = null;
  let dropTarget = null;

  function clearDropState() {
    if (dropTarget) dropTarget.classList.remove("doku-drop-target");
    dropTarget = null;
    for (const row of $$('[data-dragging="true"]')) row.removeAttribute("data-dragging");
  }

  document.addEventListener("dragstart", (event) => {
    // โหมดแก้ชื่อ (inline rename): ห้ามลากแถวจากช่อง input — เลือกข้อความได้ปกติ
    if (event.target.closest && event.target.closest("[data-renaming]")) {
      event.preventDefault();
      return;
    }
    const row = event.target.closest ? event.target.closest("[data-doc-id], [data-folder-path]") : null;
    if (!row) return;
    const docId = row.getAttribute("data-doc-id");
    const folderPath = row.getAttribute("data-folder-path");
    dragging = docId ? { kind: "doc", path: docId } : { kind: "folder", path: folderPath };
    row.setAttribute("data-dragging", "true");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragging.path);
    }
  });

  document.addEventListener("dragend", clearDropState);

  document.addEventListener("dragover", (event) => {
    if (!dragging) return;
    const drop = event.target.closest ? event.target.closest("[data-drop-folder], [data-drop-root]") : null;
    if (!drop) return;
    event.preventDefault();
    if (drop === dropTarget) return;
    if (dropTarget) dropTarget.classList.remove("doku-drop-target");
    dropTarget = drop;
    dropTarget.classList.add("doku-drop-target");
  });

  document.addEventListener("drop", async (event) => {
    if (!dragging) return;
    const drop = event.target.closest ? event.target.closest("[data-drop-folder], [data-drop-root]") : null;
    if (!drop) {
      clearDropState();
      dragging = null;
      return;
    }
    event.preventDefault();
    const targetDir = drop.getAttribute("data-drop-folder") || "";
    const moving = dragging;
    clearDropState();
    dragging = null;
    const name = basename(moving.path);
    const target = joinPath(targetDir, name);
    if (target === moving.path || moving.path.indexOf(target + "/") === 0) return;
    if (moving.kind === "folder" && (targetDir === moving.path || targetDir.indexOf(moving.path + "/") === 0)) {
      toast("ย้ายโฟลเดอร์เข้าไปในตัวเองไม่ได้", "error");
      return;
    }
    if (dirname(moving.path) === targetDir) return;
    try {
      if (moving.kind === "doc") {
        await jsonRequest("POST", "/api/docs/" + encodePath(moving.path) + "/move", { to: target });
      } else {
        await jsonRequest("POST", "/api/folders/" + encodePath(moving.path) + "/move", { to: target });
      }
      toast("ย้ายแล้ว: " + target);
      reload();
    } catch (error) {
      fail(error);
    }
  });

  /* ── dblclick เปลี่ยนชื่อในแถว (inline — ไม่ใช้ prompt) ───────────────── */

  document.addEventListener("dblclick", (event) => {
    // คลิกใน editor = CM6 จัดการ — ห้าม rename ซ้อนกับカー/selection
    if (writing.mounted && writing.mounted.contains(event.target)) return;
    const target = event.target;
    if (!target.closest) return;
    // โฟลเดอร์: dblclick เฉพาะช่วงข้อความ label — ไม่รวม caret/menu (ปุ่ม)
    const summary = target.closest(".doku-folder-summary");
    if (summary) {
      if (target.closest("button, .tree-caret")) return;
      const label = target.closest(".truncate") || summary.querySelector(".truncate");
      startInlineRename("folder", summary.getAttribute("data-drop-folder") || "", label);
      return;
    }
    // เอกสาร: dblclick เฉพาะลิงก์ active — แถวอื่นคลิกเดียวไปหน้านั้นตามเดิม
    const link = target.closest("a[data-doc-link]");
    if (link && link.classList.contains("is-active")) {
      startInlineRename("doc", link.getAttribute("data-doc-link") || "", link);
    }
  });

  document.addEventListener("click", (event) => {
    // dblclick = คลิกครั้งที่สองต้องไม่ toggle summary (กันโฟลเดอร์สั่นก่อนเข้าโหมดแก้)
    const summary = event.target.closest ? event.target.closest(".doku-folder-summary") : null;
    if (
      summary &&
      event.detail === 2 &&
      !(event.target.closest && event.target.closest("button, .tree-caret"))
    ) {
      event.preventDefault();
    }
  });

  /* ── trash ───────────────────────────────────────────────────────────── */

  async function restoreTrash(id) {
    try {
      await api("/api/trash/" + encodePath(id) + "/restore", { method: "POST" });
      toast("กู้คืนแล้ว");
      reload();
    } catch (error) {
      fail(error);
    }
  }

  async function emptyTrash() {
    if (!window.confirm("ล้าง trash ทั้งหมด? กู้คืนไม่ได้")) return;
    if (!window.confirm("ยืนยันอีกครั้ง: ลบถาวรทุกอย่างใน trash")) return;
    try {
      const result = await api("/api/trash/empty", { method: "POST" });
      toast("ล้าง trash แล้ว (" + result.removed + " รายการ)");
      reload();
    } catch (error) {
      fail(error);
    }
  }

  /* ── TOC (คอลัมน์ sticky + แผ่นจอแคบ) — docs/08 ข้อ 49 ────────────────── */

  const tocLinks = $$("[data-toc-link]");
  const tocTargets = $$("article .doku-prose :is(h2, h3, h4)").filter((el) => el.id);
  const tocLinksById = new Map();
  for (const link of tocLinks) {
    const id = link.getAttribute("data-toc-link");
    if (!id) continue;
    if (!tocLinksById.has(id)) tocLinksById.set(id, []);
    tocLinksById.get(id).push(link);
  }

  function setActiveToc(id) {
    for (const link of tocLinks) link.removeAttribute("aria-current");
    for (const link of tocLinksById.get(id) || []) link.setAttribute("aria-current", "true");
  }

  /** カーไปหัวข้อ — โหมดอ่านใช้ anchor เดิม · โหมด editor ใช้ heading map (ไม่มี id ใน CM6 DOM) */
  function goToHeading(id) {
    if (writing.handle && scrollToHeading(id)) {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", "#" + encodeURI(id));
      }
      setActiveToc(id);
      return;
    }
    const target = document.getElementById(id);
    if (target) target.scrollIntoView();
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest ? event.target.closest("[data-toc-link]") : null;
    if (!link) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    goToHeading(link.getAttribute("data-toc-link"));
    if (tocSheetEl) tocSheetEl.hidden = true;
  });

  /** active = หัวข้อสุดท้ายที่อยู่เหนือเส้น 96px — ใช้ได้ทั้งโหมดอ่านและโหมด editor
   *  (โหมด editor หัวข้อเป็น .cm-line ไม่มี id → ใช้ offset จาก heading map) */
  let tocActiveFrame = 0;
  function updateActiveToc() {
    tocActiveFrame = 0;
    if (!tocLinks.length) return;
    let current = null;
    if (writing.handle && headingPositions) {
      for (const [id, pos] of headingPositions) {
        const coords = writing.handle.coordsAt(pos);
        if (coords && coords.top <= 96) current = id;
      }
    } else {
      for (const heading of tocTargets) {
        if (!heading.isConnected) continue;
        if (heading.getBoundingClientRect().top <= 96) current = heading.id;
        else break;
      }
    }
    if (current) setActiveToc(current);
  }
  function scheduleActiveToc() {
    if (tocActiveFrame) return;
    tocActiveFrame = window.requestAnimationFrame(updateActiveToc);
  }
  if (tocLinks.length && tocTargets.length) {
    window.addEventListener("scroll", scheduleActiveToc, true);
    window.addEventListener("resize", scheduleActiveToc);
    scheduleActiveToc();
  }

  /* ── action router ───────────────────────────────────────────────────── */

  function rowMenu(anchor) {
    const kind = anchor.getAttribute("data-kind");
    const path = anchor.getAttribute("data-path");
    const label = anchor.getAttribute("data-label") || path;
    if (kind === "doc") {
      openMenu(anchor, label, [
        { label: "เปิด", run: () => (window.location.href = "/d/" + encodePath(path)) },
        {
          label: "แก้ไข",
          run: () => {
            if (currentDocPath() === path) focusSurface();
            else window.location.href = "/d/" + encodePath(path);
          },
        },
        { label: "เปลี่ยนชื่อ", run: () => renameDoc(path) },
        { label: "ย้าย…", run: () => moveDoc(path) },
        { label: "คัดลอกลิงก์", run: () => copyDocLink(path) },
        { separator: true },
        { label: "คุณสมบัติ", run: () => openMeta(path) },
        { label: "ประวัติ", run: () => openHistory(path, anchor) },
        { separator: true },
        { label: "ย้ายไป trash", danger: true, run: () => deleteDoc(path) },
      ]);
      return;
    }
    openMenu(anchor, label, [
      { label: "เอกสารใหม่ในโฟลเดอร์นี้", run: () => newDoc(path) },
      { label: "โฟลเดอร์ย่อยใหม่", run: () => newFolder(path) },
      { separator: true },
      {
        label: "เปลี่ยนชื่อ",
        run: () => {
          // inline editor ใน summary (แทน prompt) — แก้เฉพาะข้อความ label
          const row = $('[data-folder-path="' + CSS.escape(path) + '"]');
          const label = row ? row.querySelector(".doku-folder-summary .truncate") : null;
          if (label) startInlineRename("folder", path, label);
        },
      },
      { label: "ย้าย…", run: () => moveFolder(path) },
      { label: "ตั้งค่าโฟลเดอร์", run: () => openFolderSettings(path) },
      { separator: true },
      { label: "ย้ายไป trash", danger: true, run: () => deleteFolder(path) },
    ]);
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest ? event.target.closest("[data-action]") : null;
    if (!trigger) return;
    const action = trigger.getAttribute("data-action");
    const path = trigger.getAttribute("data-path");
    switch (action) {
      case "palette":
        event.preventDefault();
        openPalette();
        break;
      case "row-menu":
        event.preventDefault();
        rowMenu(trigger);
        break;
      case "doc-menu":
        event.preventDefault();
        rowMenu(trigger);
        break;
      case "toc-sheet":
        event.preventDefault();
        if (tocSheetEl) tocSheetEl.hidden = false;
        break;
      case "toc-close":
        if (tocSheetEl) tocSheetEl.hidden = true;
        break;
      case "cycle-theme":
        cycleTheme();
        break;
      case "zen":
        toggleZen();
        break;
      case "edit":
        focusSurface();
        break;
      case "meta":
        if (path) openMeta(path);
        break;
      case "history":
        if (path) openHistory(path, trigger);
        break;
      case "move":
        if (path) moveDoc(path);
        break;
      case "delete":
        if (path) deleteDoc(path);
        break;
      case "new-doc":
        newDoc(trigger.getAttribute("data-dir") || "");
        break;
      case "new-folder":
        newFolder(trigger.getAttribute("data-dir") || "");
        break;
      case "meta-close":
        if (metaPanel) metaPanel.hidden = true;
        break;
      case "folder-close":
        folderOverlay.hidden = true;
        break;

      case "restore":
        restoreTrash(trigger.getAttribute("data-trash-id"));
        break;
      case "empty-trash":
        emptyTrash();
        break;
      default:
        break;
    }
  });

  // คลิกพื้นหลัง = ปิด (เหมือน overlay อื่น) — รวมแผ่น TOC ของจอแคบ
  for (const overlay of [folderOverlay, tocSheetEl]) {
    if (!overlay) continue;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.hidden = true;
    });
  }

  /* ── keyboard ────────────────────────────────────────────────────────── */

  document.addEventListener("keydown", (event) => {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (paletteEl.hidden) openPalette();
      else closePalette();
      return;
    }
    if (meta && event.key.toLowerCase() === "e") {
      if (currentDocPath()) {
        event.preventDefault();
        focusSurface();
      }
      return;
    }
    if (meta && event.key.toLowerCase() === "s") {
      if (writing.handle || writing.textarea) {
        event.preventDefault();
        flushSave(true);
      }
      return;
    }
    if (event.key === "Escape") {
      if (!menuEl.hidden) closeMenu();
      else if (tocSheetEl && !tocSheetEl.hidden) tocSheetEl.hidden = true;
      else if (!paletteEl.hidden) closePalette();
      else if (metaPanel && !metaPanel.hidden) metaPanel.hidden = true;
      else if (!folderOverlay.hidden) folderOverlay.hidden = true;
      else if (writing.mounted && writing.mounted.contains(document.activeElement)) {
        // カーออกจากเอกสาร → คีย์ลัดของ chrome กลับมาทำงาน (docs/08 ข้อ 54)
        if (writing.handle) writing.handle.blur();
        else document.activeElement.blur();
      }
    }
  });

  /* ── boot: mount editor ทับคอลัมน์อ่านครั้งเดียวตอน idle (docs/08 ข้อ 65) ───
     mount เฉพาะหน้าเอกสาร (home/trash/styleguide ไม่มี payload) — ก่อน mount
     ผู้ใช้ยังอ่าน HTML จาก server ได้ครบ (no-JS parity) */

  if (articleEl && bodyEl && embeddedEl) {
    const boot = () => {
      void mountSurface();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(boot, { timeout: 1200 });
    } else {
      window.setTimeout(boot, 0);
    }
  }
})();
`
