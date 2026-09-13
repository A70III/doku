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
    // ── การออกจากโหมดเขียน (docs/08 ข้อ 52/54) — 3 วง ──
    // วงใน = tolerance zone รอบคอลัมน์อ่าน (~3rem): คลิกเยื้องนิดเดียวต้องไม่เด้งออก
    //   → ส่ง focus กลับ editor แทน (จิ้มพลาด = พิมพ์ต่อได้)
    // วงกลาง = พื้นหลังเปล่า (neutral gutter): ไม่ทำอะไร อยู่ต่อ
    // วงนอก = chrome ที่มีความหมาย (rail / TOC คอลัมน์+แผ่น / เมนู): ออกจริง
    // วัดด้วยพิกัด event กับ rect เสมอ — กันเคส element ถูกแทนที่ระหว่างคลิก
    // (เดิมใช้ isConnected guard + contains → คลิกหลุดกรอบคอลัมน์นิดเดียวก็ออกทันที)
    if (!writing.editing || !articleEl || !articleEl.isConnected) return;
    const strip = stripEl();
    const mark = markBarEl();
    if (strip && !strip.hidden && (strip.contains(event.target) || inRect(strip, event, 4))) {
      return; // โต้ตอบกับแผงควบคุม block — ห้ามโฟกัสกลับ editor ทับ interaction
    }
    if (mark && !mark.hidden && (mark.contains(event.target) || inRect(mark, event, 4))) {
      return; // โต้ตอบกับแถบ swatch ของ mark — ห้ามโฟกัสกลับ editor ทับ interaction
    }
    const rect = articleEl.getBoundingClientRect();
    const pad = 48; // ~3rem
    const inTolerance =
      event.clientX >= rect.left - pad &&
      event.clientX <= rect.right + pad &&
      event.clientY >= rect.top - pad &&
      event.clientY <= rect.bottom + pad;
    if (inTolerance) {
      const hit = event.target.closest
        ? event.target.closest("a, button, input, select, textarea, summary")
        : null;
      if (!hit && writing.handle) writing.handle.focus();
      return;
    }
    const chrome = event.target.closest
      ? event.target.closest(".doku-rail, .doku-toc-col, .doku-overlay, .doku-menu")
      : null;
    if (chrome) void exitWriting();
    // นอกนั้น = พื้นหลังเปล่า → อยู่ต่อ ไม่ออกจากโหมดเขียน
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
    const name = window.prompt("ชื่อใหม่ (ไม่ต้องมี .md)", basename(id));
    if (!name || name === basename(id)) return;
    const target = joinPath(dirname(id), name.trim());
    await moveDoc(id, target);
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

  /* ── writing surface: พิมพ์ได้ทันทีในคอลัมน์เดิม (docs/08 ข้อ 52/54) ──────
     ไม่มีปุ่ม/โหมดแก้ไข · ไม่มี overlay · ไม่มี split · ไม่มีปุ่ม Save
     เอกสารที่ render แล้วคือ editor — คลิกที่ไหนカーไปที่นั่น · autosave ตาม debounce */

  const writing = {
    path: null,
    etag: null,
    handle: null,
    textarea: null,
    mounted: null,
    dirty: false,
    editing: false,
    timer: 0,
    schema: null,
  };

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

  /** หา offset ใน markdown จาก element ที่ผู้ใช้คลิก (จับข้อความต้น block แล้วค้นหา) */
  function offsetForElement(md, target) {
    if (!target || !target.closest) return null;
    const block = target.closest("p, li, h1, h2, h3, h4, h5, h6, pre, aside, figure, blockquote, td");
    const text = (block ? block.textContent : "").trim().slice(0, 32);
    if (!text) return null;
    const index = md.indexOf(text);
    return index >= 0 ? index : null;
  }

  function isInteractiveTarget(target) {
    return Boolean(
      target.closest &&
        target.closest(
          "a, button, summary, input, select, textarea, [data-part='copy-code'], [data-part='tab-button'], [data-block='figure'][data-zoom], .doku-doc-meta",
        ),
    );
  }

  function mountWritingSurface(md, anchor, slashItems) {
    const host = document.createElement("div");
    host.className = "doku-inline-editor";
    bodyEl.textContent = "";
    bodyEl.appendChild(host);
    writing.mounted = host;

    if (window.DokuEditor) {
      writing.handle = window.DokuEditor.create(host, {
        doc: md,
        anchor,
        placeholder: "เริ่มเขียน… (พิมพ์ / เพื่อแทรก block)",
        resolveAsset: makeAssetResolver(writing.path),
        slashItems,
        onDirective: (info) => renderDirectiveStrip(info),
        onMark: (info) => renderMarkStrip(info),
        onChange: () => {
          writing.dirty = true;
          setDocStatus("dirty", "กำลังบันทึก…");
          scheduleSave();
        },
        onSave: () => flushSave(true),
      });
      // ให้カーอยู่ในเอกสารจริง ๆ หลัง click default action ของเบราว์เซอร์ทำงานจบ
      // (ไม่ผูกการออกกับ blur: คลิกนอกเอกสาร/Esc ดูแล — เหมือน Notion, autosave ทำงานตลอด)
      window.setTimeout(() => writing.handle && writing.handle.focus(), 0);
      return;
    }

    // fallback: ยังไม่ build editor.js — textarea ธรรมดา (docs/08 ข้อ 37)
    const textarea = document.createElement("textarea");
    textarea.className = "doku-inline-textarea";
    textarea.value = md;
    textarea.setAttribute("aria-label", "markdown");
    textarea.addEventListener("input", () => {
      writing.dirty = true;
      setDocStatus("dirty", "กำลังบันทึก…");
      scheduleSave();
    });
    host.appendChild(textarea);
    writing.textarea = textarea;
    window.setTimeout(() => textarea.focus(), 0);
  }

  async function enterWriting(anchor) {
    if (writing.editing || !articleEl || !bodyEl) return;
    const payload = readEmbedded();
    if (!payload) return;
    const schema = await loadSchema();
    writing.schema = schema;
    writing.path = articleEl.getAttribute("data-doc-id");
    writing.etag = payload.etag || null;
    writing.editing = true;
    writing.dirty = false;
    articleEl.setAttribute("data-editing", "1");
    // ไฟล์ที่ขึ้นต้นด้วย # h1 = ชื่อเรื่องอยู่ในเนื้อหา → editor จะโชว์บรรทัดนั้นเป็นชื่อเรื่อง
    // ซ่อนชื่อเรื่องที่ header ระหว่างเขียน ไม่งั้นเห็นชื่อซ้ำสองที่ (dedupe ตอน render อยู่นอกไฟล์)
    if (/^\\s*#\\s+\\S/.test(payload.md)) docEl.setAttribute("data-title-in-body", "1");
    else docEl.removeAttribute("data-title-in-body");
    // SSE guard อ่านจาก <html> (ดู listener ด้านบน) — ต้องตั้งทั้งสองที่
    // ไม่งั้น autosave ที่เราเขียนเองจะ trigger watcher → SSE → reload กลางการพิมพ์
    docEl.setAttribute("data-editing", "1");
    setDocStatus("clean", "พร้อมแก้ไข");
    mountWritingSurface(payload.md, offsetForElement(payload.md, anchor), buildSlashItems(schema));
  }

  function writeSnapshot() {
    const text = currentText();
    if (writing.handle) {
      writing.handle.destroy();
      writing.handle = null;
    }
    if (writing.textarea) writing.textarea = null;
    if (writing.mounted) writing.mounted.remove();
    writing.mounted = null;
    return text;
  }

  function teardownWriting() {
    hideStrip(); // ตัดสินที่ hideStrip ตรง ๆ — ไม่ผ่าน renderDirectiveStrip (pin ไม่รอดออกจากโหมดเขียน)
    hideMarkBar(); // เช่นเดียวกับ mark swatch strip
    writing.editing = false;
    writing.path = null;
    writing.dirty = false;
    clearTimeout(writing.timer);
    if (articleEl) articleEl.removeAttribute("data-editing");
    docEl.removeAttribute("data-editing");
    docEl.removeAttribute("data-title-in-body");
    setDocStatus("clean", "");
  }

  async function renderFragment(md) {
    const result = await jsonRequest("POST", "/api/render", { md, path: writing.path });
    return result;
  }

  /** ชื่อเรื่อง/สรุป อยู่ที่ header นอกส่วนที่แก้ — อัปเดตจาก meta ที่ server คืนมา */
  function syncHeader(meta) {
    if (!meta) return;
    const title = document.querySelector(".doku-doc-title");
    if (title && meta.title) title.textContent = meta.title;
    const lede = document.querySelector(".doku-doc-lede");
    const summary = meta.summary || "";
    if (lede) {
      if (summary) lede.textContent = summary;
      else lede.remove();
    } else if (summary) {
      const header = document.querySelector(".doku-doc-header");
      const paragraph = document.createElement("p");
      paragraph.className = "doku-doc-lede";
      paragraph.textContent = summary;
      title?.insertAdjacentElement("afterend", paragraph);
      void header;
    }
    const colophon = document.querySelector(".doku-colophon");
    if (colophon && meta.title) colophon.setAttribute("data-title", meta.title);
  }

  /** วาด HTML กลับเข้าที่เดิม + sync TOC/colophon ให้ตรงกับเนื้อหาใหม่ */
  async function paintRendered(md) {
    const result = await renderFragment(md);
    bodyEl.innerHTML = result.html;
    syncHeader(result.meta);
    syncTocFromBody();
    const colophon = $(".doku-colophon");
    if (colophon) {
      const words = md.trim().split(/s+/u).filter(Boolean).length;
      const node = colophon.querySelector("[data-part='colophon-words']");
      if (node) node.textContent = words.toLocaleString("th-TH") + " คำ";
    }
    return html;
  }

  function syncTocFromBody() {
    const links = $$("[data-toc-link]");
    if (!links.length) return;
    const headings = $$("article .doku-prose :is(h2, h3, h4)").filter((el) => el.id);
    const list = links[0].closest("ul");
    if (!list) return;
    list.textContent = "";
    for (const heading of headings) {
      const li = document.createElement("li");
      li.className = "doku-toc-h" + heading.tagName.slice(1);
      const link = document.createElement("a");
      link.href = "#" + heading.id;
      link.setAttribute("data-toc-link", heading.id);
      link.textContent = heading.textContent || "";
      li.appendChild(link);
      list.appendChild(li);
    }
  }

  function scheduleSave() {
    clearTimeout(writing.timer);
    writing.timer = setTimeout(() => flushSave(false), 800);
  }

  /** autosave · If-Match · 409 = ให้คนเลือก (ไม่ทับเงียบ — docs/08 ข้อ 54) */
  async function flushSave(explicit) {
    if (!writing.editing || !writing.dirty) {
      if (explicit) setDocStatus("clean", "");
      return;
    }
    const md = currentText();
    writing.dirty = false;
    try {
      const result = await jsonRequest(
        "PUT",
        "/api/docs/" + encodePath(writing.path),
        { md },
        writing.etag ? { "if-match": '"' + writing.etag + '"' } : undefined,
      );
      if (result && result.etag) writing.etag = result.etag;
      setDocStatus("clean", "");
    } catch (error) {
      writing.dirty = true;
      if (error.status === 409) {
        const force = window.confirm(
          "เอกสารถูกแก้จากที่อื่นหลังคุณเปิดหน้านี้\\n\\nเขียนทับด้วยเวอร์ชันของคุณหรือไม่?" +
            "\\n(ยกเลิก = เก็บงานของคุณไว้ก่อน ยังไม่เขียนทับ)",
        );
        if (error.etag) writing.etag = error.etag;
        if (force) {
          setDocStatus("dirty", "กำลังบันทึก…");
          await flushSave(true);
          return;
        }
        setDocStatus("error", "ถูกแก้จากที่อื่น");
        return;
      }
      setDocStatus("error", "บันทึกไม่สำเร็จ");
      fail(error);
    }
  }

  async function exitWriting() {
    if (!writing.editing) return;
    clearTimeout(writing.timer);
    await flushSave(true);
    const md = writeSnapshot();
    teardownWriting();
    try {
      await paintRendered(md);
    } catch (error) {
      fail(error);
      reload();
    }
  }

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
    if (!writing.editing) {
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
    if (!writing.editing) return;
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

  /* ── เข้าโหมดเขียนด้วยการคลิกที่เอกสาร (Notion-like — docs/08 ข้อ 52) ──── */

  if (articleEl && bodyEl) {
    articleEl.addEventListener("click", (event) => {
      if (writing.editing) return;
      const metaLine = event.target.closest ? event.target.closest(".doku-doc-meta") : null;
      if (metaLine) {
        event.preventDefault();
        openMeta(currentDocPath());
        return;
      }
      if (isInteractiveTarget(event.target)) return;
      const selection = window.getSelection ? window.getSelection().toString() : "";
      if (selection) return; // กําลังเลือกข้อความอยู่ ไม่ต้องเข้าโหมดเขียน
      event.preventDefault();
      void enterWriting(event.target);
    });
    // a11y: เข้าโหมดเขียนด้วยคีย์บอร์ด (โฟกัสที่เอกสาร + Enter/Space)
    articleEl.setAttribute("tabindex", "-1");
  }

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
    if (!writing.editing) {
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
      commands.unshift({ label: "แก้เอกสารนี้", hint: "edit", run: () => enterWriting(null) });
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
  if (tocLinks.length && tocTargets.length && "IntersectionObserver" in window) {
    const linksById = new Map();
    for (const link of tocLinks) {
      const id = link.getAttribute("data-toc-link");
      if (!linksById.has(id)) linksById.set(id, []);
      linksById.get(id).push(link);
    }
    const visible = new Set();
    const setActive = (id) => {
      for (const link of tocLinks) link.removeAttribute("aria-current");
      for (const link of linksById.get(id) || []) link.setAttribute("aria-current", "true");
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const current = tocTargets.find((heading) => visible.has(heading.id));
        if (current) setActive(current.id);
      },
      { rootMargin: "-10% 0px -80% 0px" },
    );
    for (const heading of tocTargets) observer.observe(heading);
    if (tocSheetEl) {
      tocSheetEl.addEventListener("click", (event) => {
        if (event.target.closest("[data-toc-link]")) tocSheetEl.hidden = true;
      });
    }
    setActive(tocTargets[0].id);
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
            if (currentDocPath() === path) enterWriting(null);
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
          const name = window.prompt("ชื่อใหม่", basename(path));
          if (name && name.trim()) moveFolder(path, joinPath(dirname(path), name.trim()));
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
        enterWriting(null);
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
      if (currentDocPath() && !writing.editing) {
        event.preventDefault();
        enterWriting(null);
      }
      return;
    }
    if (meta && event.key.toLowerCase() === "s") {
      if (writing.editing) {
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
      else if (writing.editing) exitWriting();
    }
  });
})();
`
