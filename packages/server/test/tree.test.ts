import { describe, expect, test } from "bun:test"
import { memoryVaultFs } from "@doku/core"
import { buildTree, VaultState } from "../src/tree.ts"

describe("buildTree", () => {
  test("โฟลเดอร์ก่อนไฟล์ · sort ตาม order → ชื่อ", async () => {
    const fs = memoryVaultFs({
      "b.md": "# b",
      "a.md": "# a",
      "projects/aaa.md": "# a",
      "projects/zzz.md": "# z",
    })
    const tree = await buildTree(["b", "a", "projects/aaa", "projects/doku/design"], fs, new Map())

    expect(tree[0]?.type).toBe("folder") // โฟลเดอร์ก่อนไฟล์
    expect(tree[1]?.type).toBe("doc")
    expect(tree[2]?.type).toBe("doc")
  })

  test("folder meta: title + order", async () => {
    const fs = memoryVaultFs({
      "x/one.md": "# one",
      "x/two.md": "# two",
      "y/_folder.meta.json": JSON.stringify({ title: "ทดสอบ" }),
      "y/three.md": "# three",
      "x/_folder.meta.json": JSON.stringify({ order: 5 }),
    })
    const tree = await buildTree(["x/one", "x/two", "y/three"], fs, new Map())

    const x = tree.find((node) => node.type === "folder" && node.path === "x")
    const y = tree.find((node) => node.type === "folder" && node.path === "y")
    expect(x && x.type === "folder" && x.title).toBeUndefined()
    expect(y && y.type === "folder" && y.title).toBe("ทดสอบ")
    // order 5 (x) มาก่อน ไม่มี order (y)
    expect(tree[0]?.type).toBe("folder")
    expect((tree[0] as { path: string }).path).toBe("x")
  })
})

describe("VaultState", () => {
  test("get() คืน tree + docs + listingHash และ cache จนกว่า invalidate", async () => {
    const fs = memoryVaultFs({
      "welcome.md": "# ยินดีต้อนรับ",
      "welcome.meta.json": JSON.stringify({ title: "ยินดีต้อนรับ", tags: ["intro"], pinned: true }),
    })
    const state = new VaultState(fs, "vault")

    const first = await state.get()
    expect(first.docs).toHaveLength(1)
    expect(first.docs[0]?.title).toBe("ยินดีต้อนรับ")
    expect(first.docs[0]?.pinned).toBe(true)
    expect(first.tree[0]?.type).toBe("doc")
    expect(first.listingHash).toMatch(/^[0-9a-f]{64}$/)

    const second = await state.get()
    expect(second).toBe(first) // จำ snapshot ไว้

    state.invalidate()
    const third = await state.get()
    expect(third).not.toBe(first)
  })

  test("wikiIndex รวม basename ทุกเอกสาร", async () => {
    const fs = memoryVaultFs({ "projects/doku/design.md": "# d", "notes.md": "# n" })
    const state = new VaultState(fs, "vault")
    const index = await state.wikiIndex()
    expect(index.get("design")).toEqual(["projects/doku/design"])
    expect(index.get("notes")).toEqual(["notes"])
  })

  test("meta.json พัง = ไม่ล้ม (ใช้ title จากชื่อไฟล์)", async () => {
    const fs = memoryVaultFs({
      "broken.md": "# b",
      "broken.meta.json": "not json",
    })
    const state = new VaultState(fs, "vault")
    const { docs } = await state.get()
    expect(docs).toHaveLength(1)
    expect(docs[0]?.title).toBe("broken")
  })
})

describe("VaultState ทน fs error ต่อ asset (เช่น symlink หลุด vault)", () => {
  test("stat ที่ throw ต่อ asset → tree ยังสร้างได้ (ไม่ล้มทั้งหน้า)", async () => {
    const base = memoryVaultFs({ "a.md": "# A\n", "weird.bin": "x" })
    const fs = {
      ...base,
      stat: async (rel: string) => {
        if (rel === "weird.bin") throw new Error("symlink ออกนอก vault")
        return base.stat?.(rel) ?? null
      },
    }
    const state = new VaultState(fs, "vault")
    const snapshot = await state.get()
    expect(snapshot.docs.map((doc) => doc.id)).toEqual(["a"])
    expect(snapshot.tree).toHaveLength(1)
  })
})
