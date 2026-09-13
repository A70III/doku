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
  const metaOverlay = $("#doku-meta-overlay");
  const metaForm = $("#doku-meta-form");
  const metaStatus = $("#doku-meta-status");
  const folderOverlay = $("#doku-folder-overlay");
  const folderForm = $("#doku-folder-form");
  const folderStatus = $("#doku-folder-status");
  const editorEl = $("#doku-editor");
  const editorSource = $("#doku-editor-source");
  const editorPreview = $("#doku-editor-preview");
  const editorPathLabel = $("#doku-editor-path");
  const editorStatusLabel = $("#doku-editor-status");
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
      metaOverlay.hidden = false;
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

  /* ── editor (CodeMirror 6 + live preview — docs/08 ข้อ 17) ───────────── */

  const editor = { path: null, etag: null, handle: null, dirty: false, saved: false, timer: 0, preview: true };

  function editorText() {
    if (editor.handle) return editor.handle.getDoc();
    const textarea = $("textarea[data-editor-fallback]", editorSource);
    return textarea ? textarea.value : "";
  }

  function setEditorStatus(state, text) {
    if (!editorStatusLabel) return;
    editorStatusLabel.setAttribute("data-state", state);
    editorStatusLabel.textContent = text;
  }

  function renderPreview(markdown) {
    if (!editor.preview) return;
    clearTimeout(editor.timer);
    editor.timer = setTimeout(async () => {
      try {
        const result = await jsonRequest("POST", "/api/render", { md: markdown, path: editor.path });
        editorPreview.innerHTML = result.html;
      } catch {}
    }, 320);
  }

  function mountEditor(markdown) {
    editorSource.textContent = "";
    if (window.DokuEditor) {
      editorSource.removeAttribute("data-fallback");
      editor.handle = window.DokuEditor.create(editorSource, {
        doc: markdown,
        placeholder: "# เริ่มเขียน…",
        onChange: (value) => {
          editor.dirty = true;
          setEditorStatus("dirty", "ยังไม่บันทึก");
          renderPreview(value);
        },
        onSave: () => saveEditor(),
      });
      editor.handle.focus();
      return;
    }
    // fallback: ไม่มี bundle (ยังไม่รัน build:editor) — ใช้ textarea ธรรมดา
    editorSource.setAttribute("data-fallback", "1");
    const textarea = document.createElement("textarea");
    textarea.setAttribute("data-editor-fallback", "1");
    textarea.className = "doku-editor-fallback";
    textarea.value = markdown;
    textarea.addEventListener("input", () => {
      editor.dirty = true;
      setEditorStatus("dirty", "ยังไม่บันทึก");
      renderPreview(textarea.value);
    });
    editorSource.appendChild(textarea);
    textarea.focus();
  }

  async function openEditor(id) {
    try {
      const doc = await api("/api/docs/" + encodePath(id));
      editor.path = id;
      editor.etag = doc.etag;
      editor.dirty = false;
      editor.saved = false;
      editorEl.hidden = false;
      editorEl.setAttribute("data-preview", "on");
      editor.preview = true;
      docEl.setAttribute("data-editing", "1");
      editorPathLabel.textContent = id;
      setEditorStatus("clean", "บันทึกแล้ว");
      mountEditor(doc.md);
      renderPreview(doc.md);
    } catch (error) {
      fail(error);
    }
  }

  async function saveEditor() {
    if (!editor.path) return;
    try {
      const result = await jsonRequest(
        "PUT",
        "/api/docs/" + encodePath(editor.path),
        { md: editorText() },
        { "if-match": '"' + editor.etag + '"' },
      );
      editor.etag = result.etag;
      editor.dirty = false;
      editor.saved = true;
      setEditorStatus("clean", "บันทึกแล้ว");
      toast("บันทึกแล้ว", "ok");
    } catch (error) {
      if (error.status === 409) {
        setEditorStatus("error", "ถูกแก้จากที่อื่น");
        toast("เอกสารถูกแก้จากที่อื่น — โหลดเนื้อหาล่าสุดแล้ว", "error");
        try {
          const latest = await api("/api/docs/" + encodePath(editor.path));
          editor.etag = latest.etag;
          if (editor.handle) editor.handle.setDoc(latest.md);
          renderPreview(latest.md);
        } catch {}
        return;
      }
      setEditorStatus("error", error.message);
      fail(error);
    }
  }

  function closeEditor(force) {
    if (!force && editor.dirty && !window.confirm("ปิดโดยไม่บันทึก?")) return;
    if (editor.handle) {
      editor.handle.destroy();
      editor.handle = null;
    }
    const textarea = $("textarea[data-editor-fallback]", editorSource);
    if (textarea) textarea.remove();
    editorSource.textContent = "";
    editorEl.hidden = true;
    docEl.removeAttribute("data-editing");
    const wasSaved = editor.saved;
    editor.path = null;
    editor.dirty = false;
    if (wasSaved) reload();
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
      commands.unshift({ label: "แก้ไขเอกสารนี้", hint: "edit", run: () => openEditor(current) });
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
        { label: "แก้ไข", run: () => openEditor(path) },
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
        if (path) openEditor(path);
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
        metaOverlay.hidden = true;
        break;
      case "folder-close":
        folderOverlay.hidden = true;
        break;
      case "editor-save":
        saveEditor();
        break;
      case "editor-close":
        closeEditor(false);
        break;
      case "editor-preview": {
        editor.preview = !editor.preview;
        editorEl.setAttribute("data-preview", editor.preview ? "on" : "off");
        if (editor.preview) renderPreview(editorText());
        break;
      }
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

  for (const overlay of [metaOverlay, folderOverlay]) {
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
      const current = currentDocPath();
      if (current && editorEl.hidden) {
        event.preventDefault();
        openEditor(current);
      }
      return;
    }
    if (meta && event.key.toLowerCase() === "s" && !editorEl.hidden) {
      event.preventDefault();
      saveEditor();
      return;
    }
    if (event.key === "Escape") {
      if (!menuEl.hidden) closeMenu();
      else if (tocSheetEl && !tocSheetEl.hidden) tocSheetEl.hidden = true;
      else if (!paletteEl.hidden) closePalette();
      else if (!metaOverlay.hidden) metaOverlay.hidden = true;
      else if (!folderOverlay.hidden) folderOverlay.hidden = true;
      else if (!editorEl.hidden) closeEditor(false);
    }
  });
})();
`
