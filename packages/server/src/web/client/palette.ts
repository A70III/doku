/**
 * client JS — command palette · drag & drop · dblclick
 *
 * ⚠️ ไฟล์นี้เป็น "ข้อความ JS" (template string) ไม่ใช่โค้ดที่รันตรง ๆ:
 * ทั้งหมดถูกต่อกันใน `client/index.ts` แล้วเสิร์ฟเป็น `/static/client.js`
 * — แก้ที่นี่ได้ แต่ต้องคง syntax ของ JS ข้างในให้ถูก (มี test ตรวจ CLIENT_JS)
 */
export const PALETTE_JS = `  /* ── command palette ─────────────────────────────────────────────────── */

  let paletteDocs = null;
  let paletteItems = [];
  let paletteIndex = 0;
  // ผล FTS จาก /api/search (M5) — เก็บล่าสุดที่พิมพ์ + seq กันคำตอบหลัง (stale)
  let paletteSearchHits = [];
  let paletteSearchTimer = null;
  let paletteSearchSeq = 0;

  function paletteCommands() {
    const commands = [
      { label: "เอกสารใหม่…", hint: "new", icon: "file-plus-2", run: () => newDoc(currentDirForNew()) },
      { label: "โฟลเดอร์ใหม่…", hint: "folder", icon: "folder-plus", run: () => newFolder(currentDirForNew()) },
      { label: "สลับ zen mode", hint: "zen", icon: "maximize-2", run: toggleZen },
      { label: "สลับธีม", hint: "theme", icon: "moon", run: cycleTheme },
      { label: "คีย์ลัดทั้งหมด", hint: "keys", icon: "command", run: () => { if (keysEl) keysEl.hidden = false; } },
      { label: "ไปที่ trash", hint: "trash", icon: "trash-2", run: () => (window.location.href = "/trash") },
      { label: "ไปที่ styleguide", hint: "styleguide", icon: "palette", run: () => (window.location.href = "/styleguide") },
      { label: "หน้าแรก", hint: "home", icon: "house", run: () => (window.location.href = "/") },
    ];
    const current = currentDocPath();
    if (current) {
      commands.unshift({ label: "แก้เอกสารนี้", hint: "edit", icon: "pencil", run: () => enterWriting(null) });
      commands.push({ label: "คุณสมบัติเอกสารนี้", hint: "meta", icon: "info", run: () => openMeta(current) });
    }
    return commands;
  }

  function currentDirForNew() {
    const current = currentDocPath();
    return current ? dirname(current) : "";
  }

  // ค้นเนื้อหาเต็มรูปแบบผ่าน FTS (GET /api/search) — debounce 200ms · query ถูกแทนที่ = เมินคำตอบเก่า
  function schedulePaletteSearch(query) {
    const needle = (query || "").trim();
    if (paletteSearchTimer) clearTimeout(paletteSearchTimer);
    if (needle.length < 2) {
      paletteSearchHits = [];
      return;
    }
    const seq = ++paletteSearchSeq;
    paletteSearchTimer = setTimeout(() => {
      api("/api/search?q=" + encodeURIComponent(needle) + "&limit=12")
        .then((result) => {
          if (seq !== paletteSearchSeq) return;
          paletteSearchHits = result && Array.isArray(result.hits) ? result.hits : [];
          renderPalette(paletteInput.value);
        })
        .catch(() => {
          if (seq !== paletteSearchSeq) return;
          paletteSearchHits = [];
        });
    }, 200);
  }

  /** ไอคอนของแถว — อ้าง <symbol> ที่ layout เรนเดอร์ไว้ (ไม่ต้องฝัง SVG ซ้ำทุกแถว) */
  function paletteIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "doku-palette-icon");
    svg.setAttribute("width", "15");
    svg.setAttribute("height", "15");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#ic-" + (name || "file-text"));
    svg.appendChild(use);
    return svg;
  }

  function renderPalette(query) {
    const needle = (query || "").trim().toLowerCase();
    const commands = paletteCommands().map((command) => ({
      label: command.label,
      hint: command.hint,
      icon: command.icon || "command",
      run: command.run,
    }));
    const docs = (paletteDocs || []).map((doc) => ({
      label: doc.title,
      hint: doc.id,
      icon: "file-text",
      tags: Array.isArray(doc.tags) ? doc.tags.join(" ") : "",
      run: () => {
        window.location.href = "/d/" + encodePath(doc.id);
      },
    }));
    const all = commands.concat(docs);
    let items = needle
      ? all.filter(
          (item) =>
            (item.label + " " + item.hint + " " + (item.tags || "")).toLowerCase().indexOf(needle) !== -1,
        )
      : all;
    // ผล FTS (ค้นจากเนื้อหาในไฟล์ได้ ไม่ใช่แค่ชื่อ/แท็ก) แทรกหน้าสุด + dedup กับที่ local match แล้ว (M5)
    if (needle && paletteSearchHits.length) {
      const seen = new Set(items.map((item) => item.hint));
      const fromSearch = paletteSearchHits
        .filter((hit) => hit && hit.path && !seen.has(hit.path))
        .map((hit) => ({
          label: hit.title || hit.path,
          hint: hit.path,
          icon: "search",
          tags: "",
          run: () => {
            window.location.href = "/d/" + encodePath(hit.path);
          },
        }));
      items = fromSearch.concat(items);
    }
    paletteItems = items.slice(0, 40);
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
      button.appendChild(paletteIcon(item.icon));
      const label = document.createElement("span");
      label.className = "doku-palette-label";
      label.textContent = item.label;
      button.appendChild(label);
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
    paletteInput.addEventListener("input", () => {
      schedulePaletteSearch(paletteInput.value);
      renderPalette(paletteInput.value);
    });
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
    // ขณะโหมดเขียน การคลิก rail กำลังถูกจัดการ (flush/ออกโหมด) — ห้าม rename ซ้อน
    if (writing.editing) return;
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

`
