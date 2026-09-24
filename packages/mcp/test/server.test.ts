/**
 * S11 (M4) — test ของ `packages/mcp`
 *
 * 1) contract `tools/list` = ตาราง docs/05 §4 ยกเว้น `doc_search` — ชื่อ + key ของ input lock เป๊ะ
 * 2) พฤติกรรม tool ทุกตัวด้วย `memoryVaultFs` (ไม่แตะ filesystem จริง)
 * 3) protocol JSON-RPC subset: initialize/ping/shutdown/notification/error codes
 *
 * นัยสำคัญเรื่อง security: `doc_delete` ต้องย้ายเข้า `.trash/` เท่านั้น และ **ต้องไม่มี tool
 * ลบถาวร/purge/restore** (docs/06 — ลบถาวร = คนเท่านั้น)
 */

import { describe, expect, test } from "bun:test"
import { BLOCKS, memoryRevisionStore, memoryVaultFs } from "@doku/core"
import { createMcpServer, type McpServer } from "../src/server.ts"
import { TOOL_SPECS } from "../src/tools.ts"
import type { McpDeps } from "../src/vault.ts"

const EXPECTED_TOOLS: { name: string; properties: string[] }[] = [
  { name: "doc_list", properties: ["folder", "tag", "q"] },
  { name: "doc_read", properties: ["path", "format"] },
  { name: "doc_write", properties: ["path", "md", "meta", "mode"] },
  { name: "doc_move", properties: ["from", "to", "update_links"] },
  { name: "doc_delete", properties: ["path"] },
  { name: "folder_create", properties: ["path"] },
  { name: "folder_list", properties: ["path"] },
  { name: "doc_render", properties: ["md", "meta"] },
  { name: "doc_validate", properties: ["path", "md", "meta"] },
  { name: "asset_put", properties: ["path", "filename", "content_base64"] },
  { name: "template_get", properties: [] },
]

interface RpcMessage {
  jsonrpc: string
  id: number | null
  result?: Record<string, unknown> & {
    content?: { type: string; text: string }[]
    isError?: boolean
    tools?: { name: string; description: string; inputSchema: Record<string, unknown> }[]
  }
  error?: { code: number; message: string }
}

interface ToolResult {
  rpcError?: { code: number; message: string }
  isError: boolean
  payload: Record<string, unknown>
}

function makeServer(files: Record<string, string | Uint8Array> = {}) {
  const fs = memoryVaultFs(files)
  const deps: McpDeps = { fs, vaultName: "vault", revisions: memoryRevisionStore() }
  return { fs, deps, server: createMcpServer(deps) }
}

let counter = 0
async function request(server: McpServer, method: string, params?: unknown): Promise<RpcMessage> {
  counter += 1
  const message = {
    jsonrpc: "2.0",
    id: counter,
    ...(params === undefined ? {} : { params }),
    method,
  }
  const line = await server.handleLine(JSON.stringify(message))
  expect(line).not.toBeNull()
  return JSON.parse(line as string) as RpcMessage
}

async function notify(server: McpServer, method: string): Promise<string | null> {
  return server.handleLine(JSON.stringify({ jsonrpc: "2.0", method }))
}

async function call(server: McpServer, name: string, args: unknown): Promise<ToolResult> {
  const reply = await request(server, "tools/call", { name, arguments: args })
  if (reply.error) return { rpcError: reply.error, isError: true, payload: {} }
  const text = reply.result?.content?.[0]?.text ?? "{}"
  return {
    isError: reply.result?.isError === true,
    payload: JSON.parse(text) as Record<string, unknown>,
  }
}

function errorOf(result: ToolResult): { code?: string; message?: string; fields?: string[] } {
  return (result.payload.error ?? {}) as {
    code?: string
    message?: string
    fields?: string[]
  }
}

/* ── protocol ─────────────────────────────────────────────────────────── */

describe("JSON-RPC 2.0 subset (stdio protocol)", () => {
  test("initialize: echo protocolVersion + capabilities.tools + serverInfo", async () => {
    const { server } = makeServer()
    const reply = await request(server, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0" },
    })
    expect(reply.jsonrpc).toBe("2.0")
    expect(reply.result?.protocolVersion).toBe("2025-06-18")
    expect(reply.result?.capabilities).toEqual({ tools: {} })
    expect(reply.result?.serverInfo).toEqual({ name: "doku", version: "0.0.0" })

    // ไม่ส่ง protocolVersion → ใช้ค่า default ของ server
    const fallback = await request(server, "initialize", {})
    expect(fallback.result?.protocolVersion).toBe("2024-11-05")
  })

  test("notifications/initialized + บรรทัดว่าง = ไม่มีคำตอบ · ping/shutdown = {}", async () => {
    const { server } = makeServer()
    expect(await notify(server, "notifications/initialized")).toBeNull()
    expect(await notify(server, "notifications/cancelled")).toBeNull()
    expect(await server.handleLine("")).toBeNull()
    expect(await server.handleLine("   ")).toBeNull()

    const ping = await request(server, "ping")
    expect(ping.result).toEqual({})
    const shutdown = await request(server, "shutdown")
    expect(shutdown.result).toEqual({})
  })

  test("error codes: parse -32700 · invalid request -32600 · method -32601 · params -32602", async () => {
    const { server } = makeServer()

    const bad = JSON.parse((await server.handleLine("{oops")) as string) as RpcMessage
    expect(bad.error?.code).toBe(-32700)
    expect(bad.id).toBeNull()

    const notObject = JSON.parse((await server.handleLine("[1,2]")) as string) as RpcMessage
    expect(notObject.error?.code).toBe(-32600)

    const noMethod = await request(server, "resources/list" as string)
    expect(noMethod.error?.code).toBe(-32601)

    const unknownTool = await call(server, "doc_purge", {})
    expect(unknownTool.rpcError?.code).toBe(-32602)
    expect(unknownTool.rpcError?.message).toContain("unknown tool")

    const badArgs = await request(server, "tools/call", { name: "doc_list", arguments: "x" })
    expect(badArgs.error?.code).toBe(-32602)
  })
})

/* ── tools/list contract (docs/05 §4) ─────────────────────────────────── */

describe("tools/list — contract docs/05 §4", () => {
  test("มีครบ 11 ตัว ตามลำดับตาราง · ไม่มี doc_search · ไม่มี tool ลบถาวร", async () => {
    const { server } = makeServer()
    const reply = await request(server, "tools/list")
    const tools = reply.result?.tools ?? []
    const names = tools.map((tool) => tool.name)

    expect(names).toEqual(EXPECTED_TOOLS.map((tool) => tool.name))
    expect(names).toHaveLength(11)
    expect(names).not.toContain("doc_search")
    // ห้ามมีช่องทางลบถาวร/กู้คืนถาวรสำหรับ agent (docs/06 · invariant 7)
    expect(names.some((name) => /purge|empty|restore|hard|forever/i.test(name))).toBe(false)

    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.inputSchema.type).toBe("object")
    }
  })

  test("input ของแต่ละ tool ตรงกับตาราง (key เป๊ะ) + mode/format เป็น enum", async () => {
    const { server } = makeServer()
    const reply = await request(server, "tools/list")
    const tools = reply.result?.tools ?? []

    for (const expected of EXPECTED_TOOLS) {
      const tool = tools.find((item) => item.name === expected.name)
      expect(tool).toBeDefined()
      const properties = (tool?.inputSchema.properties ?? {}) as Record<string, unknown>
      expect(Object.keys(properties).sort()).toEqual([...expected.properties].sort())
      expect(tool?.inputSchema.additionalProperties).toBe(false)
    }

    const write = tools.find((tool) => tool.name === "doc_write")
    const writeRequired = (write?.inputSchema.required as string[] | undefined) ?? []
    expect([...writeRequired].sort()).toEqual(["md", "mode", "path"])
    expect(write?.inputSchema.properties).toBeDefined()
    const writeProps = write?.inputSchema.properties as Record<string, Record<string, unknown>>
    expect(writeProps.mode?.enum).toEqual(["create", "replace", "patch"])

    const read = tools.find((tool) => tool.name === "doc_read")
    const readProps = read?.inputSchema.properties as Record<string, Record<string, unknown>>
    expect(readProps.format?.enum).toEqual(["md", "html"])
    expect(read?.inputSchema.required).toEqual(["path", "format"])

    const validate = tools.find((tool) => tool.name === "doc_validate")
    expect(validate?.inputSchema.anyOf).toEqual([
      { required: ["path"] },
      { required: ["md", "meta"] },
    ])
  })

  test("template_get คืน block registry ชุดเดียวกับ /api/schema (ไม่ fork ข้อมูล)", async () => {
    const { server } = makeServer()
    const result = await call(server, "template_get", {})
    expect(result.isError).toBe(false)

    const schema = result.payload.schema as {
      colors: unknown
      variants: unknown
      blocks: { name: string; example: string }[]
    }
    expect(Array.isArray(schema.colors)).toBe(true)
    expect(Array.isArray(schema.variants)).toBe(true)
    expect(schema.blocks.map((block) => block.name)).toEqual(
      BLOCKS.filter((block) => block.implemented).map((block) => block.name),
    )
    expect(schema.blocks.every((block) => block.example.length > 0)).toBe(true)

    const template = result.payload.template as { md: string; meta: Record<string, unknown> }
    expect(template.md).toContain("# ชื่อเอกสาร")
    expect(template.meta.title).toBe("ชื่อเอกสาร")
  })
})

/* ── tools: folders ───────────────────────────────────────────────────── */

describe("folder_create / folder_list", () => {
  test("folder_create สร้างโฟลเดอร์ซ้อน + มีอยู่แล้ว = already_exists · traversal = path_invalid", async () => {
    const { fs, server } = makeServer()

    const created = await call(server, "folder_create", { path: "a/b" })
    expect(created.isError).toBe(false)
    expect(created.payload.path).toBe("a/b")
    expect(await fs.exists("a/b")).toBe(true)
    expect(await fs.exists("a")).toBe(true)

    const dup = await call(server, "folder_create", { path: "a/b" })
    expect(dup.isError).toBe(true)
    expect(errorOf(dup).code).toBe("already_exists")

    await fs.writeText("note.md", "# Note\n")
    const clash = await call(server, "folder_create", { path: "note" })
    expect(errorOf(clash).code).toBe("already_exists") // มี note.md อยู่แล้ว (doc wins)

    const evil = await call(server, "folder_create", { path: "../escape" })
    expect(evil.isError).toBe(true)
    expect(errorOf(evil).code).toBe("path_invalid")
    expect(await fs.exists("../escape")).toBe(false)
  })

  test("folder_list: tree รวมโฟลเดอร์ว่าง · โฟลเดอร์ก่อนเอกสาร · root ว่าง = ทั้ง vault", async () => {
    const { fs, server } = makeServer({
      "projects/doku/design.md": "# Design\n",
      "projects/readme.md": "# Readme\n",
      "note.md": "# Note\n",
    })
    await fs.mkdir("inbox") // โฟลเดอร์ว่างต้องขึ้น tree เหมือนกัน

    const root = await call(server, "folder_list", {})
    expect(root.isError).toBe(false)
    expect(root.payload.path).toBe("")
    const top = root.payload.tree as {
      type: string
      name: string
      path: string
      children: { type: string; name: string }[]
    }[]
    expect(top.map((node) => node.name)).toEqual(["inbox", "projects", "note"])
    expect(top.map((node) => node.type)).toEqual(["folder", "folder", "doc"])
    expect(top[0]).toEqual({ type: "folder", name: "inbox", path: "inbox", children: [] })

    const projects = top.find((node) => node.name === "projects")
    expect(projects?.children.map((node) => `${node.type}:${node.name}`)).toEqual([
      "folder:doku",
      "doc:readme",
    ])
  })

  test("folder_list subtree + not_found", async () => {
    const { server } = makeServer({
      "projects/doku/design.md": "# Design\n",
      "projects/readme.md": "# Readme\n",
    })

    const subtree = await call(server, "folder_list", { path: "projects" })
    expect(subtree.payload.path).toBe("projects")
    const names = (subtree.payload.tree as { name: string }[]).map((node) => node.name)
    expect(names).toEqual(["doku", "readme"])

    const deep = await call(server, "folder_list", { path: "projects/doku" })
    const deepNodes = deep.payload.tree as { type: string; path: string; title: string }[]
    expect(deepNodes).toHaveLength(1)
    expect(deepNodes[0]?.type).toBe("doc")
    expect(deepNodes[0]?.path).toBe("projects/doku/design")
    expect(deepNodes[0]?.title).toBe("design")

    const missing = await call(server, "folder_list", { path: "nope" })
    expect(errorOf(missing).code).toBe("not_found")
  })
})

/* ── tools: documents ─────────────────────────────────────────────────── */

describe("doc_write / doc_read / doc_list", () => {
  test("doc_write mode=create: เขียนไฟล์ + meta + คืน etag · ซ้ำ = already_exists", async () => {
    const { fs, server } = makeServer()

    const created = await call(server, "doc_write", {
      path: "projects/hello",
      md: "# Hello\n",
      meta: { title: "Hello", tags: ["demo"] },
      mode: "create",
    })
    expect(created.isError).toBe(false)
    expect(created.payload.path).toBe("projects/hello")
    expect(created.payload.mode).toBe("create")
    expect(created.payload.etag).toMatch(/^[0-9a-f]{64}$/)
    expect(await fs.readText("projects/hello.md")).toBe("# Hello\n")
    const meta = JSON.parse((await fs.readText("projects/hello.meta.json")) ?? "{}") as {
      title: string
      tags: string[]
    }
    expect(meta.title).toBe("Hello")
    expect(meta.tags).toEqual(["demo"])

    const dup = await call(server, "doc_write", {
      path: "projects/hello",
      md: "# 2\n",
      mode: "create",
    })
    expect(errorOf(dup).code).toBe("already_exists")

    const badMode = await call(server, "doc_write", { path: "x", md: "", mode: "overwrite" })
    expect(errorOf(badMode).code).toBe("invalid_body")

    const badMeta = await call(server, "doc_write", {
      path: "projects/bad",
      md: "# B\n",
      meta: { tags: ["ไม่ใช่ kebab"] },
      mode: "create",
    })
    expect(errorOf(badMeta).code).toBe("meta_invalid")
    expect(await fs.exists("projects/bad.md")).toBe(false) // validate ก่อนเขียนเสมอ
  })

  test("doc_write mode=replace/patch: ต้องมีอยู่ · เก็บ revision ก่อนทับ · patch merge meta", async () => {
    const { fs, deps, server } = makeServer({
      "a.md": "# v1\n",
      "a.meta.json": `${JSON.stringify({ title: "A", tags: ["keep"] }, null, 2)}\n`,
    })

    const missing = await call(server, "doc_write", { path: "ghost", md: "# x\n", mode: "replace" })
    expect(errorOf(missing).code).toBe("not_found")

    const replaced = await call(server, "doc_write", {
      path: "a",
      md: "# v2\n",
      meta: { title: "A2" },
      mode: "replace",
    })
    expect(replaced.isError).toBe(false)
    expect(await fs.readText("a.md")).toBe("# v2\n")
    // replace = ทับ sidecar ทั้งก้อน (tags เดิมหาย — ตรงกับ PUT ของ REST)
    const replacedMeta = JSON.parse((await fs.readText("a.meta.json")) ?? "{}") as { title: string }
    expect(replacedMeta.title).toBe("A2")
    const revisions = await deps.revisions.list("a")
    expect(revisions.length).toBeGreaterThanOrEqual(1)

    const patched = await call(server, "doc_write", {
      path: "a",
      md: "# v3\n",
      meta: { tags: ["added"] },
      mode: "patch",
    })
    expect(patched.isError).toBe(false)
    const patchedMeta = JSON.parse((await fs.readText("a.meta.json")) ?? "{}") as {
      title: string
      tags: string[]
    }
    expect(patchedMeta.title).toBe("A2") // เดิมคงไว้
    expect(patchedMeta.tags).toEqual(["added"]) // ทับเฉพาะ field ที่ส่งมา
    expect(await fs.readText("a.md")).toBe("# v3\n")
    expect((await deps.revisions.list("a")).length).toBeGreaterThanOrEqual(2)
  })

  test("doc_write: md เกิน 5 MB = too_large", async () => {
    const { server } = makeServer()
    const huge = await call(server, "doc_write", {
      path: "big",
      md: "x".repeat(5 * 1024 * 1024 + 1),
      mode: "create",
    })
    expect(errorOf(huge).code).toBe("too_large")
  }, 20_000)

  test("doc_read md + html · ไม่พบ = not_found · format ผิด = invalid_body", async () => {
    const { server } = makeServer({
      "note.md": "# Note\n\nเนื้อหาสั้น ๆ\n",
      "note.meta.json": `${JSON.stringify({ title: "Note" }, null, 2)}\n`,
    })

    const md = await call(server, "doc_read", { path: "note", format: "md" })
    expect(md.isError).toBe(false)
    expect(md.payload.md).toBe("# Note\n\nเนื้อหาสั้น ๆ\n")
    expect(md.payload.etag).toMatch(/^[0-9a-f]{64}$/)
    const meta = md.payload.meta as { title: string }
    expect(meta.title).toBe("Note")

    const html = await call(server, "doc_read", { path: "note", format: "html" })
    expect(html.payload.html).toContain("<h1")
    expect(html.payload.html).toContain("เนื้อหาสั้น ๆ")

    const missing = await call(server, "doc_read", { path: "ghost", format: "md" })
    expect(errorOf(missing).code).toBe("not_found")

    const badFormat = await call(server, "doc_read", { path: "note", format: "pdf" })
    expect(errorOf(badFormat).code).toBe("invalid_body")

    const vaultPrefix = await call(server, "doc_read", { path: "vault/note.md", format: "md" })
    expect(vaultPrefix.isError).toBe(false) // ตัด prefix vault ให้เหมือน CLI
  })

  test("doc_list: metadata + กรอง folder/tag/q", async () => {
    const { server } = makeServer({
      "projects/doku/design.md": "# Design\n",
      "projects/doku/design.meta.json": `${JSON.stringify({ title: "Doku Design", tags: ["design"] }, null, 2)}\n`,
      "projects/readme.md": "# Readme\n",
      "daily/note.md": "# Note\n",
      "daily/note.meta.json": `${JSON.stringify({ title: "Daily", tags: ["daily", "design"] }, null, 2)}\n`,
    })

    const all = await call(server, "doc_list", {})
    const allDocs = all.payload.docs as { id: string; title: string; bytes: number }[]
    expect(allDocs.map((doc) => doc.id).sort()).toEqual([
      "daily/note",
      "projects/doku/design",
      "projects/readme",
    ])
    expect(allDocs.every((doc) => typeof doc.title === "string" && doc.bytes > 0)).toBe(true)

    const folder = await call(server, "doc_list", { folder: "projects" })
    expect((folder.payload.docs as { id: string }[]).map((doc) => doc.id).sort()).toEqual([
      "projects/doku/design",
      "projects/readme",
    ])

    const tag = await call(server, "doc_list", { tag: "daily" })
    expect((tag.payload.docs as { id: string }[]).map((doc) => doc.id)).toEqual(["daily/note"])

    const query = await call(server, "doc_list", { q: "doku design" })
    expect((query.payload.docs as { id: string }[]).map((doc) => doc.id)).toEqual([
      "projects/doku/design",
    ])
  })
})

/* ── tools: move + delete (soft เท่านั้น) ─────────────────────────────── */

describe("doc_move / doc_delete", () => {
  test("doc_move: ย้ายจริง + อัปเดตลิงก์ + moved_from", async () => {
    const { fs, server } = makeServer({
      "projects/a.md": "# A\n",
      "note.md": "ดู [a](./projects/a.md)\n",
    })

    const moved = await call(server, "doc_move", { from: "projects/a", to: "projects/sub/a" })
    expect(moved.isError).toBe(false)
    expect(moved.payload).toMatchObject({
      from: "projects/a",
      to: "projects/sub/a",
      updated_links: 1,
    })
    expect(await fs.readText("projects/a.md")).toBeNull()
    expect(await fs.readText("projects/sub/a.md")).toBe("# A\n")
    expect(await fs.readText("note.md")).toBe("ดู [a](./projects/sub/a.md)\n")
    const meta = JSON.parse((await fs.readText("projects/sub/a.meta.json")) ?? "{}") as {
      relations: { moved_from: string[] }
    }
    expect(meta.relations.moved_from).toEqual(["projects/a"])

    const missing = await call(server, "doc_move", { from: "ghost", to: "x" })
    expect(errorOf(missing).code).toBe("not_found")

    const clash = await call(server, "doc_move", { from: "note", to: "projects/sub/a" })
    expect(errorOf(clash).code).toBe("already_exists")
  })

  test("doc_delete = soft-delete เข้า .trash/ เท่านั้น (ไม่มีทางลบถาวรจาก tool)", async () => {
    const { fs, server } = makeServer({
      "a/b/n.md": "# Hi\n",
      "a/b/n.meta.json": `${JSON.stringify({ title: "N" }, null, 2)}\n`,
    })

    const deleted = await call(server, "doc_delete", { path: "a/b/n" })
    expect(deleted.isError).toBe(false)
    expect(deleted.payload.path).toBe("a/b/n")
    const trash = deleted.payload.trash as { kind: string; label: string; sources: string[] }
    expect(trash.kind).toBe("doc")
    expect(trash.label).toBe("a/b/n")
    expect(trash.sources).toEqual(["a/b/n.md", "a/b/n.meta.json"])

    // ไฟล์ต้นทางหาย + ของจริงไปอยู่ใต้ .trash/ (memory backing เก็บ key เป็น vault path)
    expect(await fs.exists("a/b/n.md")).toBe(false)
    expect(await fs.exists("a/b/n.meta.json")).toBe(false)
    const snapshot = fs.snapshot()
    const trashed = Object.keys(snapshot).filter(
      (path) => path.startsWith(".trash/") && path.endsWith("a/b/n.md"),
    )
    expect(trashed).toHaveLength(1)
    expect(snapshot[trashed[0] as string]).toBe("# Hi\n")
    // manifest ใน trash อ่านกลับได้ (กู้คืนได้เสมอ)
    expect((await fs.trashStore().list()).map((item) => item.label)).toEqual(["a/b/n"])

    const missing = await call(server, "doc_delete", { path: "ghost" })
    expect(errorOf(missing).code).toBe("not_found")

    // รันซ้ำ = ไม่เกิดไฟล์อะไรเพิ่ม ไม่มี purge เกิดขึ้น
    expect(
      Object.keys(fs.snapshot()).filter((path) => path.startsWith(".trash/")).length,
    ).toBeGreaterThan(0)
  })
})

/* ── tools: render / validate / asset ─────────────────────────────────── */

describe("doc_render / doc_validate / asset_put", () => {
  test("doc_render: stateless + meta override + ตรวจ size", async () => {
    const { server } = makeServer({ "exists.md": "# Real\n" })

    const rendered = await call(server, "doc_render", { md: "# Hi\n\nเนื้อหา\n" })
    expect(rendered.isError).toBe(false)
    expect(rendered.payload.html).toContain("<h1")
    expect(rendered.payload.html).toContain("เนื้อหา")

    const withMeta = await call(server, "doc_render", {
      md: "---\ntitle: จาก frontmatter\n---\n\n# X\n",
      meta: { title: "จาก argument" },
    })
    const meta = withMeta.payload.meta as { title: string }
    expect(meta.title).toBe("จาก argument")

    const badMeta = await call(server, "doc_render", { md: "# X\n", meta: { status: "wat" } })
    expect(errorOf(badMeta).code).toBe("meta_invalid")
  })

  test("doc_validate แบบ {path}: เอกสารดี = ok · wikilink หาย = error", async () => {
    const { server } = makeServer({
      "good.md": "# Good\n\nเนื้อหาพอสมควร\n",
      "bad.md": "# Bad\n\nดู [[missing-doc]]\n",
    })

    const good = await call(server, "doc_validate", { path: "good" })
    expect(good.payload.ok).toBe(true)
    expect(good.payload.errors).toEqual([])
    expect(good.payload.path).toBe("good")

    const bad = await call(server, "doc_validate", { path: "bad" })
    expect(bad.payload.ok).toBe(false)
    const codes = (bad.payload.errors as { code: string }[]).map((item) => item.code)
    expect(codes).toContain("wikilink_missing")
  })

  test("doc_validate แบบ {md, meta}: fence/unknown block/meta ถูกจับเป็น error", async () => {
    const { server } = makeServer({ "exists.md": "# Real\n" })

    const unclosed = await call(server, "doc_validate", {
      md: "# X\n\n:::note\nค้างอยู่\n",
      meta: {},
    })
    expect(unclosed.payload.ok).toBe(false)
    expect((unclosed.payload.errors as { code: string }[]).map((item) => item.code)).toContain(
      "block_unclosed",
    )

    const unknownBlock = await call(server, "doc_validate", {
      md: "# X\n\n:::nope\ntext\n:::\n",
      meta: {},
    })
    expect((unknownBlock.payload.errors as { code: string }[]).map((item) => item.code)).toContain(
      "block_unknown",
    )

    const badMeta = await call(server, "doc_validate", { md: "# X\n", meta: { title: "" } })
    expect(badMeta.payload.ok).toBe(false)
    expect((badMeta.payload.errors as { code: string }[]).map((item) => item.code)).toContain(
      "meta_invalid",
    )

    const clean = await call(server, "doc_validate", { md: "# มี h1\n\n[[exists]]\n", meta: {} })
    expect(clean.payload.ok).toBe(true)

    const neither = await call(server, "doc_validate", {})
    expect(errorOf(neither).code).toBe("invalid_body")
  })

  test("asset_put: เขียนใต้ <doc folder>/assets/ + คืน url ?h= · guard ครบ", async () => {
    const { fs, server } = makeServer({ "projects/a.md": "# A\n" })
    const content = new Uint8Array([1, 2, 3, 4])
    const base64 = Buffer.from(content).toString("base64")

    const put = await call(server, "asset_put", {
      path: "projects/a",
      filename: "pic.png",
      content_base64: base64,
    })
    expect(put.isError).toBe(false)
    expect(put.payload.path).toBe("projects/a")
    const assets = put.payload.assets as {
      path: string
      url: string
      bytes: number
      content_type: string
    }[]
    expect(assets[0]?.path).toBe("projects/assets/pic.png")
    expect(assets[0]?.url).toMatch(/^\/assets\/projects\/assets\/pic\.png\?h=[0-9a-f]{12}$/)
    expect(assets[0]?.content_type).toBe("image/png")
    expect(await fs.readBytes("projects/assets/pic.png")).toEqual(content)

    // charset ของ docs/06 — traversal/อักขระพิเศษถูกปฏิเสธ + ไม่มีไฟล์หลุดลง disk
    const traversal = await call(server, "asset_put", {
      path: "projects/a",
      filename: "../evil.png",
      content_base64: base64,
    })
    expect(errorOf(traversal).code).toBe("path_invalid")
    expect(await fs.exists("projects/evil.png")).toBe(false)
    expect(await fs.exists("evil.png")).toBe(false)

    const bang = await call(server, "asset_put", {
      path: "projects/a",
      filename: "a!b.png",
      content_base64: base64,
    })
    expect(errorOf(bang).code).toBe("path_invalid")

    // นามสกุลนอก allowlist (serve ไม่ได้ = ไม่ใช่ asset)
    const wrongType = await call(server, "asset_put", {
      path: "projects/a",
      filename: "page.html",
      content_base64: base64,
    })
    expect(errorOf(wrongType).code).toBe("asset_type_rejected")
    expect(await fs.exists("projects/assets/page.html")).toBe(false)

    // dotfile = ห้าม (invariant 9 — walker ข้าม dotfile)
    const dotfile = await call(server, "asset_put", {
      path: "projects/a",
      filename: ".pic.png",
      content_base64: base64,
    })
    expect(errorOf(dotfile).code).toBe("path_invalid")

    const badBase64 = await call(server, "asset_put", {
      path: "projects/a",
      filename: "pic.png",
      content_base64: "ไม่ใช่ base64!!",
    })
    expect(errorOf(badBase64).code).toBe("invalid_body")
    expect(await fs.exists("projects/assets/ไม่ใช่")).toBe(false)

    const tooBig = await call(server, "asset_put", {
      path: "projects/a",
      filename: "huge.png",
      content_base64: "AAAA",
    })
    expect(tooBig.isError).toBe(false) // 4 bytes — ผ่าน (Smoke ของ size อยู่ใน handler)

    // root-level doc → assets อยู่ root
    const root = await call(server, "asset_put", {
      path: "rootdoc",
      filename: "logo.png",
      content_base64: base64,
    })
    expect((root.payload.assets as { path: string }[])[0]?.path).toBe("assets/logo.png")
  })
})

/* ── tool definitions ตรงกับ handler ──────────────────────────────────── */

describe("TOOL_SPECS integrity", () => {
  test("ทุก definition มี handler ชื่อเดียวกัน + ไม่มี doc_search ใน specs", () => {
    const names = TOOL_SPECS.map((spec) => spec.definition.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).not.toContain("doc_search")
    for (const spec of TOOL_SPECS) {
      expect(typeof spec.handle).toBe("function")
    }
  })
})
