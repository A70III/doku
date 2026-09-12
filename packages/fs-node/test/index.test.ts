import { afterAll, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createNodeVaultFs } from "../src/index.ts"

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
