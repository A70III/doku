/**
 * S1 (M4) — characterization test คู่ก่อน refactor: พฤติกรรม move จริงที่อยู่ใน
 * `packages/server/src/api.ts` ถูกจับไว้ที่นี่ก่อนสกัด logic ลง core (test-first)
 *
 * สัญญาที่ล็อก (docs/05 §3 "Move + links"):
 * - อัปเดตลิงก์ทุกรูปแบบ: `[[path/x]]` · `/d/<path>` · relative `[x](./a.md)`
 * - wikilink แบบ basename ที่กำกวม = ไม่แตะ
 * - เขียน `relations.moved_from` ใน meta ของเอกสารที่ย้าย
 * - ปลายทางซ้ำ = already_exists · ต้นทางไม่มี = not_found
 *
 * รันด้วย core + memoryVaultFs เท่านั้น — ห้าม import server (DoD ของ slice)
 */

import { describe, expect, test } from "bun:test"
import { memoryVaultFs } from "../src/fs.ts"
import { MoveError, moveDoc, moveFolder } from "../src/move.ts"

async function expectMoveError(fn: () => Promise<unknown>): Promise<MoveError> {
  try {
    await fn()
  } catch (error) {
    if (error instanceof MoveError) return error
    throw error
  }
  throw new Error("expected MoveError แต่ move สำเร็จ")
}

describe("moveDoc — link forms + moved_from (characterization จาก api.ts)", () => {
  test("อัปเดต relative · path-wikilink · /d/ absolute · basename คงเดิม + moved_from ต่อท้าย meta", async () => {
    const vault = memoryVaultFs({
      "projects/b.md": "# B\n",
      "projects/b.meta.json": `${JSON.stringify({ title: "Beta", tags: ["keep"] }, null, 2)}\n`,
      "note.md":
        "rel [b](./projects/b.md)\nwiki [[projects/b]]\nbase [[b]]\nabs [/d](/d/projects/b)\n",
      "projects/y/c.md": "deep [b](../b.md)\npath [[projects/b]]\n",
    })

    const result = await moveDoc(vault, "projects/b", "projects/sub/b")
    expect(result).toEqual({
      from: "projects/b",
      to: "projects/sub/b",
      updated_links: 2,
    })

    // ไฟล์ย้ายจริง + meta ย้ายตาม
    expect(await vault.readText("projects/b.md")).toBeNull()
    expect(await vault.readText("projects/sub/b.md")).toBe("# B\n")

    // ทุกรูปแบบลิงก์ชี้ไป path ใหม่ — basename `[[b]]` คงเดิม (ชื่อไม่เปลี่ยน)
    expect(await vault.readText("note.md")).toBe(
      "rel [b](./projects/sub/b.md)\nwiki [[projects/sub/b]]\nbase [[b]]\nabs [/d](/d/projects/sub/b)\n",
    )
    expect(await vault.readText("projects/y/c.md")).toBe(
      "deep [b](../sub/b.md)\npath [[projects/sub/b]]\n",
    )

    // relations.moved_from ต่อท้าย meta เดิม (คง field อื่นไว้)
    const meta = JSON.parse((await vault.readText("projects/sub/b.meta.json")) ?? "{}")
    expect(meta.title).toBe("Beta")
    expect(meta.tags).toEqual(["keep"])
    expect(meta.relations.moved_from).toEqual(["projects/b"])
  })

  test("ไม่มี meta → สร้าง sidecar + ย้ายซ้ำแล้ว moved_from ต่อเนื่อง", async () => {
    const vault = memoryVaultFs({ "b.md": "# B\n" })

    await moveDoc(vault, "b", "sub/b")
    expect(await vault.readText("sub/b.meta.json")).toBe(
      '{\n  "relations": {\n    "moved_from": [\n      "b"\n    ]\n  }\n}\n',
    )

    await moveDoc(vault, "sub/b", "sub/c")
    const meta = JSON.parse((await vault.readText("sub/c.meta.json")) ?? "{}")
    expect(meta.relations.moved_from).toEqual(["b", "sub/b"])
    expect(await vault.readText("sub/b.md")).toBeNull()
    expect(await vault.readText("sub/c.md")).toBe("# B\n")
  })

  test("ปลายทางซ้ำ = already_exists · ต้นทางไม่มี = not_found · ปลายทาง = ต้นทาง = invalid (ไม่เขียนอะไรเลย)", async () => {
    const vault = memoryVaultFs({ "a.md": "# A\n", "b.md": "# B\n" })
    const hooks: string[][] = []

    const clash = await expectMoveError(() =>
      moveDoc(vault, "a", "b", {
        beforeMove: (ids) => {
          hooks.push([...ids])
        },
      }),
    )
    expect(clash.code).toBe("already_exists")
    expect(clash.message).toBe("ปลายทางมีอยู่แล้ว: b")

    const missing = await expectMoveError(() =>
      moveDoc(vault, "zzz", "c", {
        beforeMove: (ids) => {
          hooks.push([...ids])
        },
      }),
    )
    expect(missing.code).toBe("not_found")
    expect(missing.message).toBe("ไม่พบเอกสาร: zzz")

    const same = await expectMoveError(() => moveDoc(vault, "a", "a"))
    expect(same.code).toBe("invalid_target")
    expect(same.message).toBe("ปลายทางเหมือนต้นทาง")

    // error ก่อนเขียนจริง = ไฟล์อยู่ครบ + hook (revision) ไม่ถูกเรียก
    expect(hooks).toEqual([])
    expect(await vault.readText("a.md")).toBe("# A\n")
    expect(await vault.exists("c.md")).toBe(false)
    expect(await vault.exists("c.meta.json")).toBe(false)
  })

  test("update_links: false → ย้ายไฟล์ + เขียน moved_from แต่ไม่แตะลิงก์ (updated_links = 0)", async () => {
    const vault = memoryVaultFs({ "b.md": "# B\n", "a.md": "[b](./b.md)\n" })

    const result = await moveDoc(vault, "b", "sub/b", { updateLinks: false })
    expect(result.updated_links).toBe(0)
    expect(await vault.readText("a.md")).toBe("[b](./b.md)\n")
    expect(await vault.readText("sub/b.md")).toBe("# B\n")
    const meta = JSON.parse((await vault.readText("sub/b.meta.json")) ?? "{}")
    expect(meta.relations.moved_from).toEqual(["b"])
  })

  test("wikilink basename ที่กำกวม = ไม่แตะ (ปล่อยให้ doku check เตือน)", async () => {
    const vault = memoryVaultFs({
      "a/design.md": "# a\n",
      "b/design.md": "# b\n",
      "c/design.md": "# c\n",
      "note.md": "ดู [[design]]\n",
      "other.md": "path [[c/design]]\n",
    })

    const result = await moveDoc(vault, "c/design", "c/blueprint")
    // note.md ไม่ถูกเขียน (basename ยังกำกวม) — other.md เขียน (path form)
    expect(result.updated_links).toBe(1)
    expect(await vault.readText("note.md")).toBe("ดู [[design]]\n")
    expect(await vault.readText("other.md")).toBe("path [[c/blueprint]]\n")
  })

  test("beforeMove hook ได้ path ต้นทาง + ถูกเรียกครั้งเดียวหลัง check ผ่าน", async () => {
    const vault = memoryVaultFs({ "b.md": "# B\n" })
    const hooks: string[][] = []

    await moveDoc(vault, "b", "sub/b", {
      beforeMove: (ids) => {
        hooks.push([...ids])
      },
    })
    expect(hooks).toEqual([["b"]])
  })
})

describe("moveFolder — parity กับ api.ts + link update", () => {
  test("ย้ายโฟลเดอร์: relative ในโฟลเดอร์คงเดิม · path-wikilink + ของนอกโฟลเดอร์อัปเดต + ทุก doc ได้ moved_from", async () => {
    const vault = memoryVaultFs({
      "projects/a.md": "ดู [b](./b.md) และ [[projects/b]]\n",
      "projects/b.md": "# B\n",
      "root.md": "[a](./projects/a.md)\n",
    })
    const hooks: string[][] = []

    const result = await moveFolder(vault, "projects", "archive/projects", {
      beforeMove: (ids) => {
        hooks.push([...ids])
      },
    })
    expect(result).toEqual({
      from: "projects",
      to: "archive/projects",
      updated_links: 2,
    })

    // ลิงก์ข้างในโฟลเดอร์อยู่ที่เดิม · path form ชี้ที่ใหม่ · ของนอก rebase
    expect(await vault.readText("archive/projects/a.md")).toBe(
      "ดู [b](./b.md) และ [[archive/projects/b]]\n",
    )
    expect(await vault.readText("archive/projects/b.md")).toBe("# B\n")
    expect(await vault.readText("root.md")).toBe("[a](./archive/projects/a.md)\n")
    expect(await vault.exists("projects")).toBe(false)

    // ทุกเอกสารในโฟลเดอร์ (ไม่มี meta ด้วย) ได้ relations.moved_from
    const metaA = JSON.parse((await vault.readText("archive/projects/a.meta.json")) ?? "{}")
    const metaB = JSON.parse((await vault.readText("archive/projects/b.meta.json")) ?? "{}")
    expect(metaA.relations.moved_from).toEqual(["projects/a"])
    expect(metaB.relations.moved_from).toEqual(["projects/b"])

    // hook ได้ doc ใต้โฟลเดอร์ทุกตัว (server เก็บ revision ตรงนี้)
    expect(hooks).toEqual([["projects/a", "projects/b"]])
  })

  test("โฟลเดอร์: ต้นทางไม่มี = not_found · ปลายทางซ้ำ = already_exists · ปลายทางใต้ตัวเอง = invalid", async () => {
    const vault = memoryVaultFs({ "a/x.md": "# x\n", "b.md": "# B\n" })
    const hooks: string[][] = []
    const options = {
      beforeMove: (ids: readonly string[]) => {
        hooks.push([...ids])
      },
    }

    const missing = await expectMoveError(() => moveFolder(vault, "projects", "y", options))
    expect(missing.code).toBe("not_found")
    expect(missing.message).toBe("ไม่พบโฟลเดอร์: projects")

    const clash = await expectMoveError(() => moveFolder(vault, "a", "b", options))
    expect(clash.code).toBe("already_exists")
    expect(clash.message).toBe("ปลายทางมีอยู่แล้ว: b")

    const same = await expectMoveError(() => moveFolder(vault, "a", "a", options))
    expect(same.code).toBe("invalid_target")
    expect(same.message).toBe("ปลายทางไม่ถูกต้อง")

    const nested = await expectMoveError(() => moveFolder(vault, "a", "a/deep", options))
    expect(nested.code).toBe("invalid_target")
    expect(nested.message).toBe("ปลายทางไม่ถูกต้อง")

    expect(hooks).toEqual([])
    expect(await vault.readText("a/x.md")).toBe("# x\n")
  })
})
