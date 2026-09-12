import { describe, expect, test } from "bun:test"
// ใช้ node:child_process แทน Bun.spawn เฉพาะไฟล์นี้ — เป็น workaround ของบั๊ก Bun 1.4.x
// ที่อ่าน stdout ขนาดใหญ่ (~400KB จาก KaTeX CSS ที่ฝัง) จาก subprocess แล้ว truncate เป็นครั้งคราว
// วัดผล: Bun.spawn 1/40 · Bun.readableStreamToText 4/40 · Bun.spawnSync 4/25 · node spawnSync 0/25
// (subprocess ที่เขียนลงไฟล์เองก็ 0/25 — แปลว่า CLI ฝั่งเขียนถูก ตัวจับ pipe ของ Bun เป็นตัวปัญหา)
import { spawnSync } from "node:child_process"
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
  testCli("render เอกสารจาก vault → HTML หน้าเดียวจบ", async () => {
    const { code, stdout, stderr } = await doku([
      "render",
      "--vault",
      VAULT,
      "projects/doku/design",
    ])
    expect(code).toBe(0)
    expect(stdout).toContain("<!doctype html>")
    expect(stdout).toContain("doku-prose")
    expect(stdout).toContain("Doku Design")
    expect(stdout).toContain('data-accent style="--doc-accent: #7c3aed"')
    // M2: block ถูก render จริง — ต้องเห็น markup ของ design system (ไม่ใช่ code block เตือน)
    expect(stdout).toContain('data-block="callout"')
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

  testCli("โจทย์ M0: code สี + สมการ ครบในหน้าเดียว", async () => {
    const md = "# Demo\n\n$$E = mc^2$$\n\n```ts\nconst x = 1\n```\n"
    const { code, stdout } = await doku(["render", "--stdin"], md)
    expect(code).toBe(0)
    expect(stdout).toContain('class="katex"')
    expect(stdout).toContain("data:font/woff2;base64") // KaTeX CSS ฝังฟอนต์ → offline ได้
    expect(stdout).toContain("--shiki-dark")
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
