/**
 * S3 (M4) — `doku audit`: อ่าน `var/audit.log` อย่างเดียว + `--json`/`--path`/`--limit`
 *
 * พิสูจน์ด้วย: envelope `{ok:true,…}` · filter เฉพาะ path · limit เอาท้ายสุด · exit 0 ทุกกรณีอ่าน
 * และ **ไฟล์ bytes เดิมเป๊ะหลังรัน** (ไม่มี flag/branch ที่ตัดหรือล้าง log ได้)
 */

import { describe, expect, test } from "bun:test"
// node:child_process แทน Bun.spawn — เหตุผลเดียวกับ cli-m4.test.ts (บั๊ก Bun 1.4.x อ่าน stdout จาก subprocess แล้ว truncate บางครั้ง)
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
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

/** subprocess ~2.5s ต่อครั้ง — ขยาย timeout กัน flaky (ดู cli-m4.test.ts) */
function testCli(name: string, fn: () => Promise<void> | void): void {
  test(name, fn, 30_000)
}

interface AuditEntry {
  ts: string
  actor: string
  action: string
  path: string
  etag?: string
  ip?: string
  to?: string
}

const ENTRIES: AuditEntry[] = [
  {
    ts: "2026-09-24T10:00:00.000Z",
    actor: "hermes-agent",
    action: "doc.create",
    path: "projects/doku/design",
  },
  {
    ts: "2026-09-24T10:01:00.000Z",
    actor: "web",
    action: "doc.update",
    path: "projects/doku/design",
    etag: "abc123",
  },
  {
    ts: "2026-09-24T10:02:00.000Z",
    actor: "web",
    action: "folder.create",
    path: "notes",
  },
]

function makeVar(entries: AuditEntry[] = ENTRIES): { varDir: string; file: string } {
  const varDir = mkdtempSync(join(tmpdir(), "doku-audit-cli-"))
  const file = join(varDir, "audit.log")
  writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`)
  return { varDir, file }
}

describe("doku audit — READ-ONLY อ่าน JSONL (docs/06)", () => {
  testCli("--json = envelope {ok:true,…} ทุก entry · exit 0", () => {
    const { varDir, file } = makeVar()
    const result = doku(["audit", "--json", "--var", varDir])
    expect(result.code).toBe(0)
    const payload = JSON.parse(result.stdout) as {
      ok: boolean
      file: string
      count: number
      entries: AuditEntry[]
    }
    expect(payload.ok).toBe(true)
    expect(payload.file).toBe(file)
    expect(payload.count).toBe(3)
    expect(payload.entries.map((entry) => entry.action)).toEqual([
      "doc.create",
      "doc.update",
      "folder.create",
    ])
    expect(payload.entries[0]).toHaveProperty("ts")
    expect(payload.entries[0]).toHaveProperty("actor")
    expect(payload.entries[0]).toHaveProperty("path")
  })

  testCli("--path <p> = คืนเฉพาะ entry ของ path นั้น · exit 0", () => {
    const { varDir } = makeVar()
    const result = doku(["audit", "--json", "--path", "projects/doku/design", "--var", varDir])
    expect(result.code).toBe(0)
    const payload = JSON.parse(result.stdout) as { ok: boolean; count: number; path: string }
    expect(payload.ok).toBe(true)
    expect(payload.path).toBe("projects/doku/design")
    expect(payload.count).toBe(2)
    const entries = (JSON.parse(result.stdout) as { entries: AuditEntry[] }).entries
    expect(entries.every((entry) => entry.path === "projects/doku/design")).toBe(true)
    expect(entries.map((entry) => entry.action)).toEqual(["doc.create", "doc.update"])

    // path ที่ไม่มี entry → ok:true count:0 (ยัง exit 0 — ไม่ใช่ error)
    const miss = doku(["audit", "--json", "--path", "nope", "--var", varDir])
    expect(miss.code).toBe(0)
    expect((JSON.parse(miss.stdout) as { ok: boolean; count: number }).ok).toBe(true)
    expect((JSON.parse(miss.stdout) as { count: number }).count).toBe(0)
  })

  testCli("--limit <n> = เอา n รายการหลังสุด (เรียงเก่า→ใหม่ตามไฟล์)", () => {
    const { varDir } = makeVar()
    const payload = JSON.parse(
      doku(["audit", "--json", "--limit", "1", "--var", varDir]).stdout,
    ) as {
      ok: boolean
      count: number
      entries: AuditEntry[]
    }
    expect(payload.ok).toBe(true)
    expect(payload.count).toBe(1)
    expect(payload.entries[0]?.action).toBe("folder.create")

    // --limit ไม่ใช่จำนวนเต็มบวก → error shape เดียวกับคำสั่งอื่น (exit 2 + flat envelope)
    const bad = doku(["audit", "--json", "--limit", "abc", "--var", varDir])
    expect(bad.code).toBe(2)
    expect(JSON.parse(bad.stdout)).toEqual({
      ok: false,
      code: "usage",
      error: expect.stringContaining("--limit") as unknown as string,
    })
  })

  testCli("ไม่มีไฟล์ (ยังไม่มี write เลย) → ok:true count:0 · exit 0", () => {
    const varDir = mkdtempSync(join(tmpdir(), "doku-audit-empty-"))
    expect(existsSync(join(varDir, "audit.log"))).toBe(false)
    const result = doku(["audit", "--json", "--var", varDir])
    expect(result.code).toBe(0)
    const payload = JSON.parse(result.stdout) as { ok: boolean; count: number; entries: unknown[] }
    expect(payload.ok).toBe(true)
    expect(payload.count).toBe(0)
    expect(payload.entries).toEqual([])
    // อ่านอย่างเดียวจริง — ไม่สร้างไฟล์ log ตอนอ่าน
    expect(existsSync(join(varDir, "audit.log"))).toBe(false)
  })

  testCli("โหมดคน (ไม่มี --json) → พิมพ์รายการ · exit 0", () => {
    const { varDir } = makeVar()
    const result = doku(["audit", "--var", varDir])
    expect(result.code).toBe(0)
    expect(result.stdout).toContain("doc.create")
    expect(result.stdout).toContain("projects/doku/design")
    expect(result.stdout).toContain("actor=hermes-agent")
    expect(result.stdout.trim().split("\n")).toHaveLength(3)
  })

  testCli("ไม่มีทาง truncate/ล้าง log — ทุก flag ที่โยนเข้ามา ไฟล์ bytes เดิมเป๊ะ", () => {
    const { varDir, file } = makeVar()
    const before = readFileSync(file, "utf8")

    // --purge/--clear/--truncate ไม่มีในคำนี้ = แค่ flag ที่ไม่มีผล + อ่านออกเท่าเดิม
    for (const extra of [["--purge"], ["--clear"], ["--truncate"], []]) {
      const result = doku([
        "audit",
        "--json",
        "--path",
        "notes",
        "--limit",
        "1",
        ...extra,
        "--var",
        varDir,
      ])
      expect(result.code).toBe(0)
      expect(readFileSync(file, "utf8")).toBe(before)
    }

    // ไม่มี subcommand ล้าง log อยู่ใน CLI เลย
    for (const command of ["purge", "audit-clear", "audit-truncate"]) {
      const result = doku([command, "--json"])
      expect(result.code).toBe(2)
      expect((JSON.parse(result.stdout) as { code: string }).code).toBe("unknown_command")
    }
  })

  test("source ของคำสั่ง audit — แตะ audit.log ด้วยการอ่านอย่างเดียว", () => {
    const source = readFileSync(CLI, "utf8")
    const touching = source.split("\n").filter((line) => line.includes("audit.log"))
    expect(touching.length).toBeGreaterThan(0)
    for (const line of touching) {
      // ไม่มี call เขียน/ตัดไฟล์บน path ของ audit.log (comment ที่มีคำว่า truncate ก็ไม่เป็นไร — จับแบบมี `(` เท่านั้น)
      expect(line).not.toMatch(
        /(Bun\.write|writeFileSync|appendFileSync|truncate|unlink|rmSync)\s*\(/,
      )
    }
    // มีแค่ case "audit" เดียว ที่ dispatch ไป commandAudit
    expect(source.match(/case "audit":/g)).toHaveLength(1)
    expect(source.match(/async function commandAudit\(/g)).toHaveLength(1)
  })
})
