/**
 * M5 S5 — `doku build --out <dir>` (export vault → HTML อ่าน offline · docs/01 §Static export)
 *
 * พิสูจน์: render ครบทุก doc · URL ภายในเป็น relative ทั้งหมด (ไม่มี `href="/d/` · `/assets/`) ·
 * asset ถูกคัดลอกตาม path เดิม · `index.html` มีรายการ · `--json` envelope ·
 * ไม่มี `--out` = exit 2 usage · รันซ้ำได้ (เขียนทับ ไม่ลบของเดิม)
 */

import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const CLI = resolve(import.meta.dir, "../src/index.ts")

interface RunResult {
  code: number
  stdout: string
  stderr: string
}

function doku(args: string[]): RunResult {
  const result = spawnSync("bun", ["run", CLI, ...args], { encoding: "utf8" })
  return { code: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
}

function testCli(name: string, fn: () => Promise<void> | void): void {
  test(name, fn, 30_000)
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

function makeVault(): { vault: string; out: string } {
  const root = mkdtempSync(join(tmpdir(), "doku-build-"))
  const vault = join(root, "vault")
  mkdirSync(join(vault, "projects", "assets"), { recursive: true })
  writeFileSync(join(vault, "notes.md"), "# โน้ต\n\nเป้าของลิงก์ทั้งหมด\n")
  writeFileSync(join(vault, "notes.meta.json"), `${JSON.stringify({ title: "โน้ตฮับ" })}\n`)
  writeFileSync(
    join(vault, "projects", "design.md"),
    "# คู่มือ\n\nดู [โน้ต](../notes.md) และ [[notes]]\n\n![pic](assets/pic.png)\n",
  )
  writeFileSync(join(vault, "projects", "assets", "pic.png"), PNG)
  return { vault, out: join(root, "dist") }
}

describe("doku build --out (M5 S5)", () => {
  testCli("--json = export ครบ · URL ภายในเป็น relative ทั้งหมด · asset คัดลอก · index.html", () => {
    const { vault, out } = makeVault()
    const result = doku(["build", "--out", out, "--vault", vault, "--json"])
    expect(result.code).toBe(0)
    const payload = JSON.parse(result.stdout) as {
      ok: boolean
      out: string
      docs: number
      assets: number
    }
    expect(payload.ok).toBe(true)
    expect(payload.out).toBe(out)
    expect(payload.docs).toBe(2)
    expect(payload.assets).toBe(1)

    // หน้าเอกสาร render ครบ + URL ภายใน = relative (file:// ใช้ path ราก absolute ไม่ได้)
    const page = readFileSync(join(out, "projects", "design.html"), "utf8")
    expect(page).toContain("คู่มือ")
    expect(page).not.toContain('href="/d/')
    expect(page).not.toContain('"/assets/')
    expect(page).toContain('href="../notes.html"') // relative link + wikilink ทั้งคู่
    expect(page).toContain('src="assets/pic.png"') // asset จากหน้า projects/ = ไม่ต้องมี ../

    // asset ถูกคัดลอกตาม path เดิม (เทียบ bytes)
    expect(existsSync(join(out, "projects", "assets", "pic.png"))).toBe(true)
    expect(readFileSync(join(out, "projects", "assets", "pic.png")).equals(PNG)).toBe(true)

    // index.html = รายการเอกสาร (escape แล้ว)
    const index = readFileSync(join(out, "index.html"), "utf8")
    expect(index).toContain("notes.html")
    expect(index).toContain("projects/design.html")
    expect(index).toContain("โน้ตฮับ")

    // หน้า target ก็ export ออกมาด้วย
    expect(readFileSync(join(out, "notes.html"), "utf8")).toContain("โน้ต")

    // รันซ้ำ = เขียนทับได้ (ไม่ลบ ไม่พัง)
    const again = doku(["build", "--out", out, "--vault", vault, "--json"])
    expect(again.code).toBe(0)
    expect((JSON.parse(again.stdout) as { docs: number }).docs).toBe(2)
  })

  testCli("ไม่มี --out → exit 2 flat usage · human mode สรุปจำนวน", () => {
    const { vault, out } = makeVault()
    const missing = doku(["build", "--vault", vault, "--json"])
    expect(missing.code).toBe(2)
    expect(JSON.parse(missing.stdout)).toEqual({
      ok: false,
      code: "usage",
      error: expect.stringContaining("--out") as unknown as string,
    })

    const human = doku(["build", "--out", out, "--vault", vault])
    expect(human.code).toBe(0)
    expect(human.stdout).toContain("export แล้ว")
    expect(human.stdout).toContain("2 เอกสาร · 1 assets")
    expect(existsSync(join(out, "index.html"))).toBe(true)
  })
})
