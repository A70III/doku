/**
 * client JS — theme/zen · แท็ก · menu
 *
 * ⚠️ ไฟล์นี้เป็น "ข้อความ JS" (template string) ไม่ใช่โค้ดที่รันตรง ๆ:
 * ทั้งหมดถูกต่อกันใน `client/index.ts` แล้วเสิร์ฟเป็น `/static/client.js`
 * — แก้ที่นี่ได้ แต่ต้องคง syntax ของ JS ข้างในให้ถูก (มี test ตรวจ CLIENT_JS)
 */
export const UI_JS = `  /* ── theme + zen ─────────────────────────────────────────────────────── */

  const THEME_KEY = "doku.theme";
  const ZEN_KEY = "doku.zen";
  const TAGS_KEY = "doku.tags";
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

  /* ── แท็ก: เปิด/ปิดได้ (docs/08 ข้อ 85) ─────────────────────────────────
     state อยู่บน <html data-tags="off"> (CSS ซ่อน) + localStorage (จำข้ามหน้า)
     SSR ค่าเริ่มต้น = เปิด → ปิด JS แล้วแท็กยังโชว์ครบ (progressive enhancement)
     อ่าน state ทุกหน้า ไม่ใช่เฉพาะหน้าที่มีปุ่ม — ปุ่มอยู่หน้าแรกอย่างเดียว
     แต่ผลของมันคือ "ไม่อยากเห็นแท็ก" ซึ่งต้องตามไปทุกหน้าที่มีแท็กโชว์
     (ถ้าโหลดหน้าอื่นแล้ว state หาย = คนจะเห็นแท็กผุดขึ้นมาเองโดยไม่ได้กด) */

  const tagToggle = $("[data-action='toggle-tags']");

  function setTagsShown(shown) {
    if (shown) docEl.removeAttribute("data-tags");
    else docEl.setAttribute("data-tags", "off");
    try {
      localStorage.setItem(TAGS_KEY, shown ? "1" : "0");
    } catch {}
    if (!tagToggle) return;
    tagToggle.setAttribute("aria-expanded", shown ? "true" : "false");
    const label = tagToggle.querySelector("[data-tags-label]");
    if (label) label.textContent = shown ? "ซ่อนแท็ก" : "แสดงแท็ก";
  }

  let tagsShown = true;
  try {
    tagsShown = localStorage.getItem(TAGS_KEY) !== "0";
  } catch {}
  // state ต้องคงอยู่ทุกหน้า แม้หน้านั้นไม่มีปุ่มให้สลับ
  if (tagsShown) docEl.removeAttribute("data-tags");
  else docEl.setAttribute("data-tags", "off");
  if (tagToggle) setTagsShown(tagsShown);

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
    //   แต่ chrome มีทั้งลิงก์และปุ่ม — แยกตามเป้าหมาย (docs/08 ข้อ 52/54):
    //   · ลิงก์ไปหน้าอื่น (sidebar/…): preventDefault + flush แล้ว navigate เอง — ห้ามปล่อย
    //     default action เพราะมันเริ่ม navigation ทันที ทำให้ fetch ของ paintRendered
    //     โดนยกเลิก → catch ยิง reload หน้าเดิม (navigation race ต้องคลิกซ้ำ)
    //   · กด ctrl/shift/alt/meta หรือ middle-click: ไม่แตะ — ปล่อยพฤติกรรมเบราว์เซอร์ (แท็บใหม่)
    //   · ลิงก์ #… (TOC) และปุ่มอื่น: ออกอยู่ในหน้า (exitWriting) + เลื่อนไปหัวข้อหลัง paint เสร็จ
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
    // ลิงก์เอกสาร active (ตัวเอง) = อยู่หน้าเดิม — ไม่ reload และไม่ถือเป็น "ออก"
    // จากโหมดเขียน → เช็คก่อน chrome branch (ก่อน logic อื่นที่แตะลิงก์)
    const activeLink = event.target.closest ? event.target.closest("a[data-doc-link]") : null;
    if (activeLink) {
      let sameDoc = false;
      try {
        sameDoc = new URL(activeLink.href).pathname === window.location.pathname;
      } catch {}
      if (sameDoc && window.location.pathname.indexOf("/d/") === 0) {
        event.preventDefault();
        return;
      }
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
    // นอกนั้น = พื้นหลังเปล่า → อยู่ต่อ ไม่ออกจากโหมดเขียน
    if (!chrome) return;
    const link = event.target.closest ? event.target.closest("a[href]") : null;
    if (link) {
      const href = link.getAttribute("href") || "";
      if (href.charAt(0) !== "#") {
        // กด modifier หรือ middle-click → ปล่อยเบราว์เซอร์จัดการ (เปิดแท็บใหม่)
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        // ลิงก์ไปหน้าอื่น — ยกเลิก default navigation แล้ว flush เองก่อนค่อยไป
        event.preventDefault();
        void (async () => {
          await flushForNavigation();
          window.location.href = href;
        })();
        return;
      }
      // anchor ในหน้า (TOC): ออกโหมดเขียนแล้วเลื่อนไปหัวข้อหลัง paint เสร็จ
      // (id ใน href ถูก encode — decode ไม่ได้ก็ปล่อยผ่าน)
      let anchorId = href.slice(1);
      try {
        anchorId = decodeURIComponent(anchorId);
      } catch {}
      void exitWriting().then(() => {
        document.getElementById(anchorId)?.scrollIntoView();
      });
      return;
    }
    void exitWriting();
  });

  // โหมดอ่าน: คลิกลิงก์เอกสารที่กำลังเปิดอยู่ = อยู่หน้าเดิม — ไม่ต้อง reload
  // (โหมดเขียนจัดการใน handler ด้านบนแล้ว — ไม่ preventDefault ซ้ำเพื่อไม่ชนทาง nav)
  document.addEventListener("click", (event) => {
    if (writing.editing) return;
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

`
