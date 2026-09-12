import { describe, expect, test } from "bun:test"
import { buildDocIndex, defaultMeta, memoryVaultFs } from "../src/index.ts"
import { renderMarkdown } from "../src/render.ts"
import type { Warning } from "../src/types.ts"

async function render(md: string, options: Parameters<typeof renderMarkdown>[1] = {}) {
  const warnings: Warning[] = []
  const result = await renderMarkdown(md, { ...options, warnings })
  return { ...result, warnings }
}

describe("render: markdown พื้นฐาน", () => {
  test("GFM: ตาราง / task list / strikethrough", async () => {
    const { html } = await render(
      "| a | b |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n~~เก่า~~\n",
    )
    expect(html).toContain("<table>")
    expect(html).toContain('type="checkbox"')
    expect(html).toContain("task-list-item")
    expect(html).toContain("<del>เก่า</del>")
  })

  test("heading มี id + anchor ที่คลิกกลับได้ และเก็บ TOC (h2/h3)", async () => {
    const { html, toc } = await render("# หัวเรื่อง\n\n## ส่วนที่ 1\n\n### ย่อย\n")
    expect(html).toContain('id="ส่วนที่-1"')
    expect(html).toContain("kairn-anchor")
    expect(toc.map((entry) => entry.text)).toEqual(["ส่วนที่ 1", "ย่อย"])
  })

  test("code block ได้ syntax highlight จาก Shiki ฝั่ง server", async () => {
    const { html } = await render("```ts\nconst a = 1\n```\n")
    expect(html).toContain('class="shiki')
    expect(html).toContain("--shiki-dark")
  })

  test("KaTeX: inline + display math", async () => {
    const { html } = await render("สมการ $a^2+b^2=c^2$\n\n$$\n\\frac{1}{2}\n$$\n")
    expect(html).toContain('class="katex"')
    expect(html).toContain("katex-display")
    expect(html).not.toContain("language-math")
  })

  test("meta.render.math = false → ไม่ render KaTeX", async () => {
    const meta = {
      ...defaultMeta("d"),
      render: { toc: true, math: false, motion: true, diagram: true },
    }
    const { html } = await render("$a$", { meta })
    expect(html).not.toContain('class="katex"')
  })
})

describe("render: sanitize (เนื้อหาจาก AI = ไม่น่าเชื่อถือ)", () => {
  test("raw HTML ไม่ผ่าน", async () => {
    const { html } = await render(
      '# ปลอดภัย\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n',
    )
    expect(html).not.toContain("<script")
    expect(html).not.toContain("onerror")
    expect(html).not.toContain("<img src=x")
  })

  test("javascript: ถูกตัด แต่ข้อความยังอยู่", async () => {
    const { html } = await render("[คลิก](javascript:alert(1))\n")
    expect(html).not.toContain("javascript:")
    expect(html).toContain("คลิก")
  })

  test("ไม่มี style attribute จากเนื้อหา (ใช้ class เท่านั้น)", async () => {
    const { html } = await render(
      '<p style="background:url(x)">x</p>\n\n[ลิงก์](https://example.com)\n',
    )
    expect(html).not.toContain("style=")
  })

  test("iframe / form / svg / object ถูกทิ้ง", async () => {
    const { html } = await render(
      '<iframe src="https://evil.test"></iframe>\n\n<form action="/x"></form>\n',
    )
    expect(html).not.toContain("iframe")
    expect(html).not.toContain("<form")
  })

  test("task list ยังใช้ input checkbox ได้ (allowlist เจตนา)", async () => {
    const { html } = await render("- [x] ทำแล้ว\n")
    expect(html).toContain('<input type="checkbox" checked disabled>')
  })
})

describe("render: blocks (M0 = ทุก block ยังไม่ implement)", () => {
  test("block ที่รู้จักแต่ยังไม่ทำ → code block + info", async () => {
    const { html, warnings } = await render(':::warning{title="ระวัง"}\nข้อความ\n:::\n')
    expect(html).toContain(":::warning")
    expect(html).toContain("<pre")
    const item = warnings.find((entry) => entry.code === "block_unimplemented")
    expect(item?.level).toBe("info")
    expect(item?.field).toBe("warning")
  })

  test("block ที่ไม่รู้จัก → code block + warning", async () => {
    const { warnings } = await render(":::blahblah{bug=1}\nx\n:::\n")
    expect(warnings.some((entry) => entry.code === "block_unknown")).toBe(true)
  })

  test("text directive → inline (ห้ามมี <pre> ซ้อนใน <p>)", async () => {
    const { html } = await render("สถานะ: :badge[BETA]{color=green}\n")
    expect(html).toContain("<p>สถานะ: <code>:badge[BETA]{color=green}</code></p>")
    expect(html).not.toContain("<p>สถานะ: <pre")
  })

  test("directive ซ้อนกัน → เนื้อหาไม่ซ้ำไม่หาย", async () => {
    const { html, warnings } = await render(
      ':::tabs\n:::tab{label="a"}\nAAA\n:::\n:::tab{label="b"}\nBBB\n:::\n:::\n',
    )
    expect(html.match(/AAA/g)?.length).toBe(1)
    expect(html.match(/BBB/g)?.length).toBe(1)
    expect(warnings.some((entry) => entry.code === "block_unimplemented")).toBe(true)
  })

  test("`:::` ที่ไม่เข้าคู่ถูกตัดออก + เตือน", async () => {
    const { html, warnings } = await render(":::callout\nx\n:::\n\n:::\n")
    expect(html).not.toContain("<p>:::</p>")
    expect(warnings.some((entry) => entry.code === "block_stray_fence")).toBe(true)
  })

  test("ซ้อน block ด้วย `:::` ยาวเท่ากัน → เตือน block_nesting_ambiguous", async () => {
    const { warnings } = await render(':::tabs\n:::tab{label="a"}\nA\n:::\n:::\n')
    expect(warnings.some((entry) => entry.code === "block_nesting_ambiguous")).toBe(true)
  })

  test("ซ้อน block ด้วย fence ชั้นนอกยาวกว่า → ไม่มี warning เรื่อง fence", async () => {
    const { html, warnings } = await render(
      '::::tabs\n:::tab{label="a"}\nAAAA\n:::\n:::tab{label="b"}\nBBBB\n:::\n::::\n',
    )
    expect(html.match(/AAAA/g)?.length).toBe(1)
    expect(html.match(/BBBB/g)?.length).toBe(1)
    expect(warnings.some((entry) => entry.code.startsWith("block_nesting"))).toBe(false)
    expect(warnings.some((entry) => entry.code === "block_stray_fence")).toBe(false)
  })
})

describe("render: posts", () => {
  test("asset relative → /assets/<vault-path>?h=<hash>", async () => {
    const fs = memoryVaultFs({
      "projects/kairn/design.md": "# d\n",
      "projects/kairn/assets/diagram.svg": "<svg></svg>",
    })
    const { html, warnings } = await render("![รูป](assets/diagram.svg)\n", {
      docId: "projects/kairn/design",
      vault: { fs, index: new Map() },
    })
    expect(html).toMatch(/src="\/assets\/projects\/kairn\/assets\/diagram\.svg\?h=[0-9a-f]{12}"/)
    expect(warnings.some((entry) => entry.code === "asset_missing")).toBe(false)
  })

  test("asset หาย → warning + placeholder url (?h=missing) ไม่ throw", async () => {
    const fs = memoryVaultFs({ "design.md": "# d" })
    const { html, warnings } = await render("![รูป](assets/nope.png)\n", {
      docId: "design",
      vault: { fs },
    })
    expect(html).toContain("?h=missing")
    expect(warnings.some((entry) => entry.code === "asset_missing")).toBe(true)
  })

  test("path หลุด vault → ไม่ rewrite + warning", async () => {
    const fs = memoryVaultFs({ "design.md": "# d" })
    const { html, warnings } = await render("![x](../../../etc/passwd)\n", {
      docId: "design",
      vault: { fs },
    })
    expect(html).not.toContain("/assets/")
    expect(warnings.some((entry) => entry.code === "asset_path_unsafe")).toBe(true)
  })

  test("raw HTML อย่าง <video> ถูกตัดทั้งก้อน (ไม่ใช่ทางอ้าง asset)", async () => {
    const { html } = await render('<video src="media/demo.mp4" loop muted></video>\n')
    expect(html).not.toContain("<video")
    expect(html).not.toContain("media/demo.mp4")
  })
})

describe("render: links", () => {
  const fs = memoryVaultFs({
    "design.md": "# d",
    "projects/kairn/research.md": "# r",
    "projects/kairn/shared/other.md": "# o",
  })
  const index = buildDocIndex(["design", "projects/kairn/research", "projects/kairn/shared/other"])
  const hasDoc = (id: string) => index.has(id.slice(id.lastIndexOf("/") + 1))

  test("ลิงก์ relative .md → /d/<path id>", async () => {
    const { html } = await render("[research](./research.md)\n", {
      docId: "projects/kairn/design",
      vault: { fs, index, hasDoc },
    })
    expect(html).toContain('href="/d/projects/kairn/research"')
  })

  test("ลิงก์ absolute ในเว็บไม่ถูกแตะ", async () => {
    const { html } = await render("[x](/d/projects/kairn/research) · [y](https://example.com)\n", {
      docId: "design",
      vault: { fs, index, hasDoc },
    })
    expect(html).toContain('href="/d/projects/kairn/research"')
    expect(html).toContain('href="https://example.com"')
  })

  test("wikilink: basename / path / alias", async () => {
    const { html, warnings } = await render(
      "[[research]] · [[projects/kairn/shared/other]] · [[research|งานวิจัย]]\n",
      {
        docId: "design",
        vault: { fs, index, hasDoc },
      },
    )
    expect(html).toContain('href="/d/projects/kairn/research"')
    expect(html).toContain('href="/d/projects/kairn/shared/other"')
    expect(html).toContain(">งานวิจัย</a>")
    expect(warnings.some((entry) => entry.code === "wikilink_missing")).toBe(false)
  })

  test("wikilink ที่หาไม่เจอ → เตือน + คงข้อความเดิม", async () => {
    const { html, warnings } = await render("[[ไม่มีอยู่]]\n", {
      docId: "design",
      vault: { fs, index, hasDoc },
    })
    expect(html).toContain("[[ไม่มีอยู่]]")
    expect(warnings.some((entry) => entry.code === "wikilink_missing")).toBe(true)
  })

  test("wikilink ซ้ำ → เตือน + เลือกตัวแรก", async () => {
    const dupIndex = buildDocIndex(["a/note", "b/note"])
    const { html, warnings } = await render("[[note]]\n", {
      docId: "design",
      vault: { fs, index: dupIndex },
    })
    expect(html).toContain('href="/d/a/note"')
    expect(warnings.some((entry) => entry.code === "wikilink_ambiguous")).toBe(true)
  })

  test("ลิงก์ใน code block ไม่ถูกแตะ", async () => {
    const { html } = await render("```\n[[research]]\n```\n", {
      docId: "design",
      vault: { fs, index, hasDoc },
    })
    expect(html).toContain("[[research]]")
    expect(html).not.toContain('href="/d/projects/kairn/research"')
  })

  test("ลิงก์ไปเอกสารที่ไม่มี → warning link_broken", async () => {
    const { warnings } = await render("[x](./missing.md)\n", {
      docId: "projects/kairn/design",
      vault: { fs, index, hasDoc },
    })
    expect(warnings.some((entry) => entry.code === "link_broken")).toBe(true)
  })
})

describe("render: ไม่มี vault (stateless)", () => {
  test("render ได้ปกติและให้ info เรื่อง asset", async () => {
    const { html, warnings } = await render("![x](assets/a.png)\n\n[[note]]\n")
    expect(html).toContain("assets/a.png")
    expect(warnings.some((entry) => entry.code === "asset_unresolved")).toBe(true)
  })

  test("frontmatter ถูกตัดออกจากเนื้อหา", async () => {
    const { html } = await render("---\ntitle: x\n---\n\n# หัว\n")
    expect(html).not.toContain("title: x")
    expect(html).toContain("หัว")
  })
})
