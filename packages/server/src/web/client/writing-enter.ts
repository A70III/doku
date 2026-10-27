/**
 * client JS — เข้าโหมดเขียนจากการคลิก
 *
 * ⚠️ ไฟล์นี้เป็น "ข้อความ JS" (template string) ไม่ใช่โค้ดที่รันตรง ๆ:
 * ทั้งหมดถูกต่อกันใน `client/index.ts` แล้วเสิร์ฟเป็น `/static/client.js`
 * — แก้ที่นี่ได้ แต่ต้องคง syntax ของ JS ข้างในให้ถูก (มี test ตรวจ CLIENT_JS)
 */
export const WRITING_ENTER_JS = `  /* ── เข้าโหมดเขียนด้วยการคลิกที่เอกสาร (Notion-like — docs/08 ข้อ 52) ──── */

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

`
