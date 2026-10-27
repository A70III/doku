/**
 * client JS — แถบสีของ ==mark==
 *
 * ⚠️ ไฟล์นี้เป็น "ข้อความ JS" (template string) ไม่ใช่โค้ดที่รันตรง ๆ:
 * ทั้งหมดถูกต่อกันใน `client/index.ts` แล้วเสิร์ฟเป็น `/static/client.js`
 * — แก้ที่นี่ได้ แต่ต้องคง syntax ของ JS ข้างในให้ถูก (มี test ตรวจ CLIENT_JS)
 */
export const MARK_STRIP_JS = `  /* ── mark swatch strip (docs/08 ข้อ 6/55) — แถบสีของ ==mark== เมื่อカーอยู่ในช่วง ──
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

`
