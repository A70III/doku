import { describe, expect, test } from "bun:test"
import { buildDocIndex, defaultMeta, memoryVaultFs, rehypeRewrite } from "../src/index.ts"
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
    expect(html).toContain("doku-anchor")
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

describe("render: blocks (M2)", () => {
  test("callout → <aside data-block=callout> + variant + title", async () => {
    const { html, warnings } = await render(':::warning{title="ระวัง"}\nข้อความ\n:::\n')
    expect(html).toContain('data-block="callout"')
    expect(html).toContain('data-variant="warning"')
    expect(html).toContain('data-icon="triangle-alert"') // icon ผ่าน data-icon → CSS mask (docs/08 ข้อ 35)
    expect(html).toContain('data-part="callout-title">ระวัง')
    expect(html).toContain("ข้อความ")
    expect(warnings.some((entry) => entry.code === "block_unimplemented")).toBe(false)
  })

  test("attribute ที่ไม่รู้จัก/ค่าไม่ผ่าน → block_attribute_unknown (info)", async () => {
    const { html, warnings } = await render(':::warning{title="x" bogus=1}\ny\n:::\n')
    const item = warnings.find((entry) => entry.code === "block_attribute_unknown")
    expect(item?.level).toBe("info")
    expect(item?.message).toContain("bogus")
    expect(html).toContain("callout")
  })

  test("block ที่ไม่รู้จัก → code block + warning", async () => {
    const { warnings } = await render(":::blahblah{bug=1}\nx\n:::\n")
    expect(warnings.some((entry) => entry.code === "block_unknown")).toBe(true)
  })

  test("`:name` กลางข้อความโดยไม่มี [...] = ข้อความธรรมดา (ไม่ใช่ block)", async () => {
    const { html, warnings } = await render("db: bun:sqlite\n")
    expect(html).toContain("db: bun:sqlite")
    expect(warnings.some((entry) => entry.code === "block_unknown")).toBe(false)
  })

  test("text directive → inline (ห้ามมี <pre> ซ้อนใน <p>)", async () => {
    const { html } = await render("สถานะ: :badge[BETA]{color=green}\n")
    expect(html).toContain('<span data-color="green" data-block="badge">BETA</span>')
    expect(html).not.toContain("<p>สถานะ: <pre")
  })

  test("mark: ==ข้อความ=={.สี}", async () => {
    const { html } = await render("==สำคัญ=={.amber} และ ==ธรรมดา==\n")
    expect(html).toContain('<mark data-color="amber" data-block="mark">สำคัญ</mark>')
    expect(html).toContain('<mark data-block="mark">ธรรมดา</mark>')
  })

  test("kv: แยก key/value ทีละบรรทัด (รวมบรรทัดที่ remark ยุบ)", async () => {
    const { html } = await render(":::kv\nruntime: Bun\nhttp: Hono\ndb: bun:sqlite\n:::\n")
    expect(html).toContain('data-part="kv-key">runtime')
    expect(html).toContain('data-part="kv-value">bun:sqlite')
    expect(html.match(/data-part="kv-row"/g)?.length).toBe(3)
  })

  test("stats: :stat ข้างในกลายเป็น tile", async () => {
    const { html } = await render(
      ':::stats\n:stat[42]{label="เอกสาร"}\n:stat[18]{label="แท็ก"}\n:::\n',
    )
    expect(html.match(/data-block="stat" data-variant="tile"/g)?.length).toBe(2)
    expect(html).toContain('data-part="stat-value">42')
  })

  test("figure: ไม่มี src → placeholder + เตือน ไม่ใช่รูปแตก", async () => {
    const { html, warnings } = await render(":::figure{caption=x}\n:::\n")
    expect(html).toContain("data-missing")
    expect(warnings.some((entry) => entry.code === "block_attribute_unknown")).toBe(true)
  })

  test("figure: width นอกสเต็ป 5 → เตือนและไม่ใส่ data-width", async () => {
    const { html, warnings } = await render(":::figure{src=x.svg width=73}\n:::\n")
    expect(html).not.toContain("data-width")
    expect(warnings.some((entry) => entry.code === "block_attribute_unknown")).toBe(true)
  })

  test("motion: quantize delay/duration เป็นสเต็ป 100ms", async () => {
    const { html } = await render(":::motion{effect=fade-up delay=210ms duration=390ms}\nx\n:::\n")
    expect(html).toContain('data-delay="200"')
    expect(html).toContain('data-duration="400"')
  })

  test("directive ซ้อนกัน → เนื้อหาไม่ซ้ำไม่หาย", async () => {
    const { html } = await render(
      '::::tabs\n:::tab{label="a"}\nAAA\n:::\n:::tab{label="b"}\nBBB\n:::\n::::\n',
    )
    expect(html.match(/AAA/g)?.length).toBe(1)
    expect(html.match(/BBB/g)?.length).toBe(1)
    expect(html.match(/data-part="tab-panel"/g)?.length).toBe(2)
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

  test("sanitize: block ไม่สร้าง style attribute และตัด javascript: ใน src", async () => {
    const { html } = await render(':::figure{src="javascript:alert(1)" caption=x}\n:::\n')
    expect(html).not.toContain("style=")
    expect(html).not.toContain("javascript:")
  })
})

describe("render: posts", () => {
  test("asset relative → /assets/<vault-path>?h=<hash>", async () => {
    const fs = memoryVaultFs({
      "projects/doku/design.md": "# d\n",
      "projects/doku/assets/diagram.svg": "<svg></svg>",
    })
    const { html, warnings } = await render("![รูป](assets/diagram.svg)\n", {
      docId: "projects/doku/design",
      vault: { fs, index: new Map() },
    })
    expect(html).toMatch(/src="\/assets\/projects\/doku\/assets\/diagram\.svg\?h=[0-9a-f]{12}"/)
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
    "projects/doku/research.md": "# r",
    "projects/doku/shared/other.md": "# o",
  })
  const index = buildDocIndex(["design", "projects/doku/research", "projects/doku/shared/other"])
  const hasDoc = (id: string) => index.has(id.slice(id.lastIndexOf("/") + 1))

  test("ลิงก์ relative .md → /d/<path id>", async () => {
    const { html } = await render("[research](./research.md)\n", {
      docId: "projects/doku/design",
      vault: { fs, index, hasDoc },
    })
    expect(html).toContain('href="/d/projects/doku/research"')
  })

  test("ลิงก์ absolute ในเว็บไม่ถูกแตะ", async () => {
    const { html } = await render("[x](/d/projects/doku/research) · [y](https://example.com)\n", {
      docId: "design",
      vault: { fs, index, hasDoc },
    })
    expect(html).toContain('href="/d/projects/doku/research"')
    expect(html).toContain('href="https://example.com"')
  })

  test("wikilink: basename / path / alias", async () => {
    const { html, warnings } = await render(
      "[[research]] · [[projects/doku/shared/other]] · [[research|งานวิจัย]]\n",
      {
        docId: "design",
        vault: { fs, index, hasDoc },
      },
    )
    expect(html).toContain('href="/d/projects/doku/research"')
    expect(html).toContain('href="/d/projects/doku/shared/other"')
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
    expect(html).not.toContain('href="/d/projects/doku/research"')
  })

  test("ลิงก์ไปเอกสารที่ไม่มี → warning link_broken", async () => {
    const { warnings } = await render("[x](./missing.md)\n", {
      docId: "projects/doku/design",
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

describe("M3 fixes: asset attrs / tabs / fences / figure", () => {
  test("video: poster มาจาก src — ไฟล์รูปชื่อเดียวกันข้าง ๆ วิดีโอ (docs/08 ข้อ 65)", async () => {
    const fs = memoryVaultFs({
      "a/design.md": "# d\n",
      "a/assets/clip.mp4": "v",
      "a/assets/clip.png": "p",
    })
    const { html, warnings } = await render(':::video{src="assets/clip.mp4"}\n:::\n', {
      docId: "a/design",
      vault: { fs },
    })
    expect(html).toMatch(/src="\/assets\/a\/assets\/clip\.mp4\?h=[0-9a-f]+"/)
    expect(html).toMatch(/poster="\/assets\/a\/assets\/clip\.png\?h=[0-9a-f]+"/)
    expect(warnings.some((item) => item.code === "asset_missing")).toBe(false)
  })

  test("video: ไม่มีไฟล์ poster ข้าง ๆ → ไม่มี poster + ไม่เตือน (probe เงียบ)", async () => {
    const fs = memoryVaultFs({ "a/design.md": "# d\n", "a/assets/clip.mp4": "v" })
    const { html, warnings } = await render(':::video{src="assets/clip.mp4"}\n:::\n', {
      docId: "a/design",
      vault: { fs },
    })
    expect(html).not.toContain("poster=")
    expect(warnings.filter((item) => item.code === "asset_missing")).toEqual([])
  })

  test("audio: ไม่มี poster แม้มีรูปชื่อเดียวกัน", async () => {
    const fs = memoryVaultFs({
      "a/design.md": "# d\n",
      "a/assets/track.mp3": "v",
      "a/assets/track.png": "p",
    })
    const { html } = await render(':::video{src="assets/track.mp3"}\n:::\n', {
      docId: "a/design",
      vault: { fs },
    })
    expect(html).toContain("<audio")
    expect(html).not.toContain("poster=")
  })

  test("poster=/loop/muted/controls ถอดออกจาก block แล้ว — เขียนมาก็ไม่ถูกใช้", async () => {
    const fs = memoryVaultFs({ "a/design.md": "# d\n", "a/assets/clip.mp4": "v" })
    const { html, warnings } = await render(
      ':::video{src="assets/clip.mp4" poster="assets/cover.png" loop muted controls}\n:::\n',
      { docId: "a/design", vault: { fs } },
    )
    expect(html).not.toContain("loop")
    expect(html).not.toContain("muted")
    expect(html).toContain("controls")
    for (const attr of ["poster", "loop", "muted", "controls"]) {
      expect(warnings.some((item) => item.message.includes(attr))).toBe(true)
    }
  })

  test("video: YouTube ทุกรูปแบบ → iframe ของ youtube-nocookie", async () => {
    const forms = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ?t=30",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx",
    ]
    for (const src of forms) {
      const { html, warnings } = await render(`:::video{src="${src}"}\n:::\n`)
      expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"')
      expect(html).toContain('data-provider="youtube"')
      expect(html).toContain('title="วิดีโอจาก YouTube"')
      expect(warnings.some((item) => item.code === "asset_missing")).toBe(false)
    }
  })

  test("video: ลิงก์ภายนอกที่ไม่ใช่ YouTube → placeholder + เตือน (ยังไม่รองรับ)", async () => {
    const { html, warnings } = await render(':::video{src="https://evil.test/clip.mp4"}\n:::\n')
    expect(html).not.toContain("iframe")
    expect(html).not.toContain("evil.test")
    expect(warnings.some((item) => item.code === "block_attribute_unknown")).toBe(true)
  })

  test("rehypeRewrite ถอด iframe ทุกตัวที่ไม่ใช่ embed ที่อนุญาต (ด่านสุดท้าย)", async () => {
    const tree = {
      type: "root" as const,
      children: [
        {
          type: "element" as const,
          tagName: "iframe",
          properties: { src: "https://evil.test/x" },
          children: [],
        },
        {
          type: "element" as const,
          tagName: "iframe",
          properties: { src: "javascript:alert(1)" },
          children: [],
        },
        {
          type: "element" as const,
          tagName: "iframe",
          properties: { src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0" },
          children: [],
        },
      ],
    }
    await rehypeRewrite({ docId: "x", onWarning: () => {} })(tree as never)
    expect(tree.children.length).toBe(1)
    expect(tree.children[0]?.properties?.src).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    )
  })

  test("ยูทูบปลอม (โดเมนคล้าย) ไม่ถูกฝัง", async () => {
    for (const src of [
      "https://evilyoutube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.evil.test/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
      "javascript:alert(1)",
    ]) {
      const { html } = await render(`:::video{src="${src}"}\n:::\n`)
      expect(html).not.toContain("iframe")
    }
  })

  test("tabs: มี HTML/definition ก่อน tab → เนื้อหาไม่หาย", async () => {
    const { html } = await render(
      '::::tabs\n<div>x</div>\n\n:::tab{label="a"}\nAAA\n:::\n:::tab{label="b"}\nBBB\n:::\n::::\n',
    )
    expect(html).toContain("AAA")
    expect(html).toContain("BBB")
    expect((html.match(/data-part="tab-panel"/g) ?? []).length).toBe(2)
  })

  test("`:::` ใน indented code block ไม่ถูกนับเป็น directive", async () => {
    const { warnings } = await render("ย่อหน้า\n\n    :::note\n    โค้ด\n\nจบ\n")
    expect(warnings.some((item) => item.code === "block_unclosed")).toBe(false)
  })

  test("figure: width=70% ใช้ได้ (docs/03 เขียนแบบมี %)", async () => {
    const { html, warnings } = await render(':::figure{src="a.png" width=70%}\n:::\n')
    expect(html).toContain('data-width="70"')
    expect(warnings.some((item) => item.message.includes("width"))).toBe(false)
  })
})
