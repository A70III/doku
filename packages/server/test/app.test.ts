import { describe, expect, test } from "bun:test"
import { DocNotFoundError, memoryVaultFs, RENDERER_VERSION, type VaultFs } from "@doku/core"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"

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
