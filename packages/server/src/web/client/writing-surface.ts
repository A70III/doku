/**
 * client JS — พื้นที่เขียน (mount)
 *
 * ⚠️ ไฟล์นี้เป็น "ข้อความ JS" (template string) ไม่ใช่โค้ดที่รันตรง ๆ:
 * ทั้งหมดถูกต่อกันใน `client/index.ts` แล้วเสิร์ฟเป็น `/static/client.js`
 * — แก้ที่นี่ได้ แต่ต้องคง syntax ของ JS ข้างในให้ถูก (มี test ตรวจ CLIENT_JS)
 */
export const WRITING_SURFACE_JS = `  /* ── writing surface: พิมพ์ได้ทันทีในคอลัมน์เดิม (docs/08 ข้อ 52/54) ──────
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
      if (src.startsWith("/assets/") || src.startsWith("/media/")) return src;
      const clean = src.replace(/^\\.\\//, "");
      if (src.startsWith("/")) return "/assets" + src;
      return "/assets/" + (dir ? dir + "/" : "") + clean;
    };
  }

  /** หา offset ใน markdown จาก element ที่ผู้ใช้คลิก (จับข้อความต้น block แล้วค้นหา) */
  function offsetForElement(md, target) {
    if (!target || !target.closest) return null;
    const block = target.closest("p, li, h1, h2, h3, h4, h5, h6, pre, aside, figure, blockquote, td");
    if (!block) return null;
    // ต้องถอด decorative anchor ก่อนอ่านข้อความ — heading ถูกเติม a.doku-anchor ("#") ต่อท้าย
    // ถ้าไม่ถอดจะหา "หัวข้อ 3#" ใน markdown ไม่เจอ → カーตกไปต้นไฟล์ทุกครั้งที่คลิกหัวข้อ
    const clone = block.cloneNode(true);
    for (const anchor of $$("a.doku-anchor", clone)) anchor.remove();
    const text = (clone.textContent || "").trim();
    if (!text) return null;
    // ลองข้อความเต็มก่อน (block สั้นอย่างหัวข้อ "หัวข้อ 6" ใช้ได้เลย) แล้วค่อยใช้ prefix
    // ที่สั้นลงสำหรับ block ที่ขึ้นต้นด้วย inline markup (**หนา** / [ลิงก์] / code)
    // เพราะข้อความจาก DOM กับ markdown ไม่ตรงกันตรง ๆ · prefix สั้นกว่า 12 ตัวไม่ใช้
    // (เสี่ยงไป match ข้อความเดียวกันที่อยู่ต้นเอกสาร)
    for (const length of [text.length, 32, 24, 16, 12]) {
      const needle = text.slice(0, length);
      if (needle.length !== text.length && needle.length < 12) continue;
      const index = md.indexOf(needle);
      if (index >= 0) return index;
    }
    return null;
  }

  function isInteractiveTarget(target) {
    return Boolean(
      target.closest &&
        target.closest(
          "a, button, summary, input, select, textarea, [data-part='copy-code'], [data-part='tab-button'], [data-block='figure'][data-zoom], .doku-doc-meta",
        ),
    );
  }

`
