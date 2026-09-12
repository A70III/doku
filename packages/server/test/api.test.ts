/**
 * M3 REST API — docs CRUD/move, folders, trash, revisions, ETag/If-Match (docs/05)
 */

import { describe, expect, test } from "bun:test"
import {
  memoryRevisionStore,
  memoryVaultFs,
  RENDERER_VERSION,
  type WritableVaultFs,
} from "@doku/core"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"

function setup(files: Record<string, string> = {}) {
  const fs = memoryVaultFs(files) as WritableVaultFs & ReturnType<typeof memoryVaultFs>
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
  })
  return { app, fs, state, cache }
}

const DOC = "# หัวเรื่อง\n\nเนื้อหา\n"

async function createDoc(
  app: ReturnType<typeof setup>["app"],
  path: string,
  md: string,
  meta?: unknown,
) {
  return app.request(`/api/docs/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(meta === undefined ? { md } : { md, meta }),
  })
}

async function etagOf(app: ReturnType<typeof setup>["app"], path: string): Promise<string> {
  const res = await app.request(`/api/docs/${path}`)
  return res.headers.get("etag")?.replaceAll('"', "") ?? ""
}

describe("GET /api/docs", () => {
  test("list metadata + filter tag/q/limit", async () => {
    const { app } = setup({
      "a.md": DOC,
      "a.meta.json": JSON.stringify({ title: "Alpha", tags: ["x"] }),
      "b.md": DOC,
      "b.meta.json": JSON.stringify({ title: "Beta", tags: ["y"] }),
    })
    const all = await (await app.request("/api/docs")).json()
    expect(all.ok).toBe(true)
    expect(all.docs.map((doc: { id: string }) => doc.id).sort()).toEqual(["a", "b"])

    const byTag = await (await app.request("/api/docs?tag=y")).json()
    expect(byTag.docs.map((doc: { id: string }) => doc.id)).toEqual(["b"])

    const byQuery = await (await app.request("/api/docs?q=alph")).json()
    expect(byQuery.docs.map((doc: { id: string }) => doc.id)).toEqual(["a"])

    const limited = await (await app.request("/api/docs?limit=1")).json()
    expect(limited.docs).toHaveLength(1)
  })

  test("GET /api/docs/*path คืน md + meta + etag", async () => {
    const { app } = setup({ "a.md": DOC, "a.meta.json": JSON.stringify({ title: "Alpha" }) })
    const res = await app.request("/api/docs/a")
    expect(res.status).toBe(200)
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/)
    const body = await res.json()
    expect(body.md).toBe(DOC)
    expect(body.meta.title).toBe("Alpha")
  })

  test("ไม่พบ → 404 · path traversal → 400", async () => {
    const { app } = setup({ "a.md": DOC })
    expect((await app.request("/api/docs/missing")).status).toBe(404)
    expect((await app.request("/api/docs/..%2F..%2Fetc%2Fpasswd")).status).toBe(400)
  })

  test("format=html คืน fragment", async () => {
    const { app } = setup({ "a.md": DOC })
    const body = await (await app.request("/api/docs/a?format=html")).json()
    expect(body.html).toContain("doku-doc-header")
  })
})

describe("docs write + ETag", () => {
  test("POST สร้างใหม่ → 201 (มี etag) · ซ้ำ → 409", async () => {
    const { app, fs } = setup({})
    const res = await createDoc(app, "projects/x", DOC, { title: "X", tags: ["note"] })
    expect(res.status).toBe(201)
    expect(await fs.readText("projects/x.md")).toBe(DOC)
    expect(JSON.parse((await fs.readText("projects/x.meta.json")) ?? "{}").title).toBe("X")

    const again = await createDoc(app, "projects/x", DOC)
    expect(again.status).toBe(409)
    expect((await again.json()).error.code).toBe("already_exists")
  })

  test("POST meta ที่ผิด schema → 400 meta_invalid พร้อม fields", async () => {
    const { app } = setup({})
    const res = await createDoc(app, "x", DOC, { tags: ["BAD TAG"] })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error.code).toBe("meta_invalid")
    expect(body.error.fields.length).toBeGreaterThan(0)
  })

  test("PUT ไม่ส่ง If-Match → 428 · etag ผิด → 409 · ถูก → 200", async () => {
    const { app, fs } = setup({ "a.md": DOC })
    const missing = await app.request("/api/docs/a", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ md: "# new\n" }),
    })
    expect(missing.status).toBe(428)

    const stale = await app.request("/api/docs/a", {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"deadbeef"' },
      body: JSON.stringify({ md: "# new\n" }),
    })
    expect(stale.status).toBe(409)
    expect(stale.headers.get("etag")).toBeTruthy()

    const etag = await etagOf(app, "a")
    const ok = await app.request("/api/docs/a", {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": `"${etag}"` },
      body: JSON.stringify({ md: "# new\n" }),
    })
    expect(ok.status).toBe(200)
    expect(await fs.readText("a.md")).toBe("# new\n")
  })

  test("PATCH merge meta บาง field (ไม่ทับ field อื่น)", async () => {
    const { app, fs } = setup({
      "a.md": DOC,
      "a.meta.json": JSON.stringify({ title: "Alpha", tags: ["x"], status: "draft" }),
    })
    const etag = await etagOf(app, "a")
    const res = await app.request("/api/docs/a", {
      method: "PATCH",
      headers: { "content-type": "application/json", "if-match": `"${etag}"` },
      body: JSON.stringify({ meta: { pinned: true } }),
    })
    expect(res.status).toBe(200)
    const stored = JSON.parse((await fs.readText("a.meta.json")) ?? "{}")
    expect(stored.title).toBe("Alpha")
    expect(stored.tags).toEqual(["x"])
    expect(stored.pinned).toBe(true)
  })

  test("PUT ทับแล้วเก็บ revision (kู้คืนได้)", async () => {
    const { app, fs } = setup({ "a.md": "# v1\n" })
    const etag = await etagOf(app, "a")
    await app.request("/api/docs/a", {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": `"${etag}"` },
      body: JSON.stringify({ md: "# v2\n" }),
    })
    const list = await (await app.request("/api/revisions/a")).json()
    expect(list.items).toHaveLength(1)

    const restore = await app.request("/api/revisions/a", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(restore.status).toBe(200)
    expect(await fs.readText("a.md")).toBe("# v1\n")
  })
})

describe("move", () => {
  test("ย้ายเอกสาร + update links + moved_from", async () => {
    const { app, fs } = setup({
      "a.md": "ดู [b](./b.md) และ [[b]]\n",
      "b.md": "# B\n",
    })
    const res = await app.request("/api/docs/b/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "sub/b" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.to).toBe("sub/b")
    expect(body.updated_links).toBeGreaterThan(0)

    expect(await fs.readText("b.md")).toBeNull()
    expect(await fs.readText("sub/b.md")).toBe("# B\n")
    expect(await fs.readText("a.md")).toBe("ดู [b](./sub/b.md) และ [[b]]\n")

    const meta = JSON.parse((await fs.readText("sub/b.meta.json")) ?? "{}")
    expect(meta.relations.moved_from).toEqual(["b"])
  })

  test("ปลายทางซ้ำ → 409 · ต้นทางไม่มี → 404", async () => {
    const { app } = setup({ "a.md": DOC, "b.md": DOC })
    const clash = await app.request("/api/docs/a/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "b" }),
    })
    expect(clash.status).toBe(409)
    const missing = await app.request("/api/docs/zzz/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "c" }),
    })
    expect(missing.status).toBe(404)
  })
})

describe("delete + trash", () => {
  test("DELETE = soft-delete → อยู่ใน trash → restore กลับ", async () => {
    const { app, fs } = setup({ "a.md": DOC, "a.meta.json": JSON.stringify({ title: "A" }) })
    const res = await app.request("/api/docs/a", { method: "DELETE" })
    expect(res.status).toBe(200)
    const item = (await res.json()).trash
    expect(item.kind).toBe("doc")
    expect(await fs.readText("a.md")).toBeNull()

    const trash = await (await app.request("/api/trash")).json()
    expect(trash.items).toHaveLength(1)

    const restore = await app.request(`/api/trash/${item.id}/restore`, { method: "POST" })
    expect(restore.status).toBe(200)
    expect(await fs.readText("a.md")).toBe(DOC)
    expect((await (await app.request("/api/trash")).json()).items).toEqual([])
  })

  test("restore ทับ path เดิมที่มีอยู่ → 409", async () => {
    const { app } = setup({ "a.md": DOC })
    const deleted = await (await app.request("/api/docs/a", { method: "DELETE" })).json()
    await createDoc(app, "a", "# ใหม่\n")
    const restore = await app.request(`/api/trash/${deleted.trash.id}/restore`, { method: "POST" })
    expect(restore.status).toBe(409)
  })

  test("empty trash ลบถาวร", async () => {
    const { app, fs } = setup({ "a.md": DOC })
    await app.request("/api/docs/a", { method: "DELETE" })
    const res = await app.request("/api/trash/empty", { method: "POST" })
    expect((await res.json()).removed).toBe(1)
    expect(await fs.readText("a.md")).toBeNull()
  })

  test("restore id ที่ไม่ใช่ trash id → 404", async () => {
    const { app } = setup({})
    expect((await app.request("/api/trash/..%2F..%2Fetc/restore", { method: "POST" })).status).toBe(
      404,
    )
  })
})

describe("folders", () => {
  test("create → patch folder meta → tree แสดง title/icon", async () => {
    const { app, fs } = setup({})
    expect((await app.request("/api/folders/projects", { method: "POST" })).status).toBe(201)
    expect(await fs.exists("projects")).toBe(true)
    expect((await app.request("/api/folders/projects", { method: "POST" })).status).toBe(409)

    const patch = await app.request("/api/folders/projects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "โครงการ", icon: "folder-open", color: "#2b5fc4", order: 1 }),
    })
    expect(patch.status).toBe(200)

    const tree = await (await app.request("/api/tree")).json()
    const folder = tree.tree.find((node: { path: string }) => node.path === "projects")
    expect(folder.title).toBe("โครงการ")
    expect(folder.icon).toBe("folder-open")
  })

  test("patch folder meta ที่ผิด schema → 400", async () => {
    const { app } = setup({})
    await app.request("/api/folders/projects", { method: "POST" })
    const res = await app.request("/api/folders/projects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ color: "blue" }),
    })
    expect(res.status).toBe(400)
  })

  test("delete โฟลเดอร์ไม่ว่าง → 409 · recursive → ok", async () => {
    const { app, fs } = setup({ "projects/a.md": DOC })
    const notEmpty = await app.request("/api/folders/projects", { method: "DELETE" })
    expect(notEmpty.status).toBe(409)
    expect((await notEmpty.json()).error.code).toBe("folder_not_empty")

    const recursive = await app.request("/api/folders/projects?recursive=true", {
      method: "DELETE",
    })
    expect(recursive.status).toBe(200)
    expect(await fs.readText("projects/a.md")).toBeNull()
  })

  test("move โฟลเดอร์ + update links", async () => {
    const { app, fs } = setup({
      "projects/a.md": "ดู [b](./b.md)\n",
      "projects/b.md": "# B\n",
      "root.md": "[a](./projects/a.md)\n",
    })
    const res = await app.request("/api/folders/projects/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: "archive/projects" }),
    })
    expect(res.status).toBe(200)
    expect(await fs.readText("archive/projects/a.md")).toBe("ดู [b](./b.md)\n")
    expect(await fs.readText("root.md")).toBe("[a](./archive/projects/a.md)\n")
  })

  test("tree depth", async () => {
    const { app } = setup({ "a/b/c.md": DOC })
    const depth1 = await (await app.request("/api/tree?depth=1")).json()
    const a = depth1.tree.find((node: { path: string }) => node.path === "a")
    expect(a.children).toEqual([])
    const full = await (await app.request("/api/tree")).json()
    expect(full.tree[0].children.length).toBeGreaterThan(0)
  })
})

describe("render + rate limit", () => {
  test("POST /api/render stateless", async () => {
    const { app } = setup({})
    const res = await app.request("/api/render", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ md: "# hi\n\n**bold**\n" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.html).toContain("<strong>bold</strong>")
  })

  test("body ไม่ใช่ JSON → 400", async () => {
    const { app } = setup({})
    const res = await app.request("/api/render", { method: "POST", body: "not json" })
    expect(res.status).toBe(400)
  })
})
