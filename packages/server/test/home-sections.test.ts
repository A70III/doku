/**
 * M3.5 S2 — home sections (plan 3.5.1 folder sections · 3.5.3 date groups · 3.5.4 sort)
 *
 * เรียก `HomePage` ตรง ๆ แล้ว serialize เป็น HTML ค่อย assert — สไตล์เดียวกับ
 * `app.test.ts` ที่ assert บน HTML string (ไม่ต้องพึ่ง DOM/playwright)
 *
 * fixtures สร้าง `DocSummary` / `TreeNode` ล้วน ๆ ไม่แตะ fs · assert บน `<main>` เฉย ๆ
 * เพราะ sidebar tree โชว์ doc ครบทุกตัวอยู่แล้ว (นับ appearance ตรงนั้นจะได้ 2 เสมอ)
 */

import { describe, expect, test } from "bun:test"
import type { DocSummary, TreeFolder, TreeNode } from "../src/tree.ts"
import { HomePage } from "../src/web/pages.tsx"

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = Date.now()

type HomeProps = Parameters<typeof HomePage>[0]

function doc(id: string, over: Partial<DocSummary> = {}): DocSummary {
  return {
    id,
    title: id.slice(id.lastIndexOf("/") + 1),
    tags: [],
    pinned: false,
    status: "active",
    mtimeMs: NOW - DAY_MS,
    bytes: 100,
    ...over,
  }
}

function folder(path: string, over: Partial<TreeFolder> = {}): TreeFolder {
  return { type: "folder", path, name: path.split("/").pop() ?? path, children: [], ...over }
}

function treeDoc(id: string, pinned = false): TreeNode {
  return { type: "doc", id, name: id, title: id, pinned }
}

/** render HomePage → ตัดเฉพาะ `<main>` (กัน sidebar ที่โชว์ทั้ง tree) */
function main(props: Omit<HomeProps, "vaultName"> & { vaultName?: string }): string {
  const html = String(HomePage({ ...props, vaultName: props.vaultName ?? "vault" }))
  const start = html.indexOf('<main class="doku-main">')
  const end = html.indexOf("</main>", start)
  return html.slice(start, end)
}

/** section ทั้งหน้า — HomePage ไม่มี section ซ้อนกัน จึงจับด้วย regex ได้ */
function sections(html: string): string[] {
  return html.match(/<section class="mb-12"[^>]*>[\s\S]*?<\/section>/g) ?? []
}

function sectionOf(html: string, marker: string): string {
  const found = sections(html).find((entry) => entry.includes(marker))
  if (!found) throw new Error(`ไม่เจอ section: ${marker}`)
  return found
}

/** เรียงลำดับ doc id ตามตำแหน่ง `href="/d/<id>"` ใน html (ใช้เช็คผล sort) */
function hrefOrder(html: string, ids: string[]): string[] {
  return ids
    .map((id) => ({ id, at: html.indexOf(`href="/d/${id}"`) }))
    .filter((entry) => entry.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.id)
}

/** count badge ใน SectionHead — แยกจากตัวเลขอื่น (วันที่/แท็ก) ด้วย class เต็ม */
const countBadge = (n: number) =>
  `text-xs font-normal text-(--d-text-subtle) tabular-nums">${n}</span>`

const TREE: TreeNode[] = [
  folder("projects", { title: "โปรเจกต์", color: "#2b5fc4", icon: "folder-tree" }),
  folder("daily"),
  folder("empty"),
  treeDoc("root-new"),
  treeDoc("root-pinned", true),
]

const DOCS: DocSummary[] = [
  doc("root-new", { mtimeMs: NOW - 1000, tags: ["intro"] }),
  doc("root-pinned", { pinned: true }),
  doc("projects/design", {
    title: "Design",
    tags: ["design"],
    mtimeMs: NOW - 60 * DAY_MS,
    bytes: 900,
  }),
  doc("projects/pinned-in-folder", { title: "PinInFolder", pinned: true }),
  doc("projects/doku/deep", { title: "Deep", mtimeMs: NOW - 60 * DAY_MS }),
  doc("daily/today", { mtimeMs: NOW - 5000 }),
]

describe("home — folder sections (3.5.1)", () => {
  const html = main({ tree: TREE, docs: DOCS })

  test("มี section ต่อ top-level folder ทุกตัวตามลำดับ tree · ชื่อ fallback · ลิงก์ทั้งหมด", () => {
    expect([...html.matchAll(/data-home-folder="([^"]+)"/g)].map((m) => m[1])).toEqual([
      "projects",
      "daily",
      "empty",
    ])
    // title จาก _folder.meta.json ใช้แทนชื่อโฟลเดอร์
    const projects = sectionOf(html, 'data-home-folder="projects"')
    expect(projects).toContain(">โปรเจกต์</span>")
    expect(projects).not.toContain(">projects</span>")
    expect(projects).toContain('href="/d/projects"')
    expect(projects).toContain("ทั้งหมด")
    // ไม่มี title → fallback เป็นชื่อโฟลเดอร์ + นับ 1 (doc โดยตรง)
    const daily = sectionOf(html, 'data-home-folder="daily"')
    expect(daily).toContain('<span class="min-w-0 truncate">daily</span>')
    expect(daily).toContain(countBadge(1))
    expect(daily).toContain('href="/d/daily"')
    expect(daily).not.toContain('href="/d/projects"') // ไม่เอา section ของโฟลเดอร์อื่นมารวม
  })

  test("โฟลเดอร์นับ 0 (ของอยู่ลึกกว่า/เปล่า) ยังโชว์ header + นับ 0 — มีค่าตอนเข้าไปดู", () => {
    const empty = sectionOf(html, 'data-home-folder="empty"')
    expect(empty).toContain(countBadge(0))
    expect(empty).toContain('href="/d/empty"')
    // projects มี doc โดยตรง 2 ตัว (nested ไม่นับ)
    expect(sectionOf(html, 'data-home-folder="projects"')).toContain(countBadge(2))
  })

  test("tint ไอคอนจากสีโฟลเดอร์ — มีสีใช้ style, ไม่มีสีใช้ subtle", () => {
    expect(sectionOf(html, 'data-home-folder="projects"')).toContain('style="color:#2b5fc4"')
    expect(sectionOf(html, 'data-home-folder="daily"')).not.toContain('style="color:')
  })

  test("แถว folder = title + tag + mtime + pin marker (pin ข้างใน)", () => {
    const projects = sectionOf(html, 'data-home-folder="projects"')
    expect(projects).toContain(">Design</span>")
    expect(projects).toContain("#design") // tag ของ doc ในโฟลเดอร์เอง
    expect(projects).not.toContain("#intro") // tag ของ doc ฝั่ง root ไม่หลุดเข้ามา
    // pin ของ doc ในโฟลเดอร์ = ไอคอน + sr-only ในแถวตัวเอง (ไม่ใช่ section ปักหมุด)
    expect(projects).toContain("ปักหมุด")
    expect(projects).toContain("PinInFolder")
  })
})

describe("home — single-appearance", () => {
  const html = main({ tree: TREE, docs: DOCS })
  const ids = [
    "root-new",
    "root-pinned",
    "projects/design",
    "projects/pinned-in-folder",
    "projects/doku/deep",
    "daily/today",
  ]

  test("ทุก doc ปรากฏในรายการบ้าน exactly once — ไม่ซ้ำ ไม่หาย (นอกเหนือจาก highlight ล่าสุด)", () => {
    // section ล่าสุด = highlight ที่ยอมซ้ำตามพฤติกรรมเดิม — นัดที่เหลือต้องมีบ้านเดียว
    const withoutRecent = html.replace(
      /<section class="mb-12" data-home-section="recent"[\s\S]*?<\/section>/,
      "",
    )
    for (const id of ids) {
      const hits = withoutRecent.match(new RegExp(`href="/d/${id}"`, "g")) ?? []
      expect(`${id}:${hits.length}`).toBe(`${id}:1`)
    }
  })

  test("หมุดแบ่งตามบ้าน: root → section ปักหมุด · ในโฟลเดอร์ → อยู่ใน section โฟลเดอร์", () => {
    const pinned = sectionOf(html, 'data-home-section="pinned"')
    expect(pinned).toContain('href="/d/root-pinned"')
    expect(pinned).not.toContain("pinned-in-folder")
    expect(sectionOf(html, 'data-home-folder="projects"')).toContain(
      'href="/d/projects/pinned-in-folder"',
    )
    // doc ซับโฟลเดอร์ (projects/doku/deep) ไม่อยู่ใน section โฟลเดอร์ — ตกไป flat list
    expect(sectionOf(html, 'data-home-folder="projects"')).not.toContain(
      'href="/d/projects/doku/deep"',
    )
    expect(sectionOf(html, 'data-home-section="flat"')).toContain('href="/d/projects/doku/deep"')
  })
})

describe("home — date groups (3.5.3)", () => {
  const html = main({ tree: TREE, docs: DOCS })

  test("flat list จัดกลุ่มตามวันด้วย label ไทย · ใหม่ → เก่า", () => {
    const flat = sectionOf(html, 'data-home-section="flat"')
    expect(flat).toContain('data-date-group="today"')
    expect(flat).toContain('data-date-group="older"')
    expect(flat).toContain("วันนี้")
    expect(flat).toContain("เก่ากว่า")
    expect(flat.indexOf('data-date-group="today"')).toBeLessThan(
      flat.indexOf('data-date-group="older"'),
    )
    expect(flat).not.toContain('data-date-group="week"') // ไม่มี doc อายุในช่วงนั้น = group ว่างไม่ถูกคืน
  })
})

describe("home — sort control (3.5.4)", () => {
  const SORT_TREE: TreeNode[] = []
  const SORT_DOCS: DocSummary[] = [
    doc("one", { title: "mmm", tags: ["intro"], mtimeMs: NOW - 1000, bytes: 500 }),
    doc("two", { title: "zzz", tags: ["intro"], mtimeMs: NOW - 5000, bytes: 999 }),
    doc("three", { title: "aaa", tags: ["intro"], mtimeMs: NOW - 2000, bytes: 10 }),
  ]
  const navOf = (html: string) => html.match(/<nav aria-label="เรียงลำดับ"[\s\S]*?<\/nav>/)?.[0] ?? ""

  test("ลิงก์ วันที่/ชื่อ/ขนาด อยู่ในหัว flat list · active = accent ตัวเดียว", () => {
    const flat = sectionOf(main({ tree: SORT_TREE, docs: SORT_DOCS }), 'data-home-section="flat"')
    const nav = navOf(flat)
    expect(nav).toContain("วันที่")
    expect(nav).toContain("ชื่อ")
    expect(nav).toContain("ขนาด")
    expect(nav).toContain("sort=mtime")
    expect(nav).toContain("sort=name")
    expect(nav).toContain("sort=size")
    expect(nav.match(/aria-current="true"/g) ?? []).toHaveLength(1)
    // ตัวที่ active ใช้ accent จริง (ไม่ใช่แค่ hover)
    expect(nav).toMatch(/aria-current="true"[^>]*text-\(--d-accent\)/)
  })

  test("คง query ที่มีอยู่ (?tag=) ไว้ในลิงก์ sort", () => {
    const flat = sectionOf(
      main({ tree: SORT_TREE, docs: SORT_DOCS, tag: "intro" }),
      'data-home-section="flat"',
    )
    expect(navOf(flat)).toContain("tag=intro&amp;sort=name")
  })

  test("?sort=name เรียงตาม title (th) · ?sort=size มากก่อน · default/bogus = mtime ใหม่ก่อน", () => {
    const ids = ["one", "two", "three"]
    const withSort = (sort?: string) => main({ tree: SORT_TREE, docs: SORT_DOCS, sort })
    const flat = (sort?: string) => sectionOf(withSort(sort), 'data-home-section="flat"')

    expect(hrefOrder(flat("name"), ids)).toEqual(["three", "one", "two"])
    expect(hrefOrder(flat("size"), ids)).toEqual(["two", "one", "three"])
    expect(hrefOrder(flat(), ids)).toEqual(["one", "three", "two"])
    // whitelist ของ parseSort — ค่านอกตาราง = mtime
    expect(hrefOrder(flat("bogus"), ids)).toEqual(["one", "three", "two"])
  })

  test("active state ของ ?sort=name ย้ายไปลิงก์ ชื่อ", () => {
    const nav = navOf(
      sectionOf(
        main({ tree: SORT_TREE, docs: SORT_DOCS, sort: "name" }),
        'data-home-section="flat"',
      ),
    )
    expect(nav).toMatch(/href="\/\?sort=name" aria-current="true"[^>]*text-\(--d-accent\)/)
  })
})

describe("home — ล่าสุด (section เดิมคงไว้ตาม ticket)", () => {
  const html = main({ tree: TREE, docs: DOCS })

  test("มี section ล่าสุด — 8 เอกสารใหม่สุด (ไม่รวมหมุด) เรียง mtime ใหม่ → เก่า", () => {
    const recent = sectionOf(html, 'data-home-section="recent"')
    expect(recent).toContain("ล่าสุด")
    expect(recent).toContain(countBadge(4)) // fixture มี 4 non-pinned (≤ 8 = ครบทุกตัว)
    const pos = (id: string) => recent.indexOf(`href="/d/${id}"`)
    for (const id of ["root-new", "daily/today", "projects/design", "projects/doku/deep"]) {
      expect(pos(id)).toBeGreaterThanOrEqual(0)
    }
    // mtime desc: root-new(1s) → daily/today(5s) → design/deep (60d เท่ากัน — สองตัวท้ายไม่ยึดลำดับ)
    expect(pos("root-new")).toBeLessThan(pos("daily/today"))
    expect(pos("daily/today")).toBeLessThan(pos("projects/design"))
    expect(pos("daily/today")).toBeLessThan(pos("projects/doku/deep"))
    // หมุดมี section ของตัวเอง → ไม่หลุดเข้ามาใน ล่าสุด
    expect(recent).not.toContain("root-pinned")
    expect(recent).not.toContain("pinned-in-folder")
  })
})

describe("home — ส่วนเดิมคงไว้", () => {
  const html = main({ tree: TREE, docs: DOCS })

  test("masthead stats + tag chips + section ปักหมุด + ล่าสุด ยังอยู่", () => {
    expect(html).toContain("6 เอกสาร · 2 แท็ก")
    expect(html).toContain(">แท็ก</span>")
    expect(html).toContain('href="/?tag=intro"')
    expect(sectionOf(html, 'data-home-section="pinned"')).toContain(countBadge(1))
    expect(sectionOf(html, 'data-home-section="recent"')).toContain("ล่าสุด")
  })

  test("vault ว่าง → ข้อความว่างเดิม ไม่พัง", () => {
    const empty = main({ tree: [], docs: [] })
    expect(empty).toContain("ยังไม่มีเอกสารใน vault นี้")
    expect(empty).not.toContain("data-home-section")
  })
})
