/**
 * client JS — doc/folder actions · meta · folder · revisions
 *
 * ⚠️ ไฟล์นี้เป็น "ข้อความ JS" (template string) ไม่ใช่โค้ดที่รันตรง ๆ:
 * ทั้งหมดถูกต่อกันใน `client/index.ts` แล้วเสิร์ฟเป็น `/static/client.js`
 * — แก้ที่นี่ได้ แต่ต้องคง syntax ของ JS ข้างในให้ถูก (มี test ตรวจ CLIENT_JS)
 */
export const ACTIONS_JS = `  /* ── doc / folder actions ────────────────────────────────────────────── */

  async function newDoc(dir) {
    const suggestion = dir ? dir + "/" : "";
    const input = await askText({
      title: "เอกสารใหม่",
      hint: "path relative จาก vault — ไม่ต้องใส่ .md",
      label: "path",
      value: suggestion,
      confirm: "สร้าง",
    });
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
    const input = await askText({
      title: "โฟลเดอร์ใหม่",
      hint: "path relative จาก vault (ซ้อนได้ด้วย /)",
      label: "path",
      value: suggestion,
      confirm: "สร้าง",
    });
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
    const target =
      presetTarget ||
      (await askText({
        title: "ย้ายเอกสาร",
        hint: "path ปลายทาง (relative จาก vault)",
        label: "ไปที่",
        value: id,
        confirm: "ย้าย",
      }));
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
    const target =
      presetTarget ||
      (await askText({
        title: "ย้ายโฟลเดอร์",
        hint: "path ปลายทาง (relative จาก vault)",
        label: "ไปที่",
        value: path,
        confirm: "ย้าย",
      }));
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

`
