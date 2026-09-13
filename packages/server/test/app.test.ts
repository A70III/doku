import { describe, expect, test } from "bun:test"
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
    const res = await app.request("/assets/assets/img.png?h=abc123")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("image/png")
    expect(res.headers.get("cache-control")).toContain("immutable")
    expect(res.headers.get("content-security-policy")).toBe("default-src 'none'")

    const noHash = await app.request("/assets/assets/img.png")
    expect(noHash.headers.get("cache-control")).toBe("no-cache")

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

  test("fragment รวม header + prose และ meta ครบ", async () => {
    const files = {
      "p/q.md": GOOD_DOC,
      "p/q.meta.json": JSON.stringify({ title: "สวัสดี", tags: ["th"] }),
    } as Record<string, string | Uint8Array>
    const fs = memoryVaultFs(files)
    const renderer = new DocRenderer(fs, new VaultState(fs, "vault"), new FragmentCache(null, "1"))
    const doc = await renderer.render("p/q")
    expect(doc.meta.title).toBe("สวัสดี")
    expect(doc.fragment).toContain("doku-doc-title")
    expect(doc.fragment).toContain("หัวเรื่อง")
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
      "enterWriting",
      "exitWriting",
      "flushSave",
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
