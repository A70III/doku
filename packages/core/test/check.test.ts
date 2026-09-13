import { describe, expect, test } from "bun:test"
import { checkVault } from "../src/check.ts"
import { memoryVaultFs } from "../src/fs.ts"
import { resolveDoc, resolveInline } from "../src/resolve.ts"

describe("checkVault", () => {
  test("vault สะอาด → ok + stats ถูก", async () => {
    const fs = memoryVaultFs({
      "design.md": "# Design\n\nเนื้อหา [research](./research.md)\n\n![d](assets/d.png)\n",
      "design.meta.json": JSON.stringify({ title: "Design", tags: ["design"] }),
      "research.md": "# Research\n\nกลับไป [[design]]\n",
      "assets/d.png": "x",
    })
    const report = await checkVault(fs)
    expect(report.errors).toEqual([])
    expect(report.stats.docs).toBe(2)
    expect(report.stats.assets).toBe(1)
    expect(report.ok).toBe(true)
  })

  test("broken link / wikilink หาย / asset หาย → error", async () => {
    const fs = memoryVaultFs({
      "design.md": "# D\n\n[a](./nope.md) · [[nope]] · ![i](assets/nope.png)\n",
    })
    const report = await checkVault(fs)
    const codes = report.errors.map((item) => item.code)
    expect(codes).toContain("link_broken")
    expect(codes).toContain("wikilink_missing")
    expect(codes).toContain("asset_missing")
    expect(report.ok).toBe(false)
  })

  test("block ที่ไม่รู้จัก = error · block ที่รู้จักแล้ว = ไม่เตือน", async () => {
    const fs = memoryVaultFs({
      "design.md": "# D\n\n:::note\nx\n:::\n\n:::typo-name\nx\n:::\n",
    })
    const report = await checkVault(fs)
    expect(report.errors.some((item) => item.code === "block_unknown")).toBe(true)
    expect(report.warnings.some((item) => item.code === "block_unimplemented")).toBe(false)
  })

  test("asset ที่อ้างผ่าน attribute ของ block ถูกนับว่าใช้งานแล้ว", async () => {
    const fs = memoryVaultFs({
      "design.md": '# D\n\n:::figure{src="assets/a.svg" caption=x}\n:::\n',
      "assets/a.svg": "<svg></svg>",
    })
    const report = await checkVault(fs)
    expect(report.ok).toBe(true)
    expect(report.warnings.some((item) => item.code === "orphan_asset")).toBe(false)
    expect(report.errors.some((item) => item.code === "asset_missing")).toBe(false)
  })

  test("block เปิดไม่ปิด → block_unclosed", async () => {
    const fs = memoryVaultFs({ "design.md": "# D\n\n:::warning{title=x}\nยังไม่ปิด\n" })
    const report = await checkVault(fs)
    expect(report.errors.some((item) => item.code === "block_unclosed")).toBe(true)
  })

  test("meta ผิด schema → error · field แปลก → warning", async () => {
    const fs = memoryVaultFs({
      "a.md": "# A\n",
      "a.meta.json": JSON.stringify({ tags: ["BAD TAG"] }),
      "b.md": "# B\n",
      "b.meta.json": JSON.stringify({ title: "B", weird: true }),
    })
    const report = await checkVault(fs)
    expect(report.errors.some((item) => item.code === "meta_invalid" && item.path === "a")).toBe(
      true,
    )
    expect(report.warnings.some((item) => item.code === "meta_unknown_field")).toBe(true)
  })

  test("ไม่มี title (ทั้ง meta และ h1) → warning", async () => {
    const fs = memoryVaultFs({ "design.md": "เนื้อหาไม่มีหัวเรื่อง\n" })
    const report = await checkVault(fs)
    expect(report.warnings.some((item) => item.code === "missing_title")).toBe(true)
    expect(report.ok).toBe(true)
  })

  test("orphan asset + _folder.meta.json ผิด → warning", async () => {
    const fs = memoryVaultFs({
      "projects/a.md": "# A\n",
      "projects/assets/unused.png": "x",
      "projects/_folder.meta.json": JSON.stringify({ color: "blue" }),
    })
    const report = await checkVault(fs)
    expect(report.warnings.some((item) => item.code === "orphan_asset")).toBe(true)
    expect(report.warnings.some((item) => item.code === "meta_invalid")).toBe(true)
    expect(report.ok).toBe(true)
  })

  test("ตรวจเฉพาะ path ที่ระบุ", async () => {
    const fs = memoryVaultFs({ "a.md": "# A\n", "b.md": "# B\n" })
    const report = await checkVault(fs, { path: "a" })
    expect(report.docs.map((doc) => doc.id)).toEqual(["a"])
  })

  test("เอกสารที่ไม่มีอยู่ → doc_not_found", async () => {
    const fs = memoryVaultFs({ "a.md": "# A\n" })
    const report = await checkVault(fs, { path: "missing" })
    expect(report.errors[0]?.code).toBe("doc_not_found")
    expect(report.ok).toBe(false)
  })

  test("ข้าม .trash และ dotfile/dotfolder", async () => {
    const fs = memoryVaultFs({
      ".trash/2025/x.md": "# trash\n",
      ".hidden/y.md": "# hidden\n",
      "ok.md": "# ok\n",
    })
    const report = await checkVault(fs)
    expect(report.docs.map((doc) => doc.id)).toEqual(["ok"])
  })
})

describe("resolveDoc", () => {
  test("อ่าน md + meta ข้างไฟล์", async () => {
    const fs = memoryVaultFs({
      "projects/doku/design.md": "---\ntitle: fm\n---\n\n# หัว\n",
      "projects/doku/design.meta.json": JSON.stringify({ title: "Design", tags: ["design"] }),
    })
    const doc = await resolveDoc("projects/doku/design.md", fs)
    expect(doc.id).toBe("projects/doku/design")
    expect(doc.meta.title).toBe("Design")
    expect(doc.metaSource).toBe("sidecar")
    expect(doc.body.startsWith("# หัว")).toBe(true)
    expect(doc.frontmatter).toEqual({ title: "fm" })
  })

  test("ไม่มี meta → default จากชื่อไฟล์ + ไม่มี warning", async () => {
    const fs = memoryVaultFs({ "research.md": "# R\n" })
    const doc = await resolveDoc("research", fs)
    expect(doc.meta.title).toBe("research")
    expect(doc.metaSource).toBe("default")
    expect(doc.warnings).toEqual([])
  })

  test("ไม่พบเอกสาร → DocNotFoundError", async () => {
    const fs = memoryVaultFs({})
    await expect(resolveDoc("nope", fs)).rejects.toThrow("ไม่พบเอกสาร")
  })

  test("resolveInline ใช้ frontmatter เป็น meta", () => {
    const doc = resolveInline("---\ntitle: Inline\ntags: [demo]\n---\n\n# x\n")
    expect(doc.meta.title).toBe("Inline")
    expect(doc.meta.tags).toEqual(["demo"])
    expect(doc.body.startsWith("# x")).toBe(true)
  })
})

describe("check: wikilink path form (M3 fix)", () => {
  test("[[projects/nope]] ที่ไฟล์ไม่มีจริง → wikilink_missing (ไม่ใช่ผ่านเงียบ)", async () => {
    const fs = memoryVaultFs({ "design.md": "# D\n\n[[projects/nope]]\n" })
    const report = await checkVault(fs)
    expect(report.errors.map((item) => item.code)).toContain("wikilink_missing")
  })

  test("[[projects/design]] ที่มีจริง → ไม่เตือน", async () => {
    const fs = memoryVaultFs({
      "design.md": "# D\n\n[[projects/design]]\n",
      "projects/design.md": "# P\n",
    })
    const report = await checkVault(fs)
    expect(report.errors.map((item) => item.code)).not.toContain("wikilink_missing")
  })
})
