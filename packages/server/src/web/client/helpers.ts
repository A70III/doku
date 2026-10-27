/**
 * client JS — helpers · askText · media upload
 *
 * ⚠️ ไฟล์นี้เป็น "ข้อความ JS" (template string) ไม่ใช่โค้ดที่รันตรง ๆ:
 * ทั้งหมดถูกต่อกันใน `client/index.ts` แล้วเสิร์ฟเป็น `/static/client.js`
 * — แก้ที่นี่ได้ แต่ต้องคง syntax ของ JS ข้างในให้ถูก (มี test ตรวจ CLIENT_JS)
 */
export const HELPERS_JS = `  /* ── helpers ─────────────────────────────────────────────────────────── */

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

  /* ── ถามข้อความสั้น ๆ (แทน window.prompt) ───────────────────────────── */

  let askResolve = null;

  /** คืน string ที่ผู้ใช้กรอก หรือ null (ยกเลิก) · ไม่มี DOM = fallback เป็น prompt เดิม */
  function askText(options) {
    if (!askEl || !askForm || !askInput) {
      return Promise.resolve(window.prompt(options.title, options.value || ""));
    }
    if (askResolve) {
      const previous = askResolve;
      askResolve = null;
      previous(null);
    }
    askTitle.textContent = options.title || "";
    askHint.textContent = options.hint || "";
    askHint.hidden = !options.hint;
    askLabel.textContent = options.label || "path";
    askInput.value = options.value || "";
    askSubmit.textContent = options.confirm || "ตกลง";
    askEl.hidden = false;
    return new Promise((resolve) => {
      askResolve = resolve;
      window.setTimeout(() => {
        askInput.focus();
        askInput.select();
      }, 0);
    });
  }

  function settleAsk(value) {
    if (!askResolve) return;
    const resolve = askResolve;
    askResolve = null;
    askEl.hidden = true;
    resolve(value);
  }

  if (askForm) {
    askForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = askInput ? askInput.value.trim() : "";
      settleAsk(value || null);
    });
    const cancel = askForm.querySelector("[data-ask='cancel']");
    if (cancel) cancel.addEventListener("click", () => settleAsk(null));
    if (askEl) {
      askEl.addEventListener("click", (event) => {
        if (event.target === askEl) settleAsk(null);
      });
    }
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

  /* ── media: แปะ/ลากไฟล์ → อัปโหลดเข้า assets ของโฟลเดอร์เอกสาร + แทรก ─── */

  const MEDIA_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/avif": "avif",
  };

  /** ชื่อไฟล์ปลายทาง — clipboard ไม่มีชื่อ จึงสร้างจากเวลา (charset ที่ API ยอมรับ) */
  function mediaFilename(file, index) {
    if (file.name && file.name.indexOf(".") !== -1) return file.name;
    const ext = MEDIA_EXT[file.type] || "bin";
    return "paste-" + Date.now().toString(36) + "-" + index + "." + ext;
  }

  function mediaMarkdown(name, mime) {
    const rel = "assets/" + name;
    if ((mime || "").indexOf("image/") === 0) return "![](" + rel + ")";
    const base = name.indexOf("/") === -1 ? name : name.slice(name.lastIndexOf("/") + 1);
    return "[" + base + "](" + rel + ")";
  }

  async function uploadMedia(path, entries) {
    const form = new FormData();
    for (const entry of entries) form.append("file", entry.file, entry.name);
    const response = await fetch("/api/docs/" + encodePath(path) + "/assets", {
      method: "POST",
      body: form,
    });
    let body = null;
    try {
      body = await response.json();
    } catch {}
    if (!response.ok) {
      const message = body && body.error && body.error.message;
      throw new Error(message || "อัปโหลดไม่สำเร็จ (HTTP " + response.status + ")");
    }
    return (body && body.assets) || [];
  }

  /** แทรกเป็น block ต่อท้ายบรรทัดที่カーอยู่ (fallback textarea) */
  function insertBlockIntoTextarea(textarea, text) {
    const pos = textarea.selectionStart == null ? textarea.value.length : textarea.selectionStart;
    const lineEnd = textarea.value.indexOf("\\n", pos);
    const at = lineEnd === -1 ? textarea.value.length : lineEnd;
    const block = "\\n\\n" + text + "\\n";
    textarea.value = textarea.value.slice(0, at) + block + textarea.value.slice(at);
    textarea.selectionStart = textarea.selectionEnd = at + block.length;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** ผูก paste/drop ไฟล์กับพื้นที่เขียน — ทำงานเฉพาะตอนอยู่ในโหมดเขียน */
  function bindMediaDrop(target, path, insert) {
    const pick = (list) => Array.from(list || []).filter((file) => file && file.size > 0);

    const send = async (files) => {
      const entries = files.map((file, index) => ({ file, name: mediaFilename(file, index) }));
      setDocStatus("dirty", "กำลังอัปโหลด " + entries.length + " ไฟล์…");
      try {
        const assets = await uploadMedia(path, entries);
        const blocks = assets.map((asset, index) => {
          const entry = entries[index];
          return mediaMarkdown(entry ? entry.name : asset.path, asset.content_type);
        });
        if (blocks.length) insert(blocks.join("\\n\\n"));
        toast("แทรก " + assets.length + " ไฟล์แล้ว", "ok");
        writing.dirty = true;
        scheduleSave();
      } catch (error) {
        setDocStatus("dirty", "อัปโหลดไม่สำเร็จ");
        fail(error);
      }
    };

    target.addEventListener("paste", (event) => {
      if (!writing.editing) return;
      const files = pick(event.clipboardData && event.clipboardData.files);
      if (!files.length) return;
      event.preventDefault();
      void send(files);
    });

    target.addEventListener("dragover", (event) => {
      if (!writing.editing) return;
      const types = Array.from((event.dataTransfer && event.dataTransfer.types) || []);
      if (types.indexOf("Files") === -1) return;
      event.preventDefault();
      target.classList.add("is-media-target");
    });

    target.addEventListener("dragleave", () => target.classList.remove("is-media-target"));

    target.addEventListener("drop", (event) => {
      target.classList.remove("is-media-target");
      if (!writing.editing) return;
      const files = pick(event.dataTransfer && event.dataTransfer.files);
      if (!files.length) return;
      event.preventDefault();
      void send(files);
    });
  }

  function currentDocPath() {
    const article = $("article[data-doc-id]");
    return article ? article.getAttribute("data-doc-id") : null;
  }

  function reload() {
    window.location.reload();
  }

`
