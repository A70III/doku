import { describe, expect, test } from "bun:test"
import { memoryVaultFs } from "../src/fs.ts"
import { loadMeta } from "../src/meta.ts"
import { defaultMeta, FolderMetaSchema, MetaSchema } from "../src/schema.ts"

describe("MetaSchema", () => {
  test("ไม่มี meta → default จากชื่อไฟล์", () => {
    const meta = defaultMeta("projects/doku/design")
    expect(meta.title).toBe("design")
    expect(meta.tags).toEqual([])
    expect(meta.status).toBe("active")
    expect(meta.theme.mode).toBe("auto")
    expect(meta.render).toEqual({ toc: true, math: true, motion: true, diagram: true })
    expect(meta.relations).toEqual({ related: [], moved_from: [] })
    expect(meta.pinned).toBe(false)
  })

  test("full meta ผ่าน schema", () => {
    const parsed = MetaSchema.parse({
      title: "Doku Design",
      summary: "ออกแบบระบบ",
      tags: ["design", "doku"],
      status: "draft",
      created: "2025-09-12T00:00:00Z",
      authors: [{ name: "เย่เว่ย", type: "human" }],
      theme: { accent: "#7c3aed", mode: "dark" },
      render: { toc: true, math: false, motion: true, diagram: false },
      relations: { related: ["projects/doku/research"], moved_from: [] },
      agent: { last_editor: "hermes", generated: false },
      pinned: true,
      order: 10,
    })
    expect(parsed.theme.accent).toBe("#7c3aed")
    expect(parsed.render.math).toBe(false)
    expect(parsed.authors[0]?.type).toBe("human")
  })

  test("ปฏิเสธค่าที่ผิด", () => {
    expect(MetaSchema.safeParse({ tags: ["Not-Kebab"] }).success).toBe(false)
    expect(
      MetaSchema.safeParse({ tags: ["a", "b", "c", "d", "e", "f", "g", "h", "i"] }).success,
    ).toBe(false)
    expect(MetaSchema.safeParse({ theme: { accent: "purple" } }).success).toBe(false)
    expect(MetaSchema.safeParse({ status: "published" }).success).toBe(false)
    expect(MetaSchema.safeParse({ created: "12/09/2025" }).success).toBe(false)
    expect(MetaSchema.safeParse({ summary: "x".repeat(281) }).success).toBe(false)
  })

  test("ไม่มี field id / category / visibility / published (path = id)", () => {
    const parsed = MetaSchema.parse({
      id: "x",
      category: "research",
      visibility: "public",
      published: true,
    } as Record<string, unknown>)
    expect(Object.keys(parsed)).not.toContain("id")
    expect(Object.keys(parsed)).not.toContain("category")
    expect(Object.keys(parsed)).not.toContain("visibility")
    expect(Object.keys(parsed)).not.toContain("published")
  })
})

describe("FolderMetaSchema", () => {
  test("validate _folder.meta.json", () => {
    const parsed = FolderMetaSchema.parse({
      title: "Projects",
      icon: "folder",
      color: "#3b82f6",
      order: 1,
      collapsed: false,
    })
    expect(parsed.order).toBe(1)
    expect(FolderMetaSchema.safeParse({ color: "blue" }).success).toBe(false)
  })
})

describe("loadMeta", () => {
  test("meta.json ชนะ frontmatter", async () => {
    const fs = memoryVaultFs({
      "design.meta.json": JSON.stringify({ title: "จาก meta.json", tags: ["a"] }),
    })
    const result = await loadMeta(fs, "design", { title: "จาก frontmatter", tags: ["b"] })
    expect(result.meta.title).toBe("จาก meta.json")
    expect(result.meta.tags).toEqual(["a"])
    expect(result.source).toBe("sidecar")
  })

  test("ใช้ frontmatter เมื่อไม่มี sidecar", async () => {
    const fs = memoryVaultFs({})
    const result = await loadMeta(fs, "design", { title: "จาก frontmatter" })
    expect(result.meta.title).toBe("จาก frontmatter")
    expect(result.source).toBe("frontmatter")
  })

  test("meta พัง → warning + render ต่อด้วย default", async () => {
    const fs = memoryVaultFs({ "design.meta.json": "{ ไม่ใช่ json" })
    const result = await loadMeta(fs, "design", null)
    expect(result.source).toBe("default")
    expect(result.meta.title).toBe("design")
    expect(result.warnings.some((item) => item.code === "meta_invalid")).toBe(true)
  })

  test("field ผิด → ตัดเฉพาะ field นั้น (salvage)", async () => {
    const fs = memoryVaultFs({
      "design.meta.json": JSON.stringify({
        title: "ยังได้",
        theme: { accent: "purple" },
        pinned: true,
      }),
    })
    const result = await loadMeta(fs, "design", null)
    expect(result.meta.title).toBe("ยังได้")
    expect(result.meta.pinned).toBe(true)
    expect(result.meta.theme).toEqual({ mode: "auto" })
    expect(result.warnings.some((item) => item.code === "meta_invalid")).toBe(true)
  })

  test("field ที่ไม่รู้จัก = เตือนแต่ไม่ล้ม", async () => {
    const fs = memoryVaultFs({ "design.meta.json": JSON.stringify({ title: "x", colour: "red" }) })
    const result = await loadMeta(fs, "design", null)
    expect(result.meta.title).toBe("x")
    expect(result.warnings.some((item) => item.code === "meta_unknown_field")).toBe(true)
  })
})
