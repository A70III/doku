import { describe, expect, test } from "bun:test"
import {
  assetUrl,
  docUrl,
  isSafeVaultPath,
  normalizeLinkTarget,
  normalizeVaultPath,
  PathError,
  resolveRelativePath,
} from "../src/paths.ts"

describe("normalizeVaultPath", () => {
  test("รับ path หลายรูปแบบให้ได้ id เดียวกัน", () => {
    const expected = "projects/doku/design"
    for (const input of [
      "projects/doku/design",
      "/projects/doku/design",
      "./projects/doku/design",
      "projects/doku/design.md",
      "projects/doku/design.meta.json",
      "/d/projects/doku/design",
      "projects//doku///design",
    ]) {
      expect(normalizeVaultPath(input)).toBe(expected)
    }
  })

  test("ตัดชื่อโฟลเดอร์ vault เมื่อระบุ vaultName", () => {
    expect(normalizeVaultPath("vault/design.md", { vaultName: "vault" })).toBe("design")
  })

  test("รับ path ที่มีภาษาไทย", () => {
    expect(normalizeVaultPath("โน้ต/ไอเดีย.md")).toBe("โน้ต/ไอเดีย")
  })

  test("ทางที่ดูเหมือน absolute ถูกมองเป็น path ใน vault (escape ไม่ได้)", () => {
    expect(normalizeVaultPath("/etc/passwd")).toBe("etc/passwd")
  })

  test("ปฏิเสธ path อันตราย", () => {
    for (const input of [
      "../../etc/passwd",
      "projects/../../etc/passwd",
      ".trash/2025/design",
      ".git/config",
      "projects/.hidden/design",
      'projects/x<>:"|?*y',
      `projects/${String.fromCharCode(7)}bell`,
      "",
    ]) {
      expect(() => normalizeVaultPath(input)).toThrow(PathError)
    }
  })
})

describe("isSafeVaultPath", () => {
  test("ยอมรับ path ปกติ / ปฏิเสธ dotfile และ segment แปลก", () => {
    expect(isSafeVaultPath("a/b-c/d_e.md")).toBe(true)
    expect(isSafeVaultPath("a/../b")).toBe(false)
    expect(isSafeVaultPath("a/./b")).toBe(false)
    expect(isSafeVaultPath("a//b")).toBe(false)
    expect(isSafeVaultPath("/a")).toBe(false)
    expect(isSafeVaultPath("a/.gitkeep")).toBe(false)
  })
})

describe("resolveRelativePath", () => {
  test("resolve relative จากโฟลเดอร์ของเอกสาร", () => {
    expect(resolveRelativePath("projects/doku", "assets/diagram.svg")).toBe(
      "projects/doku/assets/diagram.svg",
    )
    expect(resolveRelativePath("projects/doku", "./research.md")).toBe("projects/doku/research.md")
    expect(resolveRelativePath("projects/doku", "../shared/logo.png")).toBe(
      "projects/shared/logo.png",
    )
  })

  test("ตัด hash/query และ decode URL", () => {
    expect(resolveRelativePath("", "assets/a.png?h=1#frag")).toBe("assets/a.png")
    expect(resolveRelativePath("", "assets/my%20file.png")).toBe("assets/my file.png")
  })

  test("คืน null เมื่อหลุด vault", () => {
    expect(resolveRelativePath("", "../../etc/passwd")).toBeNull()
    expect(resolveRelativePath("projects", "../../../etc/passwd")).toBeNull()
    expect(resolveRelativePath("", "/etc/passwd")).toBe("etc/passwd")
  })
})

describe("URL helpers", () => {
  test("encode path เป็น URL (path = id)", () => {
    expect(docUrl("projects/doku/design")).toBe("/d/projects/doku/design")
    expect(docUrl("โน้ต/ไอเดีย")).toBe(
      `/d/${encodeURIComponent("โน้ต")}/${encodeURIComponent("ไอเดีย")}`,
    )
    expect(assetUrl("projects/doku/assets/diagram.svg", "abc123")).toBe(
      "/assets/projects/doku/assets/diagram.svg?h=abc123",
    )
  })
})

describe("normalizeLinkTarget (#56)", () => {
  test("ตัด anchor แบบข้อความอิสระได้ แต่ normalizeVaultPath ไม่ตัด", () => {
    expect(normalizeLinkTarget("design#callout")).toBe("design")
    expect(normalizeLinkTarget("vault/projects/design.md#x", { vaultName: "vault" })).toBe(
      "projects/design",
    )
  })

  test("`#` ในชื่อไฟล์ถูกปฏิเสธ (กันเสิร์ฟผิดไฟล์เงียบ ๆ)", () => {
    expect(() => normalizeVaultPath("a#b")).toThrow(PathError)
    expect(() => normalizeVaultPath("notes/a#b.md")).toThrow(PathError)
  })
})
