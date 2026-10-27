/**
 * client JS — ล็อกความสูง/ยึดบรรทัดตอนสลับ read ↔ write
 *
 * ⚠️ ไฟล์นี้เป็น "ข้อความ JS" (template string) ไม่ใช่โค้ดที่รันตรง ๆ:
 * ทั้งหมดถูกต่อกันใน `client/index.ts` แล้วเสิร์ฟเป็น `/static/client.js`
 * — แก้ที่นี่ได้ แต่ต้องคง syntax ของ JS ข้างในให้ถูก (มี test ตรวจ CLIENT_JS)
 */
export const WRITING_ANCHOR_JS = `  /* ── สลับ read ↔ write แล้วทั้ง layout และ "บรรทัดที่カーอยู่" ต้องไม่ขยับ ─────
     ระหว่างสลับ DOM (ล้าง body ตอนเข้า · ลบ editor host ตอนออก) คอลัมน์อ่านสูงเป็น 0 ชั่วขณะ
     → document สูงไม่ถึง viewport → ① เบราว์เซอร์ clamp scrollY เป็น 0 (วัดจริง: อ่านอยู่ที่
     scrollY 1200 แล้วเด้งไป 0) ② scrollbar ถูกถอด–ใส่กลับ ทำให้ shell ที่ "margin-inline: auto"
     เลื่อนซ้าย/ขวา (rail เด้งไปเด้งมา)
     อีกชั้น: prose กับ editor ใช้ rhythm ต่างกัน → เอกสารยาวไม่เท่ากัน (วัดจริง 5362px vs 4031px)
     → คืน scrollY ตรง ๆ ยังทำให้บรรทัดเดิมเลื่อน ~1.2k px · จึงยึด "บรรทัด" ไม่ใช่ตัวเลข:
     จำข้อความ + ตำแหน่งบนจอของบรรทัดนั้น แล้วจัดบรรทัดเดียวกันให้อยู่ที่เดิมหลังสลับ */

  /** ล็อกความสูงคอลัมน์อ่านไว้ระหว่างสลับ DOM (คืนความสูงเดิมเป็น px) */
  function lockReadingHeight() {
    if (!bodyEl) return 0;
    const height = Math.round(bodyEl.getBoundingClientRect().height);
    if (height > 0) bodyEl.style.minHeight = height + "px";
    return height;
  }

  function releaseReadingHeight() {
    if (bodyEl) bodyEl.style.minHeight = "";
  }

  /** เลื่อนแบบไม่ให้เห็นการเลื่อน — <html> ตั้ง "scroll-behavior: smooth" ไว้ (docs/03 §7)
   *  ถ้าใช้ "scrollTo(0, top)" ธรรมดาจะกลายเป็นเลื่อนยาวให้เห็น = "เด้ง" */
  function applyScrollTop(top) {
    window.scrollTo({ top: Math.max(0, Math.round(top)), left: 0, behavior: "instant" });
  }

  /** เนื้อความที่ตัด inline markup กับ decorative anchor — ใช้เทียบสองฝั่ง
   *  (prose ↔ markdown source · ตัว # ท้ายหัวข้อมาจาก rehype-autolink-headings)
   *  TICK = backtick แบบไม่เขียนตรง ๆ (โค้ดนี้อยู่ใน template literal) */
  const TICK = String.fromCharCode(96);
  function plainText(text) {
    return String(text || "")
      .split(TICK)
      .join("")
      .replace(/[*_~#]/g, "")
      .replace(/\\s+/g, " ")
      .trim();
  }

  /** ข้อความที่ใช้ตามหา "บรรทัดเดิม" — เป็นกลางทั้ง markdown และ prose
   *  (ตัด marker ต้นบรรทัดก่อน แล้ว normalize แบบเดียวกับ plainText) */
  function alignedNeedle(text) {
    const line = String(text || "")
      .replace(/^[\\s>#]+/, "")
      .replace(/^(?:[-*+]|\\d+[.)])\\s+/, "");
    return plainText(line).slice(0, 24);
  }

  /** บรรทัดที่ใช้เป็น "ที่เดิม" ตอนออกจากโหมดเขียน
   *  = บรรทัดที่カーอยู่ "ถ้าอยู่ในจอ" · ไม่งั้นบรรทัดบนสุดที่มองเห็น
   *  (カーอาจตกไปต้นไฟล์เมื่อ offsetForElement หา block ใน markdown ไม่เจอ —
   *  เช่นบรรทัดขึ้นต้นด้วย inline markup · ออกโหมดแล้วต้องยึดที่ "สิ่งที่เห็นอยู่") */
  function anchorLine() {
    const selection = window.getSelection ? window.getSelection() : null;
    const node = selection ? selection.anchorNode : null;
    const element = node ? (node.nodeType === 1 ? node : node.parentElement) : null;
    const caret = element && element.closest ? element.closest(".cm-line") : null;
    const visible = (line) => {
      const rect = line.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    };
    const line = caret && visible(caret) ? caret : firstVisibleLine();
    if (!line) return null;
    const needle = alignedNeedle(line.textContent);
    if (needle.length < 4) return null;
    return { top: line.getBoundingClientRect().top, needle };
  }

  /** บรรทัดบนสุดที่ยังเห็นบนจอ (ไล่ตามลำดับเอกสาร) */
  function firstVisibleLine() {
    for (const line of $$(".cm-line", bodyEl)) {
      if (line.getBoundingClientRect().bottom > 0) return line;
    }
    return null;
  }

  /** จัด element ที่มีข้อความเดียวกันให้อยู่ที่ viewport top เดิม
   *  เลือก element เล็กสุดที่เข้าเงื่อนไข (li ห่อ p → เอา p)
   *  คืนระยะที่เพี้ยนก่อนจัด (px · ≤ 1 = นิ่งแล้ว) — คืน null = หาไม่เจอ */
  function alignByNeedle(needle, top) {
    if (!needle || needle.length < 4) return null;
    const depth = (node) => {
      let count = 0;
      for (let el = node; el && el !== bodyEl; el = el.parentElement) count += 1;
      return count;
    };
    const candidates = $$("p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, td, .cm-line", bodyEl)
      .filter((node) => plainText(node.textContent).includes(needle))
      // ข้อความสั้นสุด = บล็อกที่ตรงที่สุด · ยาวเท่ากัน (li ห่อ p) → ตัวที่ลึกกว่า
      // (ไม่เรียงตามระยะบนจอ: ตอน CM ยังไม่วัด layout ตำแหน่งเป็นค่า estimate → เลือกมั่วได้)
      .sort(
        (a, b) => (a.textContent || "").length - (b.textContent || "").length || depth(b) - depth(a),
      );
    const hit = candidates[0];
    if (!hit) return null;
    const delta = hit.getBoundingClientRect().top - top;
    if (Math.abs(delta) > 1) applyScrollTop(window.scrollY + delta);
    return Math.abs(delta);
  }

  /** ปล่อยความสูงที่ล็อก + จัดบรรทัดเดิมให้อยู่ที่เดิม (fallback = คืน scrollY)
   *  CM วัด layout เป็นระยะ — จัดครั้งเดียวแล้วบรรทัดยังเลื่อนต่อได้อีก ~350px (วัดจริง)
   *  จึงวนจน "นิ่งจริง": อย่างน้อย MIN เฟรม และ residual ≤ 1 ติดกัน STABLE เฟรม
   *  อ่าน/เขียน layout + scroll ใน rAF เดียวกัน → การปรับไม่ปรากฎเป็นภาพ
   *  หยุดเมื่อ: カーย้ายเอง (wheel/touch/key) · ออกจากโหมดเขียน · ครบ MAX เฟรม */
  const SETTLE_MIN_FRAMES = 8;
  const SETTLE_STABLE_FRAMES = 4;
  const SETTLE_MAX_FRAMES = 45;

  function settleReadingHeight(scrollTop, needle, top) {
    if (!bodyEl) return;
    const host = bodyEl.firstElementChild;
    let tries = 0;
    let stable = 0;
    let released = false;
    let moved = false;
    const onUserMove = () => {
      moved = true;
    };
    window.addEventListener("wheel", onUserMove, { passive: true });
    window.addEventListener("touchmove", onUserMove, { passive: true });
    window.addEventListener("keydown", onUserMove);
    const cleanup = () => {
      window.removeEventListener("wheel", onUserMove);
      window.removeEventListener("touchmove", onUserMove);
      window.removeEventListener("keydown", onUserMove);
    };
    const step = () => {
      tries += 1;
      // カーย้ายเอง หรือออกจากโหมดเขียนไปแล้ว → หยุดแทรกแซงทันที
      const aborted = moved || !writing.editing || writing.mounted !== host;
      const residual = aborted ? null : alignByNeedle(needle, top);
      stable = residual !== null && residual <= 1 ? stable + 1 : 0;
      if (!released && (stable > 0 || tries >= SETTLE_MIN_FRAMES)) {
        releaseReadingHeight();
        released = true;
      }
      const settled = tries >= SETTLE_MIN_FRAMES && stable >= SETTLE_STABLE_FRAMES;
      if (aborted || settled || tries >= SETTLE_MAX_FRAMES) {
        cleanup();
        if (!released) releaseReadingHeight();
        if (!aborted && residual === null) applyScrollTop(scrollTop);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function mountWritingSurface(md, anchorOffset, slashItems, clicked) {
    const rect = clicked && clicked.getBoundingClientRect ? clicked.getBoundingClientRect() : null;
    const needle = clicked && clicked.textContent ? alignedNeedle(clicked.textContent) : "";
    const scrollTop = window.scrollY;
    lockReadingHeight();
    const host = document.createElement("div");
    host.className = "doku-inline-editor";
    bodyEl.textContent = "";
    bodyEl.appendChild(host);
    writing.mounted = host;
    // ยังไม่ทัน paint — คืนตำแหน่งไว้ก่อน (ความสูงถูกล็อกแล้ว scroll จึงไม่ถูก clamp)
    applyScrollTop(scrollTop);
    settleReadingHeight(scrollTop, needle, rect ? rect.top : 0);

    if (window.DokuEditor) {
      writing.handle = window.DokuEditor.create(host, {
        doc: md,
        anchor: anchorOffset,
        placeholder: "เริ่มเขียน… (พิมพ์ / เพื่อแทรก block)",
        resolveAsset: makeAssetResolver(writing.path),
        slashItems,
        onDirective: (info) => renderDirectiveStrip(info),
        onMark: (info) => renderMarkStrip(info),
        onChange: () => {
          writing.dirty = true;
          setDocStatus("dirty", "กำลังบันทึก…");
          scheduleSave();
        },
        onSave: () => flushSave(true),
      });
      // ให้カーอยู่ในเอกสารจริง ๆ หลัง click default action ของเบราว์เซอร์ทำงานจบ
      // (ไม่ผูกการออกกับ blur: คลิกนอกเอกสาร/Esc ดูแล — เหมือน Notion, autosave ทำงานตลอด)
      bindMediaDrop(host, writing.path, (text) => {
        if (writing.handle) writing.handle.insertBlock(text);
      });
      window.setTimeout(() => writing.handle && writing.handle.focus(), 0);
      return;
    }

    // fallback: ยังไม่ build editor.js — textarea ธรรมดา (docs/08 ข้อ 37)
    const textarea = document.createElement("textarea");
    textarea.className = "doku-inline-textarea";
    textarea.value = md;
    textarea.setAttribute("aria-label", "markdown");
    textarea.addEventListener("input", () => {
      writing.dirty = true;
      setDocStatus("dirty", "กำลังบันทึก…");
      scheduleSave();
    });
    host.appendChild(textarea);
    writing.textarea = textarea;
    bindMediaDrop(textarea, writing.path, (text) => insertBlockIntoTextarea(textarea, text));
    window.setTimeout(() => textarea.focus(), 0);
  }

  async function enterWriting(anchor) {
    if (writing.editing || !articleEl || !bodyEl) return;
    const payload = readEmbedded();
    if (!payload) return;
    const schema = await loadSchema();
    writing.schema = schema;
    writing.path = articleEl.getAttribute("data-doc-id");
    writing.etag = payload.etag || null;
    writing.editing = true;
    writing.dirty = false;
    articleEl.setAttribute("data-editing", "1");
    // ไฟล์ที่ขึ้นต้นด้วย # h1 = ชื่อเรื่องอยู่ในเนื้อหา → editor จะโชว์บรรทัดนั้นเป็นชื่อเรื่อง
    // ซ่อนชื่อเรื่องที่ header ระหว่างเขียน ไม่งั้นเห็นชื่อซ้ำสองที่ (dedupe ตอน render อยู่นอกไฟล์)
    if (/^\\s*#\\s+\\S/.test(payload.md)) docEl.setAttribute("data-title-in-body", "1");
    else docEl.removeAttribute("data-title-in-body");
    // SSE guard อ่านจาก <html> (ดู listener ด้านบน) — ต้องตั้งทั้งสองที่
    // ไม่งั้น autosave ที่เราเขียนเองจะ trigger watcher → SSE → reload กลางการพิมพ์
    docEl.setAttribute("data-editing", "1");
    setDocStatus("clean", "พร้อมแก้ไข");
    // ส่งทั้ง offset (ให้ CM วางカー) และ element ที่คลิก (ให้จัด "บรรทัดเดิม" กลับที่เดิม)
    mountWritingSurface(payload.md, offsetForElement(payload.md, anchor), buildSlashItems(schema), anchor);
  }

  function writeSnapshot() {
    const text = currentText();
    if (writing.handle) {
      writing.handle.destroy();
      writing.handle = null;
    }
    if (writing.textarea) writing.textarea = null;
    if (writing.mounted) writing.mounted.remove();
    writing.mounted = null;
    return text;
  }

  function teardownWriting() {
    hideStrip(); // ตัดสินที่ hideStrip ตรง ๆ — ไม่ผ่าน renderDirectiveStrip (pin ไม่รอดออกจากโหมดเขียน)
    hideMarkBar(); // เช่นเดียวกับ mark swatch strip
    writing.editing = false;
    writing.path = null;
    writing.dirty = false;
    clearTimeout(writing.timer);
    if (articleEl) articleEl.removeAttribute("data-editing");
    docEl.removeAttribute("data-editing");
    docEl.removeAttribute("data-title-in-body");
    setDocStatus("clean", "");
  }

  /** fragment ของ "เอกสาร" ที่ render แล้ว — path เดียวกับหน้า /d/* (DocRenderer)
   *  ใช้ตอนออกโหมดเขียน: ต้องเป็น renderer ตัวเดียวกับตอน refresh
   *  ไม่งั้นชื่อเรื่อง/h1 ไม่ตรง (เช่น /api/render เป็น stateless — title คงเป็น default) */
  async function renderDocFragment(docId) {
    return api("/api/docs/" + encodePath(docId) + "?format=html");
  }

  /** ชื่อเรื่อง/สรุป อยู่ที่ header นอกส่วนที่แก้ — อัปเดตจาก meta ที่ server คืนมา */
  function syncHeader(meta) {
    if (!meta) return;
    const title = document.querySelector(".doku-doc-title");
    if (title && meta.title) title.textContent = meta.title;
    const lede = document.querySelector(".doku-doc-lede");
    const summary = meta.summary || "";
    if (lede) {
      if (summary) lede.textContent = summary;
      else lede.remove();
    } else if (summary) {
      const header = document.querySelector(".doku-doc-header");
      const paragraph = document.createElement("p");
      paragraph.className = "doku-doc-lede";
      paragraph.textContent = summary;
      title?.insertAdjacentElement("afterend", paragraph);
      void header;
    }
    const colophon = document.querySelector(".doku-colophon");
    if (colophon && meta.title) colophon.setAttribute("data-title", meta.title);
  }

  /** วาด HTML กลับเข้าที่เดิม + sync TOC/colophon ให้ตรงกับเนื้อหาใหม่
   *  ⚠️ innerHTML ทำให้ node เดิมตายทั้งยวง — interaction ของ block (tabs/zoom/copy/motion)
   *  ต้องติดตั้งใหม่ทุกครั้ง ไม่งั้นกดแท็บไม่ได้จนกว่าจะ refresh (docs/03 progressive enhancement) */
  /** โหลด katex.css เมื่อเนื้อหาที่เพิ่งวาดมีสมการ
   *  หน้า /d/* ได้ <link> มาจาก server แล้ว แต่หลัง repaint (ออกจากโหมดเขียน) เนื้อหาอาจ
   *  **เพิ่งมีสมการที่เพิ่งพิมพ์เพิ่ม** → ต้องโหลดตอนนี้ ไม่งั้น MathML ดิบโผล่และ display math
   *  เป็น inline จนกว่าจะ refresh (docs/08 ข้อ 70) */
  function ensureKatexCss(html) {
    if (!html.includes("katex")) return;
    if (document.querySelector("link[data-katex]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/static/katex.css";
    link.setAttribute("data-katex", "true");
    document.head.appendChild(link);
  }

  async function paintRendered(md, docId) {
    const result = await renderDocFragment(docId);
    bodyEl.innerHTML = result.html;
    ensureKatexCss(result.html);
    syncHeader(result.meta);
    syncTocFromBody();
    if (typeof window !== "undefined" && typeof window.DokuInteractions === "function") {
      window.DokuInteractions(document);
    }
    const colophon = $(".doku-colophon");
    if (colophon) {
      const words = md.trim().split(/\\s+/u).filter(Boolean).length;
      const node = colophon.querySelector("[data-part='colophon-words']");
      if (node) node.textContent = words.toLocaleString("th-TH") + " คำ";
    }
    return result.html;
  }

  function syncTocFromBody() {
    const links = $$("[data-toc-link]");
    if (!links.length) return;
    const headings = $$("article .doku-prose :is(h2, h3, h4)").filter((el) => el.id);
    const list = links[0].closest("ul");
    if (!list) return;
    list.textContent = "";
    for (const heading of headings) {
      const li = document.createElement("li");
      li.className = "doku-toc-h" + heading.tagName.slice(1);
      const link = document.createElement("a");
      link.href = "#" + heading.id;
      link.setAttribute("data-toc-link", heading.id);
      // ข้อความหัวข้อต้องไม่รวม decorative anchor — pipeline ใส่ a.doku-anchor
      // append เข้าไปใน heading เอง (rehype-autolink-headings behavior "append")
      // textContent เลยมี "#" ติดมา; server TOC ไม่พังเพราะ rehypeCollectToc
      // ถูกเรียกก่อน autolink (core/render.ts) — client rebuild ต้องตัดเอง
      const clone = heading.cloneNode(true);
      for (const anchor of $$("a.doku-anchor", clone)) anchor.remove();
      link.textContent = clone.textContent || "";
      li.appendChild(link);
      list.appendChild(li);
    }
  }

  function scheduleSave() {
    clearTimeout(writing.timer);
    writing.timer = setTimeout(() => flushSave(false), 800);
  }

  /** autosave · If-Match · 409 = ให้คนเลือก (ไม่ทับเงียบ — docs/08 ข้อ 54) */
  async function flushSave(explicit) {
    if (!writing.editing || !writing.dirty) {
      if (explicit) setDocStatus("clean", "");
      return;
    }
    const md = currentText();
    writing.dirty = false;
    try {
      const result = await jsonRequest(
        "PUT",
        "/api/docs/" + encodePath(writing.path),
        { md },
        writing.etag ? { "if-match": '"' + writing.etag + '"' } : undefined,
      );
      if (result && result.etag) writing.etag = result.etag;
      setDocStatus("clean", "");
    } catch (error) {
      writing.dirty = true;
      if (error.status === 409) {
        const force = window.confirm(
          "เอกสารถูกแก้จากที่อื่นหลังคุณเปิดหน้านี้\\n\\nเขียนทับด้วยเวอร์ชันของคุณหรือไม่?" +
            "\\n(ยกเลิก = เก็บงานของคุณไว้ก่อน ยังไม่เขียนทับ)",
        );
        if (error.etag) writing.etag = error.etag;
        if (force) {
          setDocStatus("dirty", "กำลังบันทึก…");
          await flushSave(true);
          return;
        }
        setDocStatus("error", "ถูกแก้จากที่อื่น");
        return;
      }
      setDocStatus("error", "บันทึกไม่สำเร็จ");
      fail(error);
    }
  }

  /** flush + snapshot + teardown โดยไม่วาดผล — ใช้เป็นแกนของการออกโหมดเขียน */
  async function flushAndTeardown() {
    clearTimeout(writing.timer);
    await flushSave(true);
    const md = writeSnapshot();
    teardownWriting();
    return md;
  }

  /** flush ก่อน navigate ไปหน้าอื่น — flush + ทำลาย CM handle/timer (กัน onChange ยิงซ้ำ
   *  ระหว่าง flush) แต่ “คง data-editing” ไว้จนหน้า unload: flush ที่สร้าง file change
   *  จะยิง SSE "change" กลับมา และ listener ต้นไฟล์ guard ด้วย attribute นี้ — ถ้าลบก่อน
   *  navigate จะโดน reload ยกเลิก navigation ที่กำลัง pending (navigation race) */
  async function flushForNavigation() {
    clearTimeout(writing.timer);
    try {
      // ต้อง await จน flush จบจริงก่อน navigate — flushSave ตั้ง dirty=false ตั้งแต่ก่อน await
      await flushSave(true);
    } catch (error) {
      // flush พัง → toast error แล้ว navigate ต่ออยู่ดี (autosave รอบก่อนครอบงานส่วนใหญ่
      // แล้ว + revision มีอยู่) — อย่าค้างอยู่หน้าเดิมเงียบ ๆ
      fail(error);
    }
    writeSnapshot();
  }

  async function exitWriting() {
    if (!writing.editing) return;
    // ต้องจำ doc id ก่อน teardown — ไม่งั้น paint จะ render เป็น "untitled"
    const docId = writing.path;
    const caret = anchorLine();
    const scrollTop = window.scrollY;
    lockReadingHeight();
    const md = await flushAndTeardown();
    try {
      await paintRendered(md, docId);
    } catch (error) {
      fail(error);
      releaseReadingHeight();
      reload();
      return;
    }
    // editor กับ prose ยาวไม่เท่ากัน — ยึด "บรรทัดที่カーอยู่" ไม่ใช่ตัวเลข scrollY
    const residual = caret ? alignByNeedle(caret.needle, caret.top) : null;
    if (residual === null) applyScrollTop(scrollTop);
    releaseReadingHeight();
  }

`
