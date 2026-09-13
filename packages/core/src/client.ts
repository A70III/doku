/**
 * Interaction script ของเนื้อหาเอกสาร (reading UX) — ใช้ร่วม server และ CLI preview
 *
 * เป็น **statement** (ไม่ใช่ IIFE) เพื่อให้ผู้เรียกเลือก wrap ได้:
 * - server: ต่อกับ tree state + SSE แล้ว serve เป็น `/static/client.js`
 * - CLI preview: ฝัง inline ในไฟล์ HTML เดียว
 *
 * ⚠️ DOM ของเนื้อหาถูก **วาดใหม่ทั้งก้อนได้** — ฝั่ง server ตอนออกจากโหมดเขียน
 * (`paintRendered`) ทำ `bodyEl.innerHTML = result.html` → node เดิมตายทั้งยวง
 * handler ที่ผูกกับ node จึงหายเงียบ ๆ (tabs กดไม่ได้, ปุ่ม copy code หาย,
 * motion block ค้าง opacity 0) · กติกาสองข้อ:
 * 1. interaction ที่ไม่ผูกกับ node (tabs / figure zoom) → **event delegation** ที่ `document`
 * 2. ของที่ต้องติดตั้งบน DOM เอง (data-enhanced / ปุ่ม copy / observer) → รวมใน
 *    `enhanceContent(root)` ที่ **เรียกซ้ำได้ (idempotent)** และ export เป็น
 *    `window.DokuInteractions` ให้ฝั่ง server เรียกหลังวาดใหม่
 *
 * ทุกอย่างเป็น progressive enhancement — ถ้า JS ไม่ทำงาน เนื้อหายังอ่านได้ครบ
 * (tabs แสดงทุก panel, motion แสดงทันที, code/zoom/TOC แค่ไม่มีลูกเล่น)
 */

export const INTERACTIONS_JS = `const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── progress bar (fixed top) — ผูกครั้งเดียวต่อหน้า (ไม่ผูกกับ node ของเนื้อหา) ──
const fill = document.querySelector(".doku-progress > [data-part='progress-fill']");
if (fill) {
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    fill.style.width = (ratio * 100).toFixed(2) + "%";
  };
  update();
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
}

// ── TOC active (scroll-spy) — observer เปลี่ยน target ได้เมื่อ TOC ถูกสร้างใหม่ ──
let tocObserver = null;
const observeToc = () => {
  const links = Array.from(document.querySelectorAll(".doku-toc a[href^='#']"));
  if (tocObserver) {
    tocObserver.disconnect();
    tocObserver = null;
  }
  if (links.length === 0) return;
  const byId = new Map();
  for (const link of links) {
    const id = decodeURIComponent(link.getAttribute("href").slice(1));
    const target = document.getElementById(id);
    if (target) byId.set(target, link);
  }
  const setActive = (link) => {
    for (const item of links) item.removeAttribute("aria-current");
    if (link) link.setAttribute("aria-current", "true");
  };
  tocObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) setActive(byId.get(entry.target) ?? null);
      }
    },
    { rootMargin: "-10% 0px -80% 0px" },
  );
  for (const target of byId.keys()) tocObserver.observe(target);
};

// ── scroll-reveal (IntersectionObserver ตัวเดียวคุมทุก block) ──
// observer ตัวเดียวใช้ซ้ำได้ แต่ node ใหม่ทุกครั้งที่ DOM ถูกวาดใหม่ต้อง observe เพิ่ม
const motionOff = document.querySelector("[data-motion='off']");
let motionObserver = null;
const observeMotions = (scope) => {
  if (reduceMotion || motionOff) return;
  const nodes = Array.from(scope.querySelectorAll("[data-block='motion']"));
  if (nodes.length === 0) return;
  if (!motionObserver) {
    motionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const node = entry.target;
          if (entry.isIntersecting) {
            node.setAttribute("data-visible", "true");
          } else if (node.getAttribute("data-once") === "false") {
            node.removeAttribute("data-visible");
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
  }
  document.documentElement.setAttribute("data-motion-ready", "1");
  for (const node of nodes) motionObserver.observe(node);
};

// ── tabs — สลับ panel (เป็น pure function ของ attribute ให้ delegation เรียกใช้) ──
const activateTab = (tabs, index) => {
  for (const button of tabs.querySelectorAll("[data-part='tab-button']")) {
    button.setAttribute("aria-selected", String(button.dataset.index === index));
  }
  for (const panel of tabs.querySelectorAll("[data-part='tab-panel']")) {
    panel.setAttribute("data-active", String(panel.dataset.index === index));
  }
};

// ── tabs + figure zoom: event delegation ที่ document ──
// ห้าม addEventListener บนตัว node (ปุ่ม/รูป) เพราะ node ถูกแทนที่ได้ทั้งก้อน
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!target || !target.closest) return;
  const button = target.closest("[data-block='tabs'] [data-part='tab-button']");
  if (button) {
    const tabs = button.closest("[data-block='tabs']");
    if (tabs) activateTab(tabs, button.dataset.index);
    return;
  }
  const figure = target.closest("[data-block='figure'][data-zoom]");
  if (!figure) return;
  if (target.closest("img")) figure.toggleAttribute("data-zoomed", !figure.hasAttribute("data-zoomed"));
  else if (target === figure) figure.removeAttribute("data-zoomed");
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  for (const figure of document.querySelectorAll("[data-block='figure'][data-zoomed]")) {
    figure.removeAttribute("data-zoomed");
  }
});

// ── ของที่ติดตั้งบน DOM ของเนื้อหา — เรียกซ้ำได้ (idempotent) ──
// server เรียกผ่าน window.DokuInteractions(document) หลัง innerHTML ถูกวาดใหม่
const enhanceContent = (root) => {
  const scope = root || document;

  // tabs (ไม่มี JS → CSS แสดงทุก panel · JS ใส่ data-enhanced แล้วโชว์เฉพาะ active)
  for (const tabs of scope.querySelectorAll("[data-block='tabs']")) {
    const buttons = Array.from(tabs.querySelectorAll("[data-part='tab-button']"));
    const panels = Array.from(tabs.querySelectorAll("[data-part='tab-panel']"));
    if (buttons.length === 0 || panels.length === 0) continue;
    tabs.setAttribute("data-enhanced", "1");
    const current = panels.find((panel) => panel.hasAttribute("data-active"));
    activateTab(tabs, current ? current.dataset.index : buttons[0].dataset.index || "0");
  }

  // copy code (ปุ่มถูกเพิ่มฝั่ง client — CSP ของ server ไม่มี inline script)
  const COPY_LABEL = "คัดลอก";
  const pres =
    scope === document ? scope.querySelectorAll(".doku-prose pre") : scope.querySelectorAll("pre");
  for (const pre of pres) {
    if (pre.querySelector("[data-part='copy-code']")) continue; // ติดตั้งแล้ว — ห้ามซ้ำ
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-part", "copy-code");
    button.setAttribute("aria-label", COPY_LABEL);
    button.textContent = COPY_LABEL;
    button.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      try {
        await navigator.clipboard.writeText(code ? code.textContent : pre.textContent);
        button.textContent = "คัดลอกแล้ว";
        setTimeout(() => { button.textContent = COPY_LABEL; }, 1200);
      } catch {
        button.textContent = "คัดลอกไม่สำเร็จ";
      }
    });
    pre.appendChild(button);
  }

  observeMotions(scope);
  observeToc();
};

window.DokuInteractions = enhanceContent;
enhanceContent(document);
`
