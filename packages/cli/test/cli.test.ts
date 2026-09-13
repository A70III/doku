import { describe, expect, test } from "bun:test"
// ใช้ node:child_process แทน Bun.spawn เฉพาะไฟล์นี้ — เป็น workaround ของบั๊ก Bun 1.4.x
// ที่อ่าน stdout ขนาดใหญ่ (~400KB จาก KaTeX CSS ที่ฝัง) จาก subprocess แล้ว truncate เป็นครั้งคราว
// วัดผล: Bun.spawn 1/40 · Bun.readableStreamToText 4/40 · Bun.spawnSync 4/25 · node spawnSync 0/25
// (subprocess ที่เขียนลงไฟล์เองก็ 0/25 — แปลว่า CLI ฝั่งเขียนถูก ตัวจับ pipe ของ Bun เป็นตัวปัญหา)
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createNodeRevisionStore } from "@doku/fs-node"
import { parseArgs } from "../src/index.ts"

const CLI = resolve(import.meta.dir, "../src/index.ts")
const REPO = resolve(import.meta.dir, "../../..")
const VAULT = `${REPO}/examples/vault`

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

function doku(args: string[], stdin?: string): RunResult {
  const result = spawnSync("bun", ["run", CLI, ...args], {
    input: stdin ?? "",
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
}

/** CLI test spawns a subprocess (~2.5s each) — default 5s timeout ทำให้ flaky เมื่อรันทั้ง suite พร้อมกัน */
function testCli(name: string, fn: () => Promise<void> | void): void {
  test(name, fn, 20_000)
}

describe("parseArgs", () => {
  testCli("แยก command / positional / flag พร้อมค่า", () => {
    const args = parseArgs(["render", "a/b", "--vault", "v", "--json", "--out=x.html"])
    expect(args.command).toBe("render")
    expect(args.positional).toEqual(["a/b"])
    expect(args.flags.get("vault")).toBe("v")
    expect(args.flags.get("json")).toBe(true)
    expect(args.flags.get("out")).toBe("x.html")
  })

  testCli("flag ที่ต้องมีค่าแต่ไม่มี → error", () => {
    expect(() => parseArgs(["render", "--vault"])).toThrow("ต้องมีค่า")
  })
})

describe("doku render (M0 definition of done)", () => {
  testCli("render เอกสารจาก vault → HTML หน้าเดียวจบ", () => {
    // เหตุผลเดียวกับ test ถัดไป: full page > 400KB (KaTeX CSS) → อ่านผ่าน pipe ไม่เสถียร
    const dir = mkdtempSync(join(tmpdir(), "doku-page-"))
    const out = join(dir, "out.html")
    const { code, stderr } = doku([
      "render",
      "--vault",
      VAULT,
      "projects/doku/design",
      "--out",
      out,
    ])
    expect(code).toBe(0)
    const html = readFileSync(out, "utf8")
    expect(html).toContain("<!doctype html>")
    expect(html).toContain("doku-prose")
    expect(html).toContain("Doku Design")
    expect(html).toContain('data-accent style="--doc-accent: #7c3aed"')
    // M2: block ถูก render จริง — ต้องเห็น markup ของ design system (ไม่ใช่ code block เตือน)
    expect(html).toContain('data-block="callout"')
    expect(stderr).not.toContain("block_unimplemented")
  })

  testCli("--fragment ได้เฉพาะ HTML fragment", async () => {
    const { code, stdout } = await doku([
      "render",
      "--vault",
      VAULT,
      "projects/doku/design",
      "--fragment",
    ])
    expect(code).toBe(0)
    expect(stdout).not.toContain("<!doctype html>")
    expect(stdout).toContain("<h1")
  })

  testCli("--stdin + --fragment ใช้ได้แบบ stateless", async () => {
    const { code, stdout } = await doku(["render", "--stdin", "--fragment"], "# หัว\n\nเนื้อหา\n")
    expect(code).toBe(0)
    expect(stdout).toContain('id="หัว"')
    expect(stdout).toContain("<p>เนื้อหา</p>")
  })

  testCli("โจทย์ M0: code สี + สมการ ครบในหน้าเดียว", () => {
    const md = "# Demo\n\n$$E = mc^2$$\n\n```ts\nconst x = 1\n```\n"
    // อ่านจาก "ไฟล์" ไม่ใช่ pipe: full page มี KaTeX CSS ~440KB และ Bun ยัง truncate stdout
    // จาก subprocess เป็นครั้งคราว (วัดได้ 1/6 — ตัดที่ ~400KB ทำให้ body หายทั้งท่อน)
    // subprocess ที่เขียนลงไฟล์เองไม่พลาด → ใช้ --out แล้วอ่านไฟล์
    const dir = mkdtempSync(join(tmpdir(), "doku-m0-"))
    const out = join(dir, "out.html")
    const { code } = doku(["render", "--stdin", "--out", out], md)
    expect(code).toBe(0)
    const html = readFileSync(out, "utf8")
    expect(html.length).toBeGreaterThan(400_000) // กัน truncation กลับมาแบบเงียบ ๆ
    expect(html).toContain('class="katex"')
    expect(html).toContain("data:font/woff2;base64") // KaTeX CSS ฝังฟอนต์ → offline ได้
    expect(html).toContain("--shiki-dark")
  })

  testCli("--json ให้ agent parse ได้", async () => {
    const { code, stdout } = await doku(["render", "--stdin", "--fragment", "--json"], "# x\n")
    expect(code).toBe(0)
    const payload = JSON.parse(stdout) as { ok: boolean; content: string }
    expect(payload.ok).toBe(true)
    expect(payload.content).toContain("<h1")
  })

  testCli("เอกสารที่ไม่มี → exit 1 พร้อมข้อความอ่านรู้เรื่อง", async () => {
    const { code, stderr } = await doku(["render", "--vault", VAULT, "projects/nope"])
    expect(code).toBe(1)
    expect(stderr).toContain("ไม่พบเอกสาร")
  })

  testCli("path traversal ถูกปฏิเสธ", async () => {
    const { code } = await doku(["render", "--vault", VAULT, "../../../etc/passwd"])
    expect(code).toBe(1)
  })

  testCli("vault ที่ไม่มี → exit 2 + บอกวิธีใช้", async () => {
    const { code, stderr } = await doku(["render", "--vault", "/tmp/definitely-no-vault", "x"])
    expect(code).toBe(2)
    expect(stderr).toContain("--vault")
  })
})

describe("doku check", () => {
  testCli("vault ตัวอย่างผ่าน (exit 0) — ทุก block implement แล้ว", async () => {
    const { code, stdout } = await doku(["check", "--vault", VAULT])
    expect(code).toBe(0)
    expect(stdout).toContain("3 docs")
    expect(stdout).toContain("0 errors")
  })

  testCli("--json คืน report ที่ agent ใช้ต่อได้", async () => {
    const { code, stdout } = await doku(["check", "--vault", VAULT, "--json"])
    expect(code).toBe(0)
    const report = JSON.parse(stdout) as {
      ok: boolean
      stats: { docs: number }
      docs: { id: string }[]
    }
    expect(report.ok).toBe(true)
    expect(report.stats.docs).toBe(3)
    expect(report.docs.map((doc) => doc.id)).toContain("projects/doku/design")
  })

  testCli("ตรวจเฉพาะเอกสารเดียวได้", async () => {
    const { code, stdout } = await doku(["check", "--vault", VAULT, "daily/2025-09-12"])
    expect(code).toBe(0)
    expect(stdout).toContain("1 docs")
  })

  testCli("คำสั่งที่ไม่รู้จัก → exit 2", async () => {
    const { code } = await doku(["cook", "dinner"])
    expect(code).toBe(2)
  })

  testCli("--help แสดงคำสั่งหลัก", async () => {
    const { code, stdout } = await doku(["--help"])
    expect(code).toBe(0)
    expect(stdout).toContain("doku render")
    expect(stdout).toContain("doku check")
  })
})

describe("doku restore (revision)", () => {
  function makeVault(): { vault: string; varDir: string } {
    const root = mkdtempSync(join(tmpdir(), "doku-restore-"))
    const vault = join(root, "vault")
    const varDir = join(root, "var")
    mkdirSync(vault, { recursive: true })
    return { vault, varDir }
  }

  testCli("กู้ md จาก revision ล่าสุด + เก็บสถานะปัจจุบันก่อนทับ", async () => {
    const { vault, varDir } = makeVault()
    writeFileSync(join(vault, "a.md"), "# v0\n")
    const revisions = await createNodeRevisionStore(varDir)
    await revisions.save("a", { md: "# v0\n", meta: null }, new Date("2025-09-12T10:00:00Z"))
    writeFileSync(join(vault, "a.md"), "# v1\n")

    const before = doku(["restore", "--vault", vault, "--var", varDir, "a", "--list"])
    expect(before.code).toBe(0)
    expect(before.stdout).toContain("20250912T100000000Z")

    const result = doku(["restore", "--vault", vault, "--var", varDir, "a"])
    expect(result.code).toBe(0)
    expect(readFileSync(join(vault, "a.md"), "utf8")).toBe("# v0\n")

    // สถานะก่อนกู้ถูกเก็บเป็น revision ใหม่ → undo ได้
    const list = await revisions.list("a")
    expect(list.length).toBeGreaterThan(1)
  })

  testCli("ไม่มี revision → exit 1 · ไม่ระบุ path → exit 2", async () => {
    const { vault, varDir } = makeVault()
    writeFileSync(join(vault, "a.md"), "# x\n")
    expect(doku(["restore", "--vault", vault, "--var", varDir, "a"]).code).toBe(1)
    expect(doku(["restore", "--vault", vault, "--var", varDir]).code).toBe(2)
  })

  testCli("--json ให้ agent parse ได้", async () => {
    const { vault, varDir } = makeVault()
    writeFileSync(join(vault, "a.md"), "# new\n")
    const revisions = await createNodeRevisionStore(varDir)
    await revisions.save("a", { md: "# old\n", meta: null }, new Date("2025-09-12T10:00:00Z"))
    const result = doku(["restore", "--vault", vault, "--var", varDir, "a", "--json"])
    expect(result.code).toBe(0)
    const parsed = JSON.parse(result.stdout) as { ok: boolean; ts: string; path: string }
    expect(parsed.ok).toBe(true)
    expect(parsed.path).toBe("a")
    expect(parsed.ts).toBe("20250912T100000000Z")
  })
})
