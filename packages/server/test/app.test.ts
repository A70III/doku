import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  DocNotFoundError,
  memoryRevisionStore,
  memoryVaultFs,
  RENDERER_VERSION,
  type VaultFs,
} from "@doku/core"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"
import { CLIENT_JS } from "../src/web/client.ts"

function setup(files: Record<string, string | Uint8Array>) {
  const fs = memoryVaultFs(files)
  const state = new VaultState(fs, "vault")
  const cache = new FragmentCache(null, RENDERER_VERSION)
  const renderer = new DocRenderer(fs, state, cache)
  const hub = new SseHub()
  const app = createDokuApp({ fs, vaultName: "vault", state, renderer, hub })
  return { app, state, cache, renderer, fs }
}

const GOOD_DOC = "# หัวเรื่อง\n\nเนื้อหายาว ๆ ที่นี่\n"

describe("routes", () => {
  test("GET /health", async () => {
    const { app } = setup({})
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  test("GET / — home มีรายการเอกสาร + tag", async () => {
    const { app } = setup({
      "welcome.md": GOOD_DOC,
      "welcome.meta.json": JSON.stringify({ title: "ยินดีต้อนรับ", tags: ["intro"] }),
    })
    const res = await app.request("/")
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("ยินดีต้อนรับ")
    expect(html).toContain("/d/welcome")
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'")
  })

  test("GET / — tag filter", async () => {
    const { app } = setup({
      "a.md": GOOD_DOC,
      "a.meta.json": JSON.stringify({ title: "A", tags: ["x"] }),
      "b.md": GOOD_DOC,
      "b.meta.json": JSON.stringify({ title: "B", tags: ["y"] }),
    })
    const filtered = await app.request("/?tag=x")
    const html = await filtered.text()
    expect(html).toContain("A")
    // row ของเอกสาร b ต้องไม่อยู่ใน list (แต่ sidebar tree แสดงครบตาม design)
    expect(html).not.toContain('font-(family-name:--d-font-mono)">b</span>')
  })

  test("GET /d/*path — render เอกสาร + sidebar", async () => {
    const { app } = setup({
      "projects/design.md": GOOD_DOC,
      "projects/design.meta.json": JSON.stringify({
        title: "Design",
        theme: { accent: "#7c3aed" },
      }),
    })
    const res = await app.request("/d/projects/design")
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("Design")
    expect(html).toContain("doku-prose")
    expect(html).toContain("--doc-accent:#7c3aed") // per-doc accent (docs/03 §1.2)
    expect(html).toContain('data-doc-id="projects/design"')
    expect(res.headers.get("content-security-policy")).toContain("script-src 'self'")
  })

  test("GET /d/*path — cache hit ครั้งที่สอง", async () => {
    const { app, cache } = setup({ "x.md": GOOD_DOC })
    const first = await app.request("/d/x")
    const body1 = await first.text()
    expect(cache.size).toBe(1)
    const second = await app.request("/d/x")
    expect(await second.text()).toBe(body1)
  })

  test("md เปลี่ยน → hash เปลี่ยน → render ใหม่", async () => {
    // mutable fs adapter — memoryVaultFs snapshot ตอนสร้าง ไม่เห็นการแก้หลังจากนั้น
    const entries = new Map<string, Uint8Array>([["x.md", new TextEncoder().encode(GOOD_DOC)]])
    const enc = new TextEncoder()
    const fs: VaultFs = {
      async readText(rel) {
        const bytes = entries.get(rel)
        return bytes ? new TextDecoder().decode(bytes) : null
      },
      async readBytes(rel) {
        return entries.get(rel) ?? null
      },
      async list(rel) {
        const prefix = rel ? `${rel}/` : ""
        const files: { name: string; type: "file" | "dir" }[] = []
        for (const path of entries.keys()) {
          if (!path.startsWith(prefix)) continue
          const rest = path.slice(prefix.length)
          if (rest && !rest.includes("/")) files.push({ name: rest, type: "file" })
        }
        return files
      },
    }
    const state = new VaultState(fs, "vault")
    const cache = new FragmentCache(null, RENDERER_VERSION)
    const renderer = new DocRenderer(fs, state, cache)
    const hub = new SseHub()
    const app = createDokuApp({ fs, vaultName: "vault", state, renderer, hub })

    await app.request("/d/x")
    entries.set("x.md", enc.encode("# เปลี่ยนแล้ว\n"))
    state.invalidate()
    await app.request("/d/x")
    expect(cache.size).toBe(2)
  })

  test("GET /d/missing — 404 page", async () => {
    const { app } = setup({ "x.md": GOOD_DOC })
    const res = await app.request("/d/missing")
    expect(res.status).toBe(404)
    expect(await res.text()).toContain("404")
  })

  test("invalid percent-encoding → ไม่ crash (docs/06)", async () => {
    const { app } = setup({ "x.md": GOOD_DOC })
    // %ZZ ไม่ใช่ valid percent-encoding → decodeURIComponent จะ throw URIError
    const res = await app.request("/d/%ZZx")
    // ต้องไม่ 500 — 400 หรือ 404 ก็ได้
    expect(res.status).toBeLessThan(500)
  })

  test("path traversal → 404 (docs/06)", async () => {
    const { app } = setup({ "x.md": GOOD_DOC })
    const res = await app.request("/d/..%2f..%2fetc")
    expect(res.status).toBe(404)
  })

  test("GET /assets/* — serve ตาม mime allowlist (docs/06)", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const { app } = setup({ "assets/img.png": png, "notes.txt": "nope" })
    const res = await app.request("/assets/assets/img.png")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'")
    // ต้อง revalidate ด้วย ETag เสมอ (docs/08 ข้อ 58)
    expect(res.headers.get("cache-control")).toBe("no-cache")
    const hash = res.headers.get("etag")?.replaceAll('"', "") as string
    expect(hash).toBeTruthy()

    // immutable ได้เฉพาะเมื่อ ?h= ตรงกับเนื้อไฟล์จริง
    const matched = await app.request(`/assets/assets/img.png?h=${hash}`)
    expect(matched.headers.get("cache-control")).toContain("immutable")

    const fake = await app.request("/assets/assets/img.png?h=abc123")
    expect(fake.status).toBe(200)
    expect(fake.headers.get("cache-control")).toBe("no-cache")

    const notAllowed = await app.request("/assets/notes.txt")
    expect(notAllowed.status).toBe(404)
  })

  test("GET /assets/missing — 404", async () => {
    const { app } = setup({})
    const res = await app.request("/assets/assets/nope.png")
    expect(res.status).toBe(404)
  })

  test("GET /static/client.js + content.css", async () => {
    const { app } = setup({ "x.md": GOOD_DOC })
    const js = await app.request("/static/client.js")
    expect(js.headers.get("content-type")).toBe("text/javascript; charset=utf-8")
    expect(await js.text()).toContain("EventSource")

    const css = await app.request("/static/content.css")
    expect(await css.text()).toContain(".doku-prose")
  })
})

describe("DocRenderer", () => {
  test("doc ไม่มีใน vault → DocNotFoundError จาก core", async () => {
    const fs = memoryVaultFs({})
    const renderer = new DocRenderer(fs, new VaultState(fs, "vault"), new FragmentCache(null, "1"))
    await expect(renderer.render("nope")).rejects.toBeInstanceOf(DocNotFoundError)
  })

  test("fragment = ส่วนเนื้อหา + warnings (header ย้ายไปหน้าเว็บ — M3.1)", async () => {
    const files = {
      "p/q.md": GOOD_DOC,
      "p/q.meta.json": JSON.stringify({ title: "สวัสดี", tags: ["th"] }),
    } as Record<string, string | Uint8Array>
    const fs = memoryVaultFs(files)
    const renderer = new DocRenderer(fs, new VaultState(fs, "vault"), new FragmentCache(null, "1"))
    const doc = await renderer.render("p/q")
    expect(doc.meta.title).toBe("สวัสดี")
    // fragment เก็บเฉพาะเนื้อหา — ชื่อเรื่อง/สรุป/meta render ที่ header ของหน้า (pages.tsx)
    expect(doc.fragment).not.toContain("doku-doc-title")
    expect(doc.fragment).toContain("เนื้อหายาว")
    expect(doc.warnings).toHaveLength(0)
  })
})

describe("M2 — styleguide + design system", () => {
  test("GET /styleguide — render ทุก block พร้อม syntax", async () => {
    const { app } = setup({ "welcome.md": GOOD_DOC })
    const res = await app.request("/styleguide")
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("Styleguide")
    expect(html).toContain('id="block-note"')
    expect(html).toContain('id="block-tabs"')
    expect(html).toContain('data-block="callout"')
    expect(html).toContain("doku-prose")
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'")
  })

  test("GET /static/content.css — มี tokens + block styles จาก @doku/core", async () => {
    const { app } = setup({})
    const res = await app.request("/static/content.css")
    expect(res.status).toBe(200)
    const css = await res.text()
    expect(css).toContain("--d-accent: #2b5fc4")
    expect(css).toContain("[data-block='callout']")
    expect(css).toContain("[data-block='tabs'][data-enhanced]")
    expect(css).toContain("@media print")
  })

  test("doc page มี progress bar + motion off ตาม meta.render.motion", async () => {
    const { app } = setup({
      "a.md": ":::motion{effect=fade-up}\nx\n:::\n",
      "a.meta.json": JSON.stringify({ render: { motion: false } }),
    })
    const html = await (await app.request("/d/a")).text()
    expect(html).toContain('class="doku-progress"')
    expect(html).toContain('data-motion="off"')
  })
})

describe("M3 chrome (toolbar / palette / trash page)", () => {
  function setupUi(files: Record<string, string | Uint8Array>) {
    const fs = memoryVaultFs(files)
    const state = new VaultState(fs, "vault")
    const cache = new FragmentCache(null, RENDERER_VERSION)
    const renderer = new DocRenderer(fs, state, cache)
    const hub = new SseHub()
    const app = createDokuApp({
      fs,
      vaultName: "vault",
      state,
      renderer,
      hub,
      trash: fs.trashStore(),
      revisions: memoryRevisionStore(),
      readPublic: async (name) => (name === "editor.js" ? "window.DokuEditor = {};" : null),
    })
    return { app, fs }
  }

  test("หน้าเอกสารมี chrome ครบ + ไอคอน inline svg (เขียนได้ทันที ไม่มี overlay)", async () => {
    const { app } = setupUi({ "a.md": GOOD_DOC })
    const html = await (await app.request("/d/a")).text()
    // M3.1: เครื่องมือของเอกสารอยู่ในเมนู ⋯ (docs/08 ข้อ 51) — ไม่ใช่แถวปุ่มเหนือชื่อเรื่อง
    expect(html).toContain('data-action="doc-menu"')
    expect(html).toContain('data-action="zen"')
    expect(html).toContain('data-action="palette"')
    expect(html).toContain('id="doku-palette"')
    // เขียนได้ทันที: ไม่มีปุ่ม/โหมดแก้ไข และไม่มี overlay editor อีก (docs/08 ข้อ 52)
    expect(html).not.toContain("doku-editor")
    expect(html).not.toContain('data-action="edit"')
    expect(html).toContain('id="doku-doc-body"')
    expect(html).toContain('id="doku-doc-md"')
    expect(html).toContain('id="doku-meta-form"')
    expect(html).toContain('id="doku-folder-form"')
    expect(html).toContain("/static/editor.js")
    // ไอคอน chrome = inline svg (docs/08 ข้อ 35)
    expect(html).toContain("<svg")
    expect(html).not.toContain("data-icon='folder'") // chrome ใช้ svg ไม่ใช้ mask
  })

  test("M3.1: TOC อยู่นอกบทความ (คอลัมน์ sticky) + colophon ท้ายเอกสาร", async () => {
    // TOC ต้องมี >= 2 heading ถึงจะแสดง (เหมือนเดิม) — ใช้เอกสารที่มีหัวข้อย่อยจริง
    const { app } = setupUi({ "a.md": "# หัวเรื่อง\n\n## ส่วนที่ 1\n\nก\n\n## ส่วนที่ 2\n\nข\n" })
    const html = await (await app.request("/d/a")).text()
    // TOC ไม่อยู่ใน fragment แล้ว → ต้อง bump RENDERER_VERSION (bump เป็น 5)
    expect(html).toContain('class="doku-toc-col"')
    expect(html).toContain("data-toc-link=")
    // เดิมเป็น mono label เหนือ h1 — ตอนนี้เป็น colophon ท้ายเอกสาร
    expect(html).not.toContain("doku-shelfmark")
    expect(html).toContain('class="doku-colophon"')
  })

  test("sidebar row มี data attributes สำหรับ drag/menu + folder meta", async () => {
    const { app, fs } = setupUi({ "projects/a.md": GOOD_DOC })
    await fs.writeText(
      "projects/_folder.meta.json",
      JSON.stringify({ title: "โครงการ", icon: "folder-open", color: "#2b5fc4", order: 2 }),
    )
    const html = await (await app.request("/")).text()
    expect(html).toContain('data-doc-id="projects/a"')
    expect(html).toContain('data-folder-path="projects"')
    expect(html).toContain('data-folder-color="#2b5fc4"')
    expect(html).toContain("โครงการ")
  })

  test("GET /trash — แสดงรายการที่ถูกลบ + ปุ่มกู้คืน", async () => {
    const { app, fs } = setupUi({ "a.md": GOOD_DOC })
    await fs.trashStore().put(["a.md"], { label: "a", kind: "doc" })
    const html = await (await app.request("/trash")).text()
    expect(html).toContain("Trash")
    expect(html).toContain('data-action="restore"')
    expect(html).toContain('data-action="empty-trash"')
  })

  test("GET /static/editor.js เสิร์ฟ bundle เมื่อมี (404 เมื่อไม่มี)", async () => {
    const { app } = setupUi({})
    const withBundle = await app.request("/static/editor.js")
    expect(withBundle.status).toBe(200)

    const fs2 = memoryVaultFs({})
    const app2 = createDokuApp({
      fs: fs2,
      vaultName: "vault",
      state: new VaultState(fs2, "vault"),
      renderer: new DocRenderer(
        fs2,
        new VaultState(fs2, "vault"),
        new FragmentCache(null, RENDERER_VERSION),
      ),
      hub: new SseHub(),
    })
    expect((await app2.request("/static/editor.js")).status).toBe(404)
  })
})

describe("client.js", () => {
  test("CLIENT_JS เป็น JS ที่ parse ได้ (ไม่มี syntax error) และมีฟีเจอร์ M3 ครบ", () => {
    // new Function จะ throw ถ้า syntax ผิด — จับได้ก่อนเปิดเบราว์เซอร์
    expect(() => new Function(CLIENT_JS)).not.toThrow()
    for (const marker of [
      "openPalette",
      "mountSurface",
      "flushSave",
      "data-dirty",
      "data-editor-mounted",
      "doku-inline-textarea",
      "openMeta",
      "openFolderSettings",
      "restoreTrash",
      "emptyTrash",
      "dragstart",
      "cycleTheme",
      "data-zen",
    ]) {
      expect(CLIENT_JS).toContain(marker)
    }
  })

  test("block control strip ไม่ผูกกับ focus ของ editor — pin ระหว่างโต้ตอบ ไม่ rebuild กลาง interaction (regression: แผงหายเมื่อคลิก select)", () => {
    // editor.ts: รายงาน directive จาก selection เสมอ — ห้ามกรองด้วย hasFocus
    // (เดิม: คลิกที่ strip → CM เสีย focus → ส่ง null → แผงหาย + rebuild DOM ทุก update)
    const editorSource = readFileSync(new URL("../src/web/editor.ts", import.meta.url), "utf8")
    expect(editorSource).not.toContain("update.view.hasFocus")
    expect(editorSource).toContain("options.onDirective?.(directiveAtCursor(update.view))")

    // client.ts: ตัดสินการซ่อนเอง + pin ระหว่างโต้ตอบ + rebuild เฉพาะเปลี่ยน block
    for (const marker of [
      "stripPin", // pin ระหว่างโต้ตอบกับแผง
      "data-strip-key", // rebuild เฉพาะเมื่อชื่อ/บรรทัด fence เปลี่ยน
      "syncStripValues", // อัปเดตค่า control ในที่ (ไม่สร้าง DOM ใหม่)
      "data-variant", // select เปลี่ยนชนิด block
      "schedulePatch", // text input แก้แบบ live (debounce ~300ms)
      "pointerdown", // คลิกนอกทั้ง CM และแผง → ซ่อน (วัดด้วยพิกัด)
      "inRect", // วัดด้วย getBoundingClientRect ไม่ใช่ contains อย่างเดียว
    ]) {
      expect(CLIENT_JS).toContain(marker)
    }
  })

  test("highlight ==mark== เป็นพื้นเต็มจางสี + แถบ swatch ตั้งค่าสี (regression: brush underline สีไม่เต็มข้อความ / {.color} ค้างเป็นข้อความดิบ — docs/08 ข้อ 6/55)", () => {
    // prose.ts: พื้นเต็ม mapped ตาม {.color} + clone ตอนพับบรรทัด (ห้ามกลับไป gradient)
    const proseSource = readFileSync(
      new URL("../../core/src/styles/prose.ts", import.meta.url),
      "utf8",
    )
    expect(proseSource).toContain("background-color: var(--dk-mapped-bg, var(--d-accent-weak))")
    expect(proseSource).toContain("box-decoration-break: clone")
    expect(proseSource).not.toContain("background-image")

    // editor.ts: regex จับ suffix {.color} + ซ่อน suffix เมื่อカーอยู่นอกช่วง + patchMark
    const editorSource = readFileSync(new URL("../src/web/editor.ts", import.meta.url), "utf8")
    expect(editorSource).toContain("DOKU_MARK = /==([^=\\n]+?)==(\\{\\.[\\w-]+\\})?/g")
    expect(editorSource).toContain("patchMark(color: string | null)")
    expect(editorSource).toContain('"data-color": color')
    expect(editorSource).toContain("onMark")

    // app.css: .cm-doku-mark ใช้พื้นเต็ม ไม่ใช่ gradient ตายตัว
    const appCss = readFileSync(new URL("../src/web/styles/app.css", import.meta.url), "utf8")
    expect(appCss).not.toContain("linear-gradient(transparent 58%")
    expect(appCss).toContain(".cm-doku-mark")
    expect(appCss).toContain(".doku-mark-swatch")

    // client.ts: แถบ swatch — pin แยกจาก block strip + patchMark เขียนกลับ markdown + a11y
    for (const marker of [
      "renderMarkStrip", // state machine ของแถบ mark
      "doku-mark-strip", // element แยกจาก block strip (mark อยู่ “ใน” directive ได้)
      "markPin", // pin ระหว่างโต้ตอบ — reuse กลไก stripPin
      "data-mark-key", // rebuild เฉพาะเปลี่ยน mark (บรรทัดต่างกัน)
      "syncMarkBar", // อัปเดตสีในที่ ไม่ rebuild
      "patchMark(null)", // ปุ่ม “ไม่ระบุสี” ลบ suffix
      "aria-pressed", // บอกสีปัจจุบันสำหรับ screen reader
      "สีไฮไลต์: ", // aria-label ชื่อสีไทย
    ]) {
      expect(CLIENT_JS).toContain(marker)
    }
  })

  test("one surface: ไม่มีการ swap/ออกโหมด — มีงานค้างต้อง flush ก่อน navigate (docs/08 ข้อ 65)", () => {
    // swap path ของ M3.1 ถูกถอดทั้งหมด: ไม่มี enterWriting/exitWriting/paintRendered
    expect(CLIENT_JS).not.toContain("enterWriting")
    expect(CLIENT_JS).not.toContain("exitWriting")
    expect(CLIENT_JS).not.toContain("paintRendered")
    expect(CLIENT_JS).not.toContain("offsetForElement")
    expect(CLIENT_JS).not.toContain("data-editing")
    expect(CLIENT_JS).not.toContain("/api/render") // หลัง mount ไม่มี re-render request อีก

    // mount ครั้งเดียวตอน idle (progressive enhancement) + guard ด้วย data-dirty
    expect(CLIENT_JS).toContain("requestIdleCallback")
    expect(CLIENT_JS).toContain("function shouldReloadOnChange")
    expect(CLIENT_JS).toContain('hasAttribute("data-dirty")')

    // ทาง chrome-ลิงก์: preventDefault + flush (await) ก่อน navigate
    const navFnAt = CLIENT_JS.indexOf("void (async () => {")
    expect(navFnAt).toBeGreaterThan(-1)
    const navFnEnd = CLIENT_JS.indexOf("})();", navFnAt)
    const navBlock = CLIENT_JS.slice(navFnAt, navFnEnd)
    expect(navBlock).toContain("await flushForNavigation();")
    expect(navBlock).toContain("window.location.href = link.href;")

    // guard คีย์: ctrl/shift/alt/meta หรือ middle-click → ปล่อยเบราว์เซอร์ (เปิดแท็บใหม่)
    expect(CLIENT_JS).toContain(
      "event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey",
    )

    // TOC: ลิงก์ #… ต้องเลื่อนカーใน editor ได้ (CM6 ไม่มี id ใน DOM → heading map)
    expect(CLIENT_JS).toContain("function scrollToHeading")
    expect(CLIENT_JS).toContain("function buildHeadingMap")
  })

  test("slash menu กรองตามที่พิมพ์ได้ทุกคีย์ + รวมสระ/วรรณยุกต์ไทย + จัดอันดับ (regression: พิมพ์ /vi ไม่กรอง / พิมพ์ /วิ เมนูหาย — docs/08 ข้อ 55)", () => {
    const editorSource = readFileSync(new URL("../src/web/editor.ts", import.meta.url), "utf8")
    // สแกนเฉพาะช่วง function slashCompletion ถึงจุดสิ้นสุด section — กัน false positive จากโค้ดส่วนอื่น
    const start = editorSource.indexOf("function slashCompletion")
    const end = editorSource.indexOf("/* ── block control strip")
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const slash = editorSource.slice(start, end)

    // 1) trigger/จับ query ต้องรวม \p{M} (สระ/วรรณยุกต์ไทย combining) — ไม่งั้นพิมพ์ /วิ แล้วเมนูปิด
    expect(slash).toContain("[\\p{L}\\p{M}\\p{N}_-]")
    // 2) ห้ามมี validFor ในผลลัพธ์ของ source — มี validFor = CM ใช้ผลเดิมซ้ำไม่เรียก source → ไม่กรองทุกคีย์
    expect(slash).not.toMatch(/validFor\s*:/)
    // 3) ยังส่ง filter: false — CM กรองด้วย fuzzy matcher บน label อังกฤษ พิมพ์ไทยจะโดนกรองเป็นศูนย์
    expect(slash).toContain("filter: false")
    // 4) จัดอันดับเอง: keyword ขึ้นต้น > label ขึ้นต้น > มีคำใน label (query ว่าง = ลำดับเดิม)
    expect(slash).toContain("tier")

    // 5) regex จริงจากซอร์ส ต้อง match และจับ query ถูกกลุ่ม — เคสไทยที่มี combining mark
    const literal = editorSource.match(/const match = \/(.+?)\/u\.exec/)
    expect(literal).not.toBeNull()
    const trigger = new RegExp(literal?.[1] as string, "u")
    for (const [text, query] of [
      ["/วิ", "วิ"],
      ["/หัว", "หัว"],
      ["/vi", "vi"],
      ["ทดสอบ /เรื่อง", "เรื่อง"],
    ] as const) {
      const m = trigger.exec(text)
      expect(m).not.toBeNull()
      expect(m?.[2]).toBe(query)
    }
    // พิมพ์ตัวอักษรที่ไม่อยู่คลาส (เช่น ปิดท้ายด้วยช่องว่าง) → ไม่ trigger
    expect(trigger.exec("/วิ ")).toBeNull()
  })

  test("rename doc/folder = inline editor ใน sidebar ไม่ใช้ window.prompt + dblclick + กัน # (docs/08 ข้อ 56)", () => {
    // เดิม: renameDoc และ folder "เปลี่ยนชื่อ" ใช้ window.prompt — UX หลุดจากหน้า
    // สแกนเฉพาะช่วง renameDoc กับ folder rename ใน rowMenu (newDoc/newFolder/move
    // ยังใช้ prompt ได้ — เกินขอบเขตของการแก้นี้)
    const renameAt = CLIENT_JS.indexOf("async function renameDoc")
    expect(renameAt).toBeGreaterThan(-1)
    const renameBlock = CLIENT_JS.slice(renameAt, CLIENT_JS.indexOf("\n  }", renameAt))
    expect(renameBlock).not.toContain("window.prompt")
    expect(renameBlock).toContain("startInlineRename(") // doc rename = inline

    const rowMenuAt = CLIENT_JS.indexOf("function rowMenu")
    expect(rowMenuAt).toBeGreaterThan(-1)
    const folderMenuBlock = CLIENT_JS.slice(rowMenuAt, CLIENT_JS.indexOf("\n  }", rowMenuAt))
    expect(folderMenuBlock).not.toContain("window.prompt")
    expect(folderMenuBlock).toContain("startInlineRename(") // folder rename = inline

    // คอร์ inline editor ต้องมี: ค่าเริ่ม basename · select · Enter/Esc/blur · a11y
    for (const marker of [
      "function startInlineRename",
      "aria-label", // input rename ต้องมี aria-label (เปลี่ยนชื่อเอกสาร/โฟลเดอร์)
      "เปลี่ยนชื่อเอกสาร",
      "เปลี่ยนชื่อโฟลเดอร์",
      ".select()",
    ]) {
      expect(CLIENT_JS).toContain(marker)
    }

    // กัน # ในชื่อไฟล์ (ข้อ 56) — ต้องเช็คก่อนเรียก move แล้วค้างโหมดแก้
    const inlineAt = CLIENT_JS.indexOf("function startInlineRename")
    const inlineBlock = CLIENT_JS.slice(inlineAt, CLIENT_JS.indexOf("\n  }", inlineAt))
    const hashAt = inlineBlock.indexOf("#")
    expect(hashAt).toBeGreaterThan(-1)
    const moveCallAt = inlineBlock.indexOf("moveDoc(path")
    expect(moveCallAt).toBeGreaterThan(hashAt) // เช็ค # ก่อนเรียก move

    // dblclick rename: เอกสาร active + โฟลเดอร์ (กัน toggle รอบที่สองด้วย event.detail)
    expect(CLIENT_JS).toContain('addEventListener("dblclick"')
    expect(CLIENT_JS).toContain("event.detail === 2")
    expect(CLIENT_JS).toContain(".doku-folder-summary")

    // คลิกลิงก์เอกสาร active = ไม่ reload (เทียบ pathname + เมื่อหน้าปัจจุบันคือ /d/*)
    expect(CLIENT_JS).toContain("new URL(link.href).pathname === window.location.pathname")
    expect(CLIENT_JS).toContain("a[data-doc-link]")

    // CSS ของ inline input — border ตาม token (docs/03 §1.1)
    const appCss = readFileSync(new URL("../src/web/styles/app.css", import.meta.url), "utf8")
    expect(appCss).toContain(".doku-rename-input")
    const cssAt = appCss.indexOf(".doku-rename-input")
    const cssBlock = appCss.slice(cssAt, appCss.indexOf("}", cssAt))
    expect(cssBlock).toContain("var(--d-border-control)")
  })
})

describe("cache key ต้องผูกกับ path id (regression: cache collision)", () => {
  test("เอกสารต่างโฟลเดอร์ที่ md+meta เหมือนกัน ไม่ได้ fragment ของกัน", async () => {
    const { app, cache } = setup({
      "one/a.md": "[go](b.md)\n",
      "one/b.md": "# B\n",
      "two/a.md": "[go](b.md)\n",
      "two/b.md": "# B\n",
    })
    const first = await (await app.request("/d/one/a")).text()
    const second = await (await app.request("/d/two/a")).text()
    expect(first).toContain('href="/d/one/b"')
    expect(second).toContain('href="/d/two/b"')
    expect(cache.size).toBe(2)

    // sidecar เปลี่ยนแต่ meta ที่ parse แล้วเท่ากัน (unknown field) → ต้อง render ใหม่
    const before = await (await app.request("/d/one/a")).text()
    expect(before).toBe(first)
  })
})

describe("asset route + static caching (M3 fixes)", () => {
  test("asset path ที่ขึ้นต้นด้วยชื่อ vault ไม่ถูก strip", async () => {
    const { app } = setup({ "vault/diagram.png": new Uint8Array([1, 2, 3]) })
    const res = await app.request("/assets/vault/diagram.png")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
  })

  test("ไฟล์ที่ไม่มีนามสกุลไม่ถูกเสิร์ฟเป็น image (extension ต้องมาจาก basename + มีจุดจริง)", async () => {
    const { app } = setup({ png: "<svg onload=alert(1)>", "v1.png/secret": "x" })
    expect((await app.request("/assets/png")).status).toBe(404)
    expect((await app.request("/assets/v1.png/secret")).status).toBe(404)
    // ext ต้องมาจาก basename ไม่ใช่ทั้ง path
    expect((await app.request("/assets/dir.png/x.txt")).status).toBe(404)
  })

  test("ชื่อไฟล์ที่ไม่ผ่าน charset → 404 (docs/08 ข้อ 72)", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    const { app } = setup({
      "assets/a(1).png": png,
      "assets/a&#38;b.png": png,
      "assets/รูป ภาพ.png": png,
    })
    expect((await app.request(`/assets/assets/${encodeURIComponent("a(1).png")}`)).status).toBe(404)
    expect((await app.request(`/assets/assets/${encodeURIComponent("a&b.png")}`)).status).toBe(404)
    // ชื่อที่ผ่าน charset (ไทย + ช่องว่าง) ยังเสิร์ฟได้
    const ok = await app.request(`/assets/assets/${encodeURIComponent("รูป ภาพ.png")}`)
    expect(ok.status).toBe(200)
    expect(ok.headers.get("content-type")).toBe("image/png")
  })

  test("If-None-Match แบบ weak/list ตอบ 304", async () => {
    const { app } = setup({})
    const app2 = createDokuApp({
      fs: memoryVaultFs({}),
      vaultName: "vault",
      state: new VaultState(memoryVaultFs({}), "vault"),
      renderer: new DocRenderer(
        memoryVaultFs({}),
        new VaultState(memoryVaultFs({}), "vault"),
        new FragmentCache(null, RENDERER_VERSION),
      ),
      hub: new SseHub(),
      readPublic: async (name) => (name === "editor.js" ? "window.DokuEditor = {};" : null),
    })
    const first = await app2.request("/static/editor.js")
    const token = (first.headers.get("etag") ?? "").replaceAll('"', "")
    expect(token).not.toBe("")
    expect(
      (await app2.request("/static/editor.js", { headers: { "if-none-match": `"${token}"` } }))
        .status,
    ).toBe(304)
    expect(
      (await app2.request("/static/editor.js", { headers: { "if-none-match": `W/"${token}"` } }))
        .status,
    ).toBe(304)
    expect(
      (await app2.request("/static/editor.js", { headers: { "if-none-match": `"x", "${token}"` } }))
        .status,
    ).toBe(304)
    expect((await app.request("/static/editor.js")).status).toBe(404)
  })

  test("badge trash อัปเดตทันทีหลัง put (ไม่มี cache ค้าง)", async () => {
    const fs = memoryVaultFs({ "a.md": GOOD_DOC })
    const state = new VaultState(fs, "vault")
    const app = createDokuApp({
      fs,
      vaultName: "vault",
      state,
      renderer: new DocRenderer(fs, state, new FragmentCache(null, RENDERER_VERSION)),
      hub: new SseHub(),
      trash: fs.trashStore(),
      revisions: memoryRevisionStore(),
    })
    expect(await (await app.request("/")).text()).not.toContain('class="doku-rail-count"')
    await fs.trashStore().put(["a.md"], { label: "a", kind: "doc" })
    expect(await (await app.request("/")).text()).toContain('class="doku-rail-count"')
  })
})
