/**
 * client JS — slash menu + block control strip
 *
 * ⚠️ ไฟล์นี้เป็น "ข้อความ JS" (template string) ไม่ใช่โค้ดที่รันตรง ๆ:
 * ทั้งหมดถูกต่อกันใน `client/index.ts` แล้วเสิร์ฟเป็น `/static/client.js`
 * — แก้ที่นี่ได้ แต่ต้องคง syntax ของ JS ข้างในให้ถูก (มี test ตรวจ CLIENT_JS)
 */
export const BLOCK_STRIP_JS = `  /* ── slash menu + block control strip (docs/08 ข้อ 55) ─────────────────── */

  const LF = String.fromCharCode(10);
  const FENCE = String.fromCharCode(96).repeat(3); // ห้ามเขียน backtick ตรง ๆ — โค้ดนี้อยู่ใน template literal
  const BLOCK_LABELS = {
    note: "กล่องหมายเหตุ",
    info: "ข้อมูล",
    tip: "เคล็ดลับ",
    success: "สำเร็จ",
    warning: "คำเตือน",
    danger: "อันตราย",
    quote: "อ้างคำพูด",
    mark: "ไฮไลต์ข้อความ",
    badge: "ป้ายสถานะ",
    stat: "ตัวเลขเดี่ยว",
    stats: "ชุดตัวเลข",
    figure: "รูปภาพ + caption",
    gallery: "แกลเลอรีรูป",
    video: "วิดีโอ / เสียง",
    card: "การ์ดลิงก์",
    section: "หัวข้อใหญ่",
    grid: "ตารางแบ่งคอลัมน์",
    col: "คอลัมน์",
    kv: "คู่ key–value",
    progress: "แถบความคืบหน้า",
    steps: "ขั้นตอน",
    timeline: "ไทม์ไลน์",
    "margin-note": "โน้ตข้างขอบ",
    motion: "อนิเมชัน",
    details: "ส่วนพับได้",
    tabs: "แท็บ",
  };

  /** markdown พื้นฐานที่ Notion มีให้ในเมนู / */
  const MARKDOWN_ITEMS = [
    { keyword: "h2", label: "หัวข้อใหญ่", detail: "##", template: "## |" },
    { keyword: "h3", label: "หัวข้อย่อย", detail: "###", template: "### |" },
    { keyword: "list", label: "รายการ", detail: "-", template: "- |" },
    { keyword: "todo", label: "งานที่ต้องทำ", detail: "- [ ]", template: "- [ ] |" },
    { keyword: "num", label: "รายการมีลำดับ", detail: "1.", template: "1. |" },
    { keyword: "quote", label: "อ้างคำพูด", detail: ">", template: "> |" },
    { keyword: "code", label: "โค้ด", detail: "code", template: FENCE + "ts" + LF + "|" + LF + FENCE },
    { keyword: "table", label: "ตาราง", detail: "| … |", template: "| หัวข้อ | หัวข้อ |" + LF + "| --- | --- |" + LF + "| | |" },
    { keyword: "math", label: "สมการ", detail: "$$", template: "$$" + LF + "|" + LF + "$$" },
    { keyword: "image", label: "รูป", detail: "![]()", template: "![|](assets/)" },
    { keyword: "divider", label: "เส้นคั่น", detail: "---", template: "---" },
  ];

  let schemaPromise = null;
  function loadSchema() {
    if (!schemaPromise) {
      schemaPromise = api("/api/schema").catch(() => null);
    }
    return schemaPromise;
  }

  /** ใช้ example จาก registry เป็นเทมเพลต — ไม่มีข้อมูลชุดที่สองให้ดูแล
   *  block แบบ container → วางカーในบรรทัดว่างแรกหลัง fence เปิด */
  function schemaTemplate(block) {
    const example = String(block.example || "").replace(/s+$/, "");
    if (!example) return "";
    if (block.kind !== "container") return example;
    const lines = example.split(LF);
    let index = -1;
    for (let i = 1; i < lines.length - 1; i += 1) {
      if (!lines[i].trim()) {
        index = i;
        break;
      }
    }
    if (index === -1) {
      // ไม่มีบรรทัดว่างใน example -> แทรกบรรทัดว่างก่อน fence ปิด เพื่อให้カーอยู่ "ใน" block
      lines.splice(lines.length - 1, 0, "|");
      return lines.join(LF);
    }
    lines[index] = "|";
    return lines.join(LF);
  }

  function buildSlashItems(schema) {
    const items = MARKDOWN_ITEMS.slice();
    if (!schema || !schema.blocks) return items;
    for (const block of schema.blocks) {
      const template = schemaTemplate(block);
      if (!template) continue;
      items.push({
        keyword: block.name,
        label: (BLOCK_LABELS[block.name] || block.name) + " · " + block.name,
        detail: ":::",
        template,
      });
    }
    return items;
  }

  /* block control strip — แถบลอยเมื่อカーเข้า directive block (docs/08 ข้อ 55)
     แผง "ไม่ผูกกับ focus ของ editor": editor รายงานตำแหน่ง directive จาก selection เสมอ
     → ฝั่ง client เป็นผู้ตัดสินว่าเมื่อไหร่ควรซ่อน — pin ระหว่างโต้ตอบ (คลิก select/input
     ในแผงต้องไม่ทำแผงหาย) และห้าม rebuild DOM กลาง interaction */
  let stripKey = null; // ตัวตนของ block ที่แผงแสดง (ชื่อ + fence + บรรทัด) — เปลี่ยน = rebuild
  let stripPin = false; // กำลังโต้ตอบกับแผง — ยังไม่ซ่อนแม้ focus หลุดจาก editor
  let stripInfo = null; // info ล่าสุด — ใช้ตอน scroll/resize
  let stripViewTop = null; // viewport-relative top ของ editor host ตอนวางแผงล่าสุด
  let patchTimer = 0;

  function stripEl() {
    let el = document.getElementById("doku-block-strip");
    if (!el && articleEl) {
      el = document.createElement("div");
      el.id = "doku-block-strip";
      el.className = "doku-block-strip";
      el.hidden = true;
      el.addEventListener("focusin", () => {
        stripPin = true;
      });
      el.addEventListener("focusout", (event) => {
        if (!el.contains(event.relatedTarget)) stripPin = false;
      });
      articleEl.appendChild(el);
    }
    return el;
  }

  /** พิกัดของ event อยู่ในกรอบ element ไหม — วัดด้วย rect ไม่ใช่ contains อย่างเดียว
   *  (กันเคส element ถูกแทนที่ระหว่างคลิก → target หลุดจาก DOM) */
  function inRect(el, event, pad) {
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect();
    const p = pad || 0;
    return (
      event.clientX >= r.left - p &&
      event.clientX <= r.right + p &&
      event.clientY >= r.top - p &&
      event.clientY <= r.bottom + p
    );
  }

  function hideStrip() {
    stripPin = false;
    stripKey = null;
    stripInfo = null;
    const el = stripEl();
    if (el) el.hidden = true;
  }

  function stripControl(label, node) {
    const wrap = document.createElement("label");
    wrap.className = "doku-block-strip-field";
    const span = document.createElement("span");
    span.textContent = label;
    wrap.appendChild(span);
    wrap.appendChild(node);
    return wrap;
  }

  function positionStrip(el, info) {
    // วาง "เหนือ" บรรทัด fence และชิดขวาของคอลัมน์อ่าน
    // → ข้อความในบรรทัด fence ไม่ถูกบัง และหัวข้อ (ชิดซ้าย) ก็ไม่ถูกทับ
    const stripWidth = el.offsetWidth;
    const stripHeight = el.offsetHeight;
    const columnWidth = articleEl ? articleEl.clientWidth : stripWidth;
    el.style.top = Math.max(0, info.top - stripHeight - 4) + "px";
    el.style.left = Math.max(0, columnWidth - stripWidth) + "px";
    if (writing.mounted) stripViewTop = writing.mounted.getBoundingClientRect().top;
  }

  function syncStripValues(el, info) {
    // block เดิม — อัปเดตค่า control ที่มีอยู่แทนการ rebuild (dropdown ที่เปิดค้าง/focus
    // จึงไม่ถูกทำลาย) · ถ้ากำลังพิมพ์/เลือกอยู่ในแผง อย่าแตะค่าที่ control กำลังถือ
    if (el.contains(document.activeElement)) return;
    const variant = el.querySelector("[data-variant]");
    if (variant && variant.value !== info.name) variant.value = info.name;
    for (const control of el.querySelectorAll("[data-attr]")) {
      const next = info.attrs[control.getAttribute("data-attr")] || "";
      if (control.value !== next) control.value = next;
    }
  }

  /** text input ในแผงแก้แบบ live — debounce ~300ms ต่อการพิมพ์ */
  function schedulePatch(patch) {
    clearTimeout(patchTimer);
    patchTimer = setTimeout(() => {
      if (writing.handle) writing.handle.patchDirective(patch);
    }, 300);
  }

  function buildStrip(el, info, key) {
    const schema = writing.schema;
    const block = schema && schema.blocks ? schema.blocks.find((b) => b.name === info.name) : null;
    el.textContent = "";
    el.setAttribute("data-strip-key", key);

    const name = document.createElement("span");
    name.className = "doku-block-strip-name";
    name.textContent = BLOCK_LABELS[info.name] || info.name;
    el.appendChild(name);

    if (block) {
      // callout ทั้ง 7 type ใช้ renderer เดียวกัน → สลับชื่อ block ได้
      if (schema.variants && schema.variants.indexOf(info.name) !== -1) {
        const select = document.createElement("select");
        select.setAttribute("data-variant", "1");
        for (const variant of schema.variants) {
          const option = document.createElement("option");
          option.value = variant;
          option.textContent = BLOCK_LABELS[variant] || variant;
          if (variant === info.name) option.selected = true;
          select.appendChild(option);
        }
        select.addEventListener("change", () => {
          if (writing.handle) writing.handle.patchDirective({ name: select.value });
        });
        el.appendChild(stripControl("ชนิด", select));
      }
      for (const attr of block.attributes) {
        if (attr === "src" && info.name === "figure") continue;
        const allowed = block.values && block.values[attr];
        const current = info.attrs[attr] || "";
        let control;
        if (allowed && allowed.length && allowed.length <= 12) {
          control = document.createElement("select");
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = "—";
          control.appendChild(empty);
          for (const value of allowed) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            if (value === current) option.selected = true;
            control.appendChild(option);
          }
        } else if (attr === "color") {
          control = document.createElement("select");
          const empty = document.createElement("option");
          empty.value = "";
          empty.textContent = "—";
          control.appendChild(empty);
          for (const value of (schema.colors || [])) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            if (value === current) option.selected = true;
            control.appendChild(option);
          }
        } else {
          control = document.createElement("input");
          control.type = "text";
          control.value = current;
          // ช่องที่ค่ามักยาว (path/ชื่อเรื่อง) ให้กว้างขึ้น — ที่เหลือ 7 ตัวพอ
          control.size = ["title", "caption", "src", "href", "alt"].includes(attr) ? 18 : 7;
        }
        control.setAttribute("aria-label", attr);
        control.setAttribute("data-attr", attr);
        if (control.tagName === "INPUT") {
          control.addEventListener("input", () => {
            const patch = {};
            patch[attr] = control.value;
            schedulePatch(patch);
          });
        }
        control.addEventListener("change", () => {
          clearTimeout(patchTimer);
          const patch = {};
          patch[attr] = control.value;
          if (writing.handle) writing.handle.patchDirective(patch);
        });
        el.appendChild(stripControl(attr, control));
      }
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "doku-icon-btn doku-block-strip-remove";
    remove.title = "ลบ block นี้";
    remove.setAttribute("aria-label", "ลบ block นี้");
    remove.textContent = "×";
    remove.addEventListener("click", () => writing.handle && writing.handle.removeDirective());
    el.appendChild(remove);

    el.hidden = false;
    positionStrip(el, info);
  }

  function renderDirectiveStrip(info) {
    if (!writing.editing) {
      hideStrip();
      return;
    }
    // カーอยู่ใน mark → mark bar ชนะ — block strip หลบจนกว่าカーออกจาก mark
    if (markInfo) {
      hideStrip();
      return;
    }
    if (!info) {
      // カーย้ายออกนอก directive — ซ่อน ยกเว้นแผงกำลังถูก pin (โต้ตอบกับแผงอยู่)
      if (stripPin) {
        stripInfo = null;
        return;
      }
      hideStrip();
      return;
    }
    stripInfo = info;
    const el = stripEl();
    if (!el) return;
    const key = info.name + "@" + info.lineFrom + "/" + info.fence;
    if (!el.hidden && el.getAttribute("data-strip-key") === key) {
      // block เดิม (รวมกรณี patchDirective จากแผงแล้ว fence เปลี่ยน) — sync ค่า ไม่ rebuild
      syncStripValues(el, info);
      positionStrip(el, info);
      return;
    }
    buildStrip(el, info, key);
  }

  // pin/unpin ด้วย pointer — คลิกในแผง (แม้ target ถูกแทนที่ระหว่างคลิก) = ยัง pin อยู่
  document.addEventListener("pointerdown", (event) => {
    if (!writing.editing) return;
    const mark = markBarEl();
    if (mark && !mark.hidden && (mark.contains(event.target) || inRect(mark, event, 4))) {
      markPin = true; // แผง mark คนละ state กับ block strip — ห้ามไปแตะ pin ของอีกฝั่ง
      return;
    }
    markPin = false;
    const el = stripEl();
    if (el && !el.hidden && (el.contains(event.target) || inRect(el, event, 4))) {
      stripPin = true;
      return;
    }
    stripPin = false;
    // คลิกนอกทั้ง editor และแผง → ซ่อนแผง (การออกจากโหมดเขียนจัดการใน click handler หลัก)
    const inEditor =
      writing.mounted &&
      (writing.mounted.contains(event.target) || inRect(writing.mounted, event, 4));
    if (!inEditor) hideStrip();
    if (!inEditor) hideMarkBar();
  });

  // แผงลอยอยู่บนเอกสาร → ตำแหน่งต้องตาม scroll/resize ด้วย (delta ของ editor host)
  // ใช้กับทั้ง block strip และ mark swatch strip (แผงเดียว visible ต่อจังหวะ — กฎ mark-ชนะ)
  function onViewportMove() {
    if (!writing.mounted) return;
    const nowTop = writing.mounted.getBoundingClientRect().top;
    const delta = stripViewTop !== null ? nowTop - stripViewTop : 0;
    stripViewTop = nowTop;
    for (const [el, info] of [
      [stripEl(), stripInfo],
      [markBarEl(), markInfo],
    ]) {
      if (!el || el.hidden || !info) continue;
      if (delta) {
        el.style.top = Math.max(0, (parseFloat(el.style.top) || 0) + delta) + "px";
      }
      const barWidth = el.offsetWidth;
      const columnWidth = articleEl ? articleEl.clientWidth : barWidth;
      el.style.left = Math.max(0, columnWidth - barWidth) + "px";
    }
  }
  window.addEventListener("scroll", onViewportMove, true);
  window.addEventListener("resize", onViewportMove);

`
