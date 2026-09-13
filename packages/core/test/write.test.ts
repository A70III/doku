/**
 * M3 write foundation — write adapter, trash, revision, etag, link rewrite
 */

import { describe, expect, test } from "bun:test"
import { docEtag, etagHeader, matchesIfMatch } from "../src/etag.ts"
import { memoryVaultFs } from "../src/fs.ts"
import { planMove, relativeVaultLink, rewriteMarkdownLinks } from "../src/links.ts"
import { memoryRevisionStore, REVISION_KEEP, revisionTs } from "../src/revision.ts"
import { MetaSchema } from "../src/schema.ts"
import { TRASH_DIR } from "../src/trash.ts"
import { buildDocIndex, walkVault } from "../src/vault-walk.ts"

describe("memoryVaultFs — write", () => {
  test("writeText สร้างโฟลเดอร์ให้เอง + อ่านกลับได้", async () => {
    const fs = memoryVaultFs()
    await fs.writeText("a/b/c.md", "# hi")
    expect(await fs.readText("a/b/c.md")).toBe("# hi")
    expect(await fs.exists("a/b")).toBe(true)
    expect(await fs.list("a/b")).toEqual([{ name: "c.md", type: "file" }])
  })

  test("mkdir เปล่า ๆ ปรากฏใน list", async () => {
    const fs = memoryVaultFs()
    await fs.mkdir("empty/folder")
    expect(await fs.list("empty")).toEqual([{ name: "folder", type: "dir" }])
  })

  test("move ไฟล์และโฟลเดอร์", async () => {
    const fs = memoryVaultFs({ "a/x.md": "1", "a/y.md": "2" })
    await fs.move("a", "b")
    expect(await fs.readText("b/x.md")).toBe("1")
    expect(await fs.exists("a")).toBe(false)
    await fs.move("b/x.md", "b/z.md")
    expect(await fs.readText("b/z.md")).toBe("1")
  })

  test("remove recursive", async () => {
    const fs = memoryVaultFs({ "a/x.md": "1", "a/sub/y.md": "2" })
    await fs.remove("a")
    expect(await fs.exists("a")).toBe(false)
    expect(await fs.list("")).toEqual([])
  })
})

describe("trash", () => {
  test("put → ไฟล์หายจาก vault → list → restore กลับ", async () => {
    const fs = memoryVaultFs({ "projects/x.md": "# x", "projects/x.meta.json": "{}" })
    const trash = fs.trashStore()

    const item = await trash.put(["projects/x.md", "projects/x.meta.json"], {
      label: "projects/x",
      kind: "doc",
      deletedAt: new Date("2025-09-12T10:00:00Z"),
    })
    expect(item.kind).toBe("doc")
    expect(item.sources).toEqual(["projects/x.md", "projects/x.meta.json"])
    expect(await fs.readText("projects/x.md")).toBeNull()

    const listed = await trash.list()
    expect(listed).toHaveLength(1)
    expect(listed[0]?.label).toBe("projects/x")

    await trash.restore(item.id)
    expect(await fs.readText("projects/x.md")).toBe("# x")
    expect(await trash.list()).toEqual([])
  })

  test("walkVault ข้าม .trash (ไม่ถูก index เป็นเอกสาร)", async () => {
    const fs = memoryVaultFs({ "x.md": "# x" })
    const trash = fs.trashStore()
    await trash.put(["x.md"], { label: "x", kind: "doc" })
    const listing = await walkVault(fs)
    expect(listing.docs).toEqual([])
    expect(listing.assets).toEqual([])
  })

  test("purge ลบเฉพาะรายการที่เก่ากว่า N วัน", async () => {
    const fs = memoryVaultFs({ "old.md": "o", "new.md": "n" })
    const trash = fs.trashStore()
    await trash.put(["old.md"], {
      label: "old",
      kind: "doc",
      deletedAt: new Date("2025-01-01T00:00:00Z"),
    })
    await trash.put(["new.md"], {
      label: "new",
      kind: "doc",
      deletedAt: new Date("2025-09-10T00:00:00Z"),
    })
    const removed = await trash.purge(30, new Date("2025-09-12T00:00:00Z"))
    expect(removed).toBe(1)
    const remaining = await trash.list()
    expect(remaining.map((entry) => entry.label)).toEqual(["new"])
  })

  test("empty ล้างทั้งหมด", async () => {
    const fs = memoryVaultFs({ "a.md": "a", "b.md": "b" })
    const trash = fs.trashStore()
    await trash.put(["a.md"], { label: "a", kind: "doc" })
    await trash.put(["b.md"], { label: "b", kind: "doc" })
    expect(await trash.empty()).toBe(2)
    expect(await trash.list()).toEqual([])
    expect(await fs.readText(`${TRASH_DIR}`)).toBeNull()
  })
})

describe("revision store", () => {
  test("save → list เรียงใหม่ก่อน → read → latest", async () => {
    const store = memoryRevisionStore()
    await store.save("a/b", { md: "v1", meta: null }, new Date("2025-09-12T10:00:00Z"))
    await store.save("a/b", { md: "v2", meta: "{}" }, new Date("2025-09-12T11:00:00Z"))

    const list = await store.list("a/b")
    expect(list).toHaveLength(2)
    expect(list[0]?.hasMeta).toBe(true)
    expect(list[0]?.at).toBe("2025-09-12T11:00:00.000Z")

    const latest = await store.latest("a/b")
    expect((await store.read("a/b", latest?.ts ?? ""))?.md).toBe("v2")
  })

  test("rotate เก็บไม่เกิน REVISION_KEEP ต่อเอกสาร", async () => {
    const store = memoryRevisionStore()
    for (let index = 0; index < REVISION_KEEP + 5; index += 1) {
      await store.save(
        "x",
        { md: `v${index}`, meta: null },
        new Date(1_700_000_000_000 + index * 1000),
      )
    }
    expect(await store.list("x")).toHaveLength(REVISION_KEEP)
  })

  test("ไม่มีอะไรให้เก็บ = ไม่เขียน", async () => {
    const store = memoryRevisionStore()
    expect(await store.save("x", { md: null, meta: null })).toBeNull()
    expect(await store.list("x")).toEqual([])
  })

  test("revisionTs เรียงตามเวลา", () => {
    const a = revisionTs(new Date("2025-09-12T10:00:00Z"))
    const b = revisionTs(new Date("2025-09-12T11:00:00Z"))
    expect(a < b).toBe(true)
  })
})

describe("etag", () => {
  test("etag ต่างเมื่อ md หรือ meta ต่าง", async () => {
    const meta = MetaSchema.parse({ title: "x" })
    const first = await docEtag("a", meta)
    expect(await docEtag("b", meta)).not.toBe(first)
    expect(await docEtag("a", MetaSchema.parse({ title: "y" }))).not.toBe(first)
    expect(await docEtag("a", meta)).toBe(first)
  })

  test("If-Match เทียบแบบ quoted/weak/list/*", () => {
    expect(matchesIfMatch(etagHeader("abc"), "abc")).toBe(true)
    expect(matchesIfMatch("abc", "abc")).toBe(true)
    expect(matchesIfMatch('W/"abc"', "abc")).toBe(true)
    expect(matchesIfMatch('"x", "abc"', "abc")).toBe(true)
    expect(matchesIfMatch("*", "abc")).toBe(true)
    expect(matchesIfMatch('"other"', "abc")).toBe(false)
    expect(matchesIfMatch(null, "abc")).toBe(false)
  })
})

describe("link rewrite on move", () => {
  const listing = { docs: ["projects/design", "projects/notes"], assets: ["assets/x.png"] }

  test("relativeVaultLink", () => {
    expect(relativeVaultLink("projects/doku", "projects/doku/a.md")).toBe("./a.md")
    expect(relativeVaultLink("projects/doku", "projects/other/a.md")).toBe("../other/a.md")
    expect(relativeVaultLink("", "a.md")).toBe("./a.md")
  })

  test("planMove ครอบ doc + meta + asset ใต้โฟลเดอร์", () => {
    const plan = planMove("projects", "archive", {
      docs: ["projects/design"],
      assets: ["projects/assets/x.png", "other/y.png"],
    })
    expect(plan.docs.get("projects/design")).toBe("archive/design")
    expect(plan.paths.get("projects/design.md")).toBe("archive/design.md")
    expect(plan.paths.get("projects/design.meta.json")).toBe("archive/design.meta.json")
    expect(plan.paths.get("projects/assets/x.png")).toBe("archive/assets/x.png")
    expect(plan.paths.has("other/y.png")).toBe(false)
  })

  test("rewrite wikilink path form + absolute + relative", () => {
    const plan = planMove("projects/design.md", "refs/design.md", listing)
    const index = buildDocIndex(listing.docs)
    const body = [
      "ดู [[projects/design]] และ [[projects/design|ดีไซน์]]",
      "abs: [x](/d/projects/design)",
      "rel: [y](./design.md)",
    ].join("\n")
    const out = rewriteMarkdownLinks(body, "projects/notes", plan, index)
    expect(out).toContain("[[refs/design]]")
    expect(out).toContain("[[refs/design|ดีไซน์]]")
    expect(out).toContain("(/d/refs/design)")
    expect(out).toContain("(../refs/design.md)")
  })

  test("wikilink basename ที่กำกวม = ไม่แตะ", () => {
    const index = buildDocIndex(["a/design", "b/design"])
    const plan = planMove("a/design", "a/design2", { docs: ["a/design", "b/design"], assets: [] })
    const out = rewriteMarkdownLinks("[[design]]", "other", plan, index)
    expect(out).toBe("[[design]]")
  })

  test("basename ที่ไม่กำกวมถูกอัปเดตเมื่อ rename", () => {
    const index = buildDocIndex(["a/design"])
    const plan = planMove("a/design.md", "a/design-v2.md", { docs: ["a/design"], assets: [] })
    const out = rewriteMarkdownLinks("[[design]]", "other", plan, index)
    expect(out).toBe("[[design-v2]]")
  })
})

describe("link rewrite: เอกสารที่ถูกย้าย → rebase ลิงก์ที่ไม่ได้ย้ายด้วย", () => {
  test("relative link ไปไฟล์/asset ที่ไม่อยู่ในแผน ถูก rebase จากตำแหน่งใหม่", () => {
    const listing = { docs: ["a/design", "research"], assets: ["a/assets/pic.png"] }
    const index = buildDocIndex(listing.docs)
    const plan = planMove("a/design.md", "deep/nested/design.md", listing)
    const body = "[r](../research.md)\n\n![x](assets/pic.png)\n"
    const out = rewriteMarkdownLinks(body, "a/design", plan, index, {
      newDocId: "deep/nested/design",
    })
    expect(out).toContain("(../../research.md)")
    expect(out).toContain("(../../a/assets/pic.png)")
  })

  test("ย้ายโฟลเดอร์: เอกสารข้างใน rebase ลิงก์ที่ชี้ข้างนอกโฟลเดอร์", () => {
    const listing = { docs: ["a/design", "research"], assets: [] }
    const index = buildDocIndex(listing.docs)
    const plan = planMove("a", "x/y/a", listing)
    const out = rewriteMarkdownLinks("[r](../research.md)\n", "a/design", plan, index, {
      newDocId: "x/y/a/design",
    })
    expect(out).toContain("(../../../research.md)")
  })

  test("เอกสารที่ไม่ถูกย้าย = ไม่แตะลิงก์ที่ไม่อยู่ในแผน", () => {
    const listing = { docs: ["a/design", "research"], assets: [] }
    const index = buildDocIndex(listing.docs)
    const plan = planMove("a", "x/a", listing)
    const out = rewriteMarkdownLinks("[r](../research.md)\n", "other", plan, index)
    expect(out).toBe("[r](../research.md)\n")
  })
})
