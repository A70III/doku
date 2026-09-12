import { afterAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createNodeRevisionStore, createNodeVaultFs } from "../src/index.ts"

const root = await mkdtemp(join(tmpdir(), "doku-fs-"))
const outside = await mkdtemp(join(tmpdir(), "doku-outside-"))

await mkdir(join(root, "projects/doku/assets"), { recursive: true })
await mkdir(join(root, ".trash/2025"), { recursive: true })
await writeFile(join(root, "projects/doku/design.md"), "# Design\n")
await writeFile(join(root, "projects/doku/design.meta.json"), "{}\n")
await writeFile(join(root, "projects/doku/assets/diagram.svg"), "<svg></svg>")
await writeFile(join(root, ".trash/2025/old.md"), "# old\n")
await writeFile(join(root, ".env"), "SECRET=1\n")
await writeFile(join(outside, "secret.txt"), "top secret\n")

const fs = await createNodeVaultFs(root)

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe("createNodeVaultFs", () => {
  test("readText / readBytes อ่านไฟล์ใน vault", async () => {
    expect(await fs.readText("projects/doku/design.md")).toBe("# Design\n")
    const bytes = await fs.readBytes("projects/doku/assets/diagram.svg")
    expect(bytes && new TextDecoder().decode(bytes)).toBe("<svg></svg>")
  })

  test("ไฟล์ที่ไม่มี → null (ไม่ throw)", async () => {
    expect(await fs.readText("nope.md")).toBeNull()
    expect(await fs.readBytes("nope.png")).toBeNull()
    expect(await fs.list("no-such-dir")).toEqual([])
  })

  test("list: โฟลเดอร์ก่อนไฟล์, เรียงชื่อ, ข้าม dotfile/dotfolder", async () => {
    const entries = await fs.list("")
    expect(entries.map((entry) => entry.name)).toEqual(["projects"])
    const inner = await fs.list("projects/doku")
    expect(inner.map((entry) => `${entry.type}:${entry.name}`)).toEqual([
      "dir:assets",
      "file:design.md",
      "file:design.meta.json",
    ])
  })

  test("path อันตรายถูกปฏิเสธ (traversal / dotfile / absolute)", async () => {
    for (const bad of ["../outside.txt", "../../etc/passwd", ".env", ".trash/2025/old.md"]) {
      await expect(fs.readText(bad)).rejects.toThrow()
    }
  })

  test("symlink ที่ชี้ ออกนอก vault ถูกปฏิเสธ", async () => {
    await symlink(outside, join(root, "escape"))
    await expect(fs.readText("escape/secret.txt")).rejects.toThrow(/symlink/)
    expect(await fs.readText("escape/secret.txt").catch(() => null)).toBeNull()
  })

  test("root คือ path จริงของ vault และรับเฉพาะ path ที่ normalize แล้ว", async () => {
    expect(fs.root).toContain("doku-fs-")
    // caller ต้องผ่าน normalizeVaultPath มาก่อน — leading "/" ไม่ผ่าน adapter
    await expect(fs.readText("/projects/doku/design.md")).rejects.toThrow()
  })
})

describe("write / trash / revision (M3)", () => {
  test("writeText เขียน atomic + สร้างโฟลเดอร์ให้เอง", async () => {
    await fs.writeText("notes/deep/a.md", "# a\n")
    expect(await fs.readText("notes/deep/a.md")).toBe("# a\n")
    expect(await fs.exists("notes/deep")).toBe(true)
    // atomic: ไม่เหลือไฟล์ temp
    const entries = await fs.list("notes/deep")
    expect(entries.map((entry) => entry.name)).toEqual(["a.md"])
  })

  test("move + mkdir + remove", async () => {
    await fs.move("notes/deep/a.md", "notes/b.md")
    expect(await fs.readText("notes/deep/a.md")).toBeNull()
    expect(await fs.readText("notes/b.md")).toBe("# a\n")
    await fs.mkdir("notes/empty")
    expect(await fs.exists("notes/empty")).toBe(true)
    await fs.remove("notes")
    expect(await fs.exists("notes")).toBe(false)
  })

  test("trash: put → list → restore → path เดิมกลับมา (regression: trash path safety)", async () => {
    await fs.writeText("tmp/doc.md", "# doc\n")
    await fs.writeText("tmp/doc.meta.json", "{}\n")
    const trash = fs.trashStore()
    const item = await trash.put(["tmp/doc.md", "tmp/doc.meta.json"], {
      label: "tmp/doc",
      kind: "doc",
    })
    expect(await fs.readText("tmp/doc.md")).toBeNull()
    expect((await trash.list()).map((entry) => entry.label)).toEqual(["tmp/doc"])

    await trash.restore(item.id)
    expect(await fs.readText("tmp/doc.md")).toBe("# doc\n")
    expect(await fs.readText("tmp/doc.meta.json")).toBe("{}\n")
    expect(await trash.list()).toEqual([])
  })

  test("trash: purge ลบเฉพาะที่เก่ากว่า N วัน + empty", async () => {
    const trash = fs.trashStore()
    await fs.writeText("old.md", "o")
    await fs.writeText("new.md", "n")
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
    expect(await trash.purge(30, new Date("2025-09-12T00:00:00Z"))).toBe(1)
    expect((await trash.list()).map((entry) => entry.label)).toEqual(["new"])
    // empty ล้างทุกโฟลเดอร์ใต้ .trash (รวม orphan ที่ไม่มี manifest เช่น `.trash/2025` ที่ fixture สร้างไว้)
    expect(await trash.empty()).toBeGreaterThanOrEqual(1)
    expect(await trash.list()).toEqual([])
  })

  test("revision: save/list/read/prune", async () => {
    const revisions = await createNodeRevisionStore(join(root, "../doku-var-test"))
    await revisions.save("notes/b", { md: "# v1\n", meta: null }, new Date("2025-09-12T10:00:00Z"))
    await revisions.save("notes/b", { md: "# v2\n", meta: "{}" }, new Date("2025-09-12T11:00:00Z"))
    const list = await revisions.list("notes/b")
    expect(list).toHaveLength(2)
    expect(list[0]?.at).toBe("2025-09-12T11:00:00.000Z")
    expect((await revisions.read("notes/b", "20250912T100000000Z"))?.md).toBe("# v1\n")
    await rm(join(root, "../doku-var-test"), { recursive: true, force: true })
  })
})
