/**
 * M5 S3 — `doku search <q>` (FTS trigram จาก var/index.db — ไม่พึ่ง server)
 *
 * พิสูจน์: sync+ค้นเองตอนรัน (index สร้างใหม่จาก vault) · `--json` envelope ·
 * หลายคำ = AND · substring ไทยกลางประโยค · `--tag`/`--limit` · miss = count 0 exit 0 ·
 * ไม่มีคำค้น = exit 2 flat `{ok:false,code:"usage"}`
 */

import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
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

/** subprocess ต่อครั้ง — กัน flaky ด้วย timeout (แบบ cli-m4.test.ts) */
function testCli(name: string, fn: () => Promise<void> | void): void {
  test(name, fn, 30_000)
}

interface SearchHit {
  path: string
  title: string
  tags: string[]
  snippet: string
}

function makeVault(): { vault: string; varDir: string } {
  const root = mkdtempSync(join(tmpdir(), "doku-search-cli-"))
  const vault = join(root, "vault")
  mkdirSync(join(vault, "projects"), { recursive: true })
  writeFileSync(
    join(vault, "projects/design.md"),
    "# คู่มือออกแบบ\n\nเนื้อหาเรื่อง phaserunner cache และ sharedtoken ด้วย\n",
  )
  writeFileSync(
    join(vault, "projects/design.meta.json"),
    `${JSON.stringify({ title: "Doku Design", tags: ["design"] })}\n`,
  )
  writeFileSync(join(vault, "notes.md"), "# บันทึก\n\nวันนี้กินอะไรดี sharedtoken อยู่ทุกที่\n")
  return { vault, varDir: join(root, "var") }
}

describe("doku search (M5 S3)", () => {
  testCli("--json = envelope {ok:true,…} · สร้าง index เองไม่ต้องมี server · exit 0", () => {
    const { vault, varDir } = makeVault()
    const result = doku(["search", "phaserunner", "--vault", vault, "--var", varDir, "--json"])
    expect(result.code).toBe(0)
    const payload = JSON.parse(result.stdout) as {
      ok: boolean
      query: string
      count: number
      hits: SearchHit[]
    }
    expect(payload.ok).toBe(true)
    expect(payload.query).toBe("phaserunner")
    expect(payload.count).toBe(1)
    expect(payload.hits[0]?.path).toBe("projects/design")
    expect(payload.hits[0]?.title).toBe("Doku Design")
    expect(payload.hits[0]?.tags).toEqual(["design"])
    expect(payload.hits[0]?.snippet).toContain("[phaserunner]")
    // index อยู่ที่ --var (server ไม่ได้เปิด — CLI sync เอง)
    expect(existsSync(join(varDir, "index.db"))).toBe(true)
  })

  testCli("หลายคำ = AND · ไทยกลางประโยค · --tag/--limit · miss = count 0 exit 0", () => {
    const { vault, varDir } = makeVault()

    const multi = JSON.parse(
      doku(["search", "phaserunner", "cache", "--vault", vault, "--var", varDir, "--json"]).stdout,
    ) as { count: number }
    expect(multi.count).toBe(1)

    const thai = JSON.parse(
      doku(["search", "กินอะไร", "--vault", vault, "--var", varDir, "--json"]).stdout,
    ) as { count: number; hits: SearchHit[] }
    expect(thai.count).toBe(1)
    expect(thai.hits[0]?.path).toBe("notes")

    const shared = JSON.parse(
      doku(["search", "sharedtoken", "--vault", vault, "--var", varDir, "--json"]).stdout,
    ) as { count: number }
    expect(shared.count).toBe(2)

    const tagged = JSON.parse(
      doku([
        "search",
        "sharedtoken",
        "--tag",
        "design",
        "--vault",
        vault,
        "--var",
        varDir,
        "--json",
      ]).stdout,
    ) as { count: number; hits: SearchHit[] }
    expect(tagged.count).toBe(1)
    expect(tagged.hits[0]?.path).toBe("projects/design")

    const limited = JSON.parse(
      doku(["search", "sharedtoken", "--limit", "1", "--vault", vault, "--var", varDir, "--json"])
        .stdout,
    ) as { count: number }
    expect(limited.count).toBe(1)

    const miss = doku(["search", "zzz-not-here", "--vault", vault, "--var", varDir, "--json"])
    expect(miss.code).toBe(0)
    expect((JSON.parse(miss.stdout) as { ok: boolean; count: number }).ok).toBe(true)
    expect((JSON.parse(miss.stdout) as { count: number }).count).toBe(0)
  })

  testCli("ไม่มีคำค้น → exit 2 flat usage · --limit ไม่ดี → usage · human mode คืนบรรทัด tab", () => {
    const { vault, varDir } = makeVault()

    const noQuery = doku(["search", "--vault", vault, "--var", varDir, "--json"])
    expect(noQuery.code).toBe(2)
    expect(JSON.parse(noQuery.stdout)).toEqual({
      ok: false,
      code: "usage",
      error: expect.stringContaining("doku search") as unknown as string,
    })

    const badLimit = doku([
      "search",
      "sharedtoken",
      "--limit",
      "abc",
      "--vault",
      vault,
      "--var",
      varDir,
      "--json",
    ])
    expect(badLimit.code).toBe(2)
    expect((JSON.parse(badLimit.stdout) as { code: string }).code).toBe("usage")

    const human = doku(["search", "phaserunner", "--vault", vault, "--var", varDir])
    expect(human.code).toBe(0)
    const lines = human.stdout.trim().split("\n")
    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("projects/design")
    expect(lines[0]).toContain("Doku Design")
  })
})
