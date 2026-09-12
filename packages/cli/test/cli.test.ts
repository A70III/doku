import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"
import { parseArgs } from "../src/index.ts"

const CLI = resolve(import.meta.dir, "../src/index.ts")
const REPO = resolve(import.meta.dir, "../../..")
const VAULT = `${REPO}/examples/vault`

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

async function kairn(args: string[], stdin?: string): Promise<RunResult> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { code, stdout, stderr }
}

describe("parseArgs", () => {
  test("แยก command / positional / flag พร้อมค่า", () => {
    const args = parseArgs(["render", "a/b", "--vault", "v", "--json", "--out=x.html"])
    expect(args.command).toBe("render")
    expect(args.positional).toEqual(["a/b"])
    expect(args.flags.get("vault")).toBe("v")
    expect(args.flags.get("json")).toBe(true)
    expect(args.flags.get("out")).toBe("x.html")
  })

  test("flag ที่ต้องมีค่าแต่ไม่มี → error", () => {
    expect(() => parseArgs(["render", "--vault"])).toThrow("ต้องมีค่า")
  })
})

describe("kairn render (M0 definition of done)", () => {
  test("render เอกสารจาก vault → HTML หน้าเดียวจบ", async () => {
    const { code, stdout, stderr } = await kairn([
      "render",
      "--vault",
      VAULT,
      "projects/kairn/design",
    ])
    expect(code).toBe(0)
    expect(stdout).toContain("<!doctype html>")
    expect(stdout).toContain("kairn-prose")
    expect(stdout).toContain("Kairn Design")
    expect(stdout).toContain('data-accent style="--doc-accent: #7c3aed"')
    // block ทั้งหมดยังไม่ implement ที่ M0 → ต้องมี warning บอก ไม่ใช่เงียบ
    expect(stderr).toContain("block_unimplemented")
  })

  test("--fragment ได้เฉพาะ HTML fragment", async () => {
    const { code, stdout } = await kairn([
      "render",
      "--vault",
      VAULT,
      "projects/kairn/design",
      "--fragment",
    ])
    expect(code).toBe(0)
    expect(stdout).not.toContain("<!doctype html>")
    expect(stdout).toContain("<h1")
  })

  test("--stdin + --fragment ใช้ได้แบบ stateless", async () => {
    const { code, stdout } = await kairn(["render", "--stdin", "--fragment"], "# หัว\n\nเนื้อหา\n")
    expect(code).toBe(0)
    expect(stdout).toContain('id="หัว"')
    expect(stdout).toContain("<p>เนื้อหา</p>")
  })

  test("โจทย์ M0: code สี + สมการ ครบในหน้าเดียว", async () => {
    const md = "# Demo\n\n$$E = mc^2$$\n\n```ts\nconst x = 1\n```\n"
    const { code, stdout } = await kairn(["render", "--stdin"], md)
    expect(code).toBe(0)
    expect(stdout).toContain('class="katex"')
    expect(stdout).toContain("data:font/woff2;base64") // KaTeX CSS ฝังฟอนต์ → offline ได้
    expect(stdout).toContain("--shiki-dark")
  })

  test("--json ให้ agent parse ได้", async () => {
    const { code, stdout } = await kairn(["render", "--stdin", "--fragment", "--json"], "# x\n")
    expect(code).toBe(0)
    const payload = JSON.parse(stdout) as { ok: boolean; content: string }
    expect(payload.ok).toBe(true)
    expect(payload.content).toContain("<h1")
  })

  test("เอกสารที่ไม่มี → exit 1 พร้อมข้อความอ่านรู้เรื่อง", async () => {
    const { code, stderr } = await kairn(["render", "--vault", VAULT, "projects/nope"])
    expect(code).toBe(1)
    expect(stderr).toContain("ไม่พบเอกสาร")
  })

  test("path traversal ถูกปฏิเสธ", async () => {
    const { code } = await kairn(["render", "--vault", VAULT, "../../../etc/passwd"])
    expect(code).toBe(1)
  })

  test("vault ที่ไม่มี → exit 2 + บอกวิธีใช้", async () => {
    const { code, stderr } = await kairn(["render", "--vault", "/tmp/definitely-no-vault", "x"])
    expect(code).toBe(2)
    expect(stderr).toContain("--vault")
  })
})

describe("kairn check", () => {
  test("vault ตัวอย่างผ่าน (exit 0) — block ที่ยังไม่ทำเป็นแค่ info", async () => {
    const { code, stdout } = await kairn(["check", "--vault", VAULT])
    expect(code).toBe(0)
    expect(stdout).toContain("3 docs")
  })

  test("--json คืน report ที่ agent ใช้ต่อได้", async () => {
    const { code, stdout } = await kairn(["check", "--vault", VAULT, "--json"])
    expect(code).toBe(0)
    const report = JSON.parse(stdout) as {
      ok: boolean
      stats: { docs: number }
      docs: { id: string }[]
    }
    expect(report.ok).toBe(true)
    expect(report.stats.docs).toBe(3)
    expect(report.docs.map((doc) => doc.id)).toContain("projects/kairn/design")
  })

  test("ตรวจเฉพาะเอกสารเดียวได้", async () => {
    const { code, stdout } = await kairn(["check", "--vault", VAULT, "daily/2025-09-12"])
    expect(code).toBe(0)
    expect(stdout).toContain("1 docs")
  })

  test("คำสั่งที่ไม่รู้จัก → exit 2", async () => {
    const { code } = await kairn(["cook", "dinner"])
    expect(code).toBe(2)
  })

  test("--help แสดงคำสั่งหลัก", async () => {
    const { code, stdout } = await kairn(["--help"])
    expect(code).toBe(0)
    expect(stdout).toContain("kairn render")
    expect(stdout).toContain("kairn check")
  })
})
