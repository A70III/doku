/**
 * client JS — trash · TOC · action router · ตำแหน่งอ่าน · keyboard
 *
 * ⚠️ ไฟล์นี้เป็น "ข้อความ JS" (template string) ไม่ใช่โค้ดที่รันตรง ๆ:
 * ทั้งหมดถูกต่อกันใน `client/index.ts` แล้วเสิร์ฟเป็น `/static/client.js`
 * — แก้ที่นี่ได้ แต่ต้องคง syntax ของ JS ข้างในให้ถูก (มี test ตรวจ CLIENT_JS)
 */
export const MISC_JS = `  /* ── trash ───────────────────────────────────────────────────────────── */

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
          // inline editor ใน summary (แทน prompt) — แก้เฉพาะข้อความ label
          const row = $('[data-folder-path="' + CSS.escape(path) + '"]');
          const label = row ? row.querySelector(".doku-folder-summary .truncate") : null;
          if (label) startInlineRename("folder", path, label);
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
      case "toggle-tags":
        if (tagToggle) setTagsShown(docEl.getAttribute("data-tags") === "off");
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
      case "keys-close":
        if (keysEl) keysEl.hidden = true;
        break;
      case "to-top":
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
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
  for (const overlay of [folderOverlay, tocSheetEl, keysEl]) {
    if (!overlay) continue;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.hidden = true;
    });
  }

  /* ── จำตำแหน่งอ่าน + กลับขึ้นบน ──────────────────────────────────────── */

  const POS_KEY = "doku.read-position";
  const POS_MAX = 300;

  function readPositions() {
    try {
      const raw = JSON.parse(localStorage.getItem(POS_KEY) || "{}");
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }

  if (articleEl) {
    const docId = articleEl.getAttribute("data-doc-id");
    const savedPosition = docId ? readPositions()[docId] : 0;
    if (savedPosition > 200 && !window.location.hash) {
      // เบราว์เซอร์ restitution ตำแหน่งเองตอน reload — ปิด เพื่อให้เราเป็นคนกำหนด
      if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
      const restore = () => window.scrollTo(0, savedPosition);
      requestAnimationFrame(restore);
      // รูป/ฟอนต์โหลดเสร็จแล้วความสูงเปลี่ยน — ปรับอีกรอบถ้าตำแหน่งเพี้ยน
      window.addEventListener(
        "load",
        () => {
          if (Math.abs(window.scrollY - savedPosition) > 40) restore();
        },
        { once: true },
      );
    }
  }

  let positionTimer = 0;

  function rememberPosition() {
    if (!articleEl || docEl.hasAttribute("data-editing")) return;
    const docId = articleEl.getAttribute("data-doc-id");
    if (!docId) return;
    const map = readPositions();
    map[docId] = Math.round(window.scrollY);
    const keys = Object.keys(map);
    if (keys.length > POS_MAX) {
      for (const key of keys.slice(0, keys.length - POS_MAX)) delete map[key];
    }
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(map));
    } catch {}
  }

  window.addEventListener(
    "scroll",
    () => {
      if (toTopEl) toTopEl.hidden = window.scrollY < 600;
      clearTimeout(positionTimer);
      positionTimer = setTimeout(rememberPosition, 250);
    },
    { passive: true },
  );

  if (toTopEl) toTopEl.hidden = window.scrollY < 600;

  /* ── prefetch ตอน hover (เบราว์เซอร์ที่ไม่มี speculation rules) ──────── */
  const supportsSpeculation =
    typeof HTMLScriptElement !== "undefined" &&
    "supports" in HTMLScriptElement &&
    HTMLScriptElement.supports("speculationrules");
  if (!supportsSpeculation) {
    const prefetched = new Set();
    document.addEventListener(
      "mouseover",
      (event) => {
        const link =
          event.target && event.target.closest ? event.target.closest("a.doku-row-link") : null;
        if (!link || !link.href || prefetched.has(link.href)) return;
        prefetched.add(link.href);
        const tag = document.createElement("link");
        tag.rel = "prefetch";
        tag.href = link.href;
        document.head.appendChild(tag);
      },
      { passive: true },
    );
  }

  /* ── keyboard ────────────────────────────────────────────────────────── */

  // Mac ใช้ ⌘ — Chrome/Edge บน Linux/Windows จอง Ctrl+K ไปโฟกัสช่องค้นหา
  // จึงมี "/" เป็นทางลัดสำรองที่เบราว์เซอร์ไม่แย่ง
  const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  for (const el of $$("[data-palette-key]")) el.textContent = isMac ? "\u2318K" : "/";
  for (const el of $$("[data-mod-key]")) el.textContent = isMac ? "\u2318" : "Ctrl";
  for (const el of $$("[data-palette-kbd]")) {
    el.innerHTML = isMac ? "<kbd>\u2318</kbd> <kbd>K</kbd>" : "<kbd>/</kbd>";
  }
  for (const el of $$("[data-action='palette']")) {
    el.title = isMac ? "ค้นหา / คำสั่ง (\u2318K)" : "ค้นหา / คำสั่ง (/)";
  }

  document.addEventListener("keydown", (event) => {
    const meta = event.metaKey || event.ctrlKey;
    const tag = (event.target && event.target.tagName) || "";
    if (!meta && !event.altKey && event.key === "/" && !writing.editing) {
      if (tag !== "INPUT" && tag !== "TEXTAREA" && !event.target.isContentEditable) {
        event.preventDefault();
        openPalette();
        return;
      }
    }
    if (meta && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (paletteEl.hidden) openPalette();
      else closePalette();
      return;
    }
    if (meta && event.key.toLowerCase() === "n") {
      if (!writing.editing) {
        event.preventDefault();
        newDoc(currentDirForNew());
      }
      return;
    }
    if (!meta && !event.altKey && event.key === "?") {
      const tag = (event.target && event.target.tagName) || "";
      if (!writing.editing && tag !== "INPUT" && tag !== "TEXTAREA" && keysEl) {
        event.preventDefault();
        keysEl.hidden = !keysEl.hidden;
      }
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
      else if (keysEl && !keysEl.hidden) keysEl.hidden = true;
      else if (askEl && !askEl.hidden) settleAsk(null);
      else if (writing.editing) exitWriting();
    }
  });
})();
`
