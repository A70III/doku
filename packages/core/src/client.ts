/**
 * Interaction script ของเนื้อหาเอกสาร (reading UX) — ใช้ร่วม server (ผ่าน bundle) และ CLI preview
 *
 * export เป็น **function** (docs/08 ข้อ 78) เพื่อให้:
 * - server: `bun run build:client` bundle แล้วเรียก `installInteractions()` ตรง ๆ — CSP `script-src 'self'`
 *   ห้าม eval จึงต้องเป็นโค้ดจริง ไม่ใช่สตริง
 * - CLI preview (ไฟล์ HTML เดียว ไม่มี bundler): ฝัง `(installInteractions.toString())()` inline
 *
 * ฟังก์ชันนี้ไม่พึ่งตัวแปรนอก (closure-free) → `toString()` ให้สคริปต์ที่รันได้เท่าเดิม
 * · ทุกอย่างเป็น progressive enhancement — ถ้า JS ไม่ทำงาน เนื้อหายังอ่านได้ครบ
 * (tabs แสดงทุก panel, motion แสดงทันที, code/zoom/TOC แค่ไม่มีลูกเล่น)
 */

/** reading UX ของ block: progress · TOC scroll-spy · motion · tabs · zoom · copy */
export function installInteractions(): void {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  // ── progress bar (fixed top) ──
  const fill = document.querySelector<HTMLElement>(".doku-progress > [data-part='progress-fill']")
  if (fill) {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      fill.style.width = `${(ratio * 100).toFixed(2)}%`
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
  }

  // ── TOC active (scroll-spy) ──
  const tocLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(".doku-toc a[href^='#']"),
  )
  if (tocLinks.length > 0) {
    const byId = new Map<Element, HTMLAnchorElement>()
    for (const link of tocLinks) {
      const id = decodeURIComponent((link.getAttribute("href") ?? "").slice(1))
      const target = document.getElementById(id)
      if (target) byId.set(target, link)
    }
    const setActive = (link: HTMLAnchorElement | null) => {
      for (const item of tocLinks) item.removeAttribute("aria-current")
      if (link) link.setAttribute("aria-current", "true")
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(byId.get(entry.target) ?? null)
        }
      },
      { rootMargin: "-10% 0px -80% 0px" },
    )
    for (const target of byId.keys()) observer.observe(target)
  }

  // ── scroll-reveal (IntersectionObserver ตัวเดียวคุมทุก block) ──
  const motions = Array.from(document.querySelectorAll<HTMLElement>("[data-block='motion']"))
  const motionOff = document.querySelector("[data-motion='off']")
  if (motions.length > 0 && !reduceMotion && !motionOff) {
    document.documentElement.setAttribute("data-motion-ready", "1")
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const node = entry.target
          if (entry.isIntersecting) {
            node.setAttribute("data-visible", "true")
          } else if (node.getAttribute("data-once") === "false") {
            node.removeAttribute("data-visible")
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    )
    for (const node of motions) observer.observe(node)
  }

  // ── tabs (ไม่มี JS → CSS แสดงทุก panel) ──
  for (const tabs of document.querySelectorAll<HTMLElement>("[data-block='tabs']")) {
    const buttons = Array.from(tabs.querySelectorAll<HTMLElement>("[data-part='tab-button']"))
    const panels = Array.from(tabs.querySelectorAll<HTMLElement>("[data-part='tab-panel']"))
    if (buttons.length === 0 || panels.length === 0) continue
    tabs.setAttribute("data-enhanced", "1")
    const activate = (index: string | undefined) => {
      for (const button of buttons) {
        button.setAttribute("aria-selected", String(button.dataset.index === index))
      }
      for (const panel of panels) {
        panel.setAttribute("data-active", String(panel.dataset.index === index))
      }
    }
    activate(panels.find((panel) => panel.hasAttribute("data-active"))?.dataset.index ?? "0")
    for (const button of buttons) {
      button.addEventListener("click", () => activate(button.dataset.index))
    }
  }

  // ── figure zoom ──
  for (const figure of document.querySelectorAll<HTMLElement>("[data-block='figure'][data-zoom]")) {
    const image = figure.querySelector("img")
    if (!image) continue
    const toggle = (on: boolean) => figure.toggleAttribute("data-zoomed", on)
    image.addEventListener("click", () => toggle(!figure.hasAttribute("data-zoomed")))
    figure.addEventListener("click", (event) => {
      if (event.target === figure) toggle(false)
    })
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") toggle(false)
    })
  }

  // ── copy code (ปุ่มถูกเพิ่มฝั่ง client — CSP ของ server ไม่มี inline script) ──
  const COPY_LABEL = "คัดลอก"
  for (const pre of document.querySelectorAll<HTMLElement>(".doku-prose pre")) {
    const button = document.createElement("button")
    button.type = "button"
    button.setAttribute("data-part", "copy-code")
    button.setAttribute("aria-label", COPY_LABEL)
    button.textContent = COPY_LABEL
    button.addEventListener("click", async () => {
      const code = pre.querySelector("code")
      try {
        await navigator.clipboard.writeText((code ? code.textContent : pre.textContent) ?? "")
        button.textContent = "คัดลอกแล้ว"
        setTimeout(() => {
          button.textContent = COPY_LABEL
        }, 1200)
      } catch {
        button.textContent = "คัดลอกไม่สำเร็จ"
      }
    })
    pre.appendChild(button)
  }
}
