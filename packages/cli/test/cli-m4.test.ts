import { describe, expect, test } from "bun:test"
// node:child_process แทน Bun.spawn — เหตุผลเดียวกับ cli.test.ts (บั๊ก Bun 1.4.x อ่าน stdout จาก subprocess แล้ว truncate บางครั้ง)
import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs"
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

/** subprocess ~2.5s ต่อครั้ง — ขยาย timeout กัน flaky (ดู cli.test.ts) */
function testCli(name: string, fn: () => Promise<void> | void): void {
  test(name, fn, 30_000)
}

/** vault ชั่วคราว: มี inbound link ([see](target.md) · [[target]]) + doc ที่มี tag design */
function makeVault(): { vault: string; varDir: string } {
  const root = mkdtempSync(join(tmpdir(), "doku-m4-"))
  const vault = join(root, "vault")
  mkdirSync(vault, { recursive: true })
  writeFileSync(join(vault, "target.md"), "# Target\n")
  writeFileSync(join(vault, "notes.md"), "# Notes\n\n[see](target.md) · [[target]]\n")
  writeFileSync(join(vault, "design.md"), "# Design doc\n")
  writeFileSync(
    join(vault, "design.meta.json"),
    `${JSON.stringify({ title: "Design doc", tags: ["design"] }, null, 2)}\n`,
  )
  return { vault, varDir: join(root, "var") }
}

describe("doku new (M4)", () => {
  testCli("สร้างเอกสาร + sidecar title — parse ได้ทั้ง success และ error", () => {
    const { vault } = makeVault()
    const created = doku(["new", "projects/x/y", "--title", "Y", "--vault", vault, "--json"])
    expect(created.code).toBe(0)
    const payload = JSON.parse(created.stdout) as { ok: boolean; path: string; title: string }
    expect(payload.ok).toBe(true)
    expect(payload.path).toBe("projects/x/y")
    expect(payload.title).toBe("Y")
    expect(readFileSync(join(vault, "projects/x/y.md"), "utf8")).toContain("# Y")
    const meta = JSON.parse(readFileSync(join(vault, "projects/x/y.meta.json"), "utf8")) as {
      title: string
    }
    expect(meta.title).toBe("Y")

    const again = doku(["new", "projects/x/y", "--vault", vault, "--json"])
    expect(again.code).not.toBe(0)
    const failure = JSON.parse(again.stdout) as { ok: boolean; code: string }
    expect(failure.ok).toBe(false)
    expect(failure.code).toBe("already_exists")
  })

  testCli("ไม่ระบุ path → exit 2 + JSON code usage", () => {
    const { vault } = makeVault()
    const result = doku(["new", "--vault", vault, "--json"])
    expect(result.code).toBe(2)
    expect((JSON.parse(result.stdout) as { code: string }).code).toBe("usage")
  })
})

describe("doku mkdir (M4)", () => {
  testCli("สร้างโฟลเดอร์ซ้อน + มีอยู่แล้ว = already_exists", () => {
    const { vault } = makeVault()
    const created = doku(["mkdir", "a/b/c", "--vault", vault, "--json"])
    expect(created.code).toBe(0)
    expect((JSON.parse(created.stdout) as { ok: boolean }).ok).toBe(true)
    expect(statSync(join(vault, "a/b/c")).isDirectory()).toBe(true)

    const again = doku(["mkdir", "a/b/c", "--vault", vault, "--json"])
    expect(again.code).not.toBe(0)
    expect((JSON.parse(again.stdout) as { code: string }).code).toBe("already_exists")
  })
})

describe("doku tree --json (M4)", () => {
  testCli("JSON ผ่าน + list path ใหม่ทั้งแบบแบนและ nested", () => {
    const { vault } = makeVault()
    expect(doku(["new", "projects/x/y", "--title", "Y", "--vault", vault]).code).toBe(0)
    expect(doku(["mkdir", "a/b/c", "--vault", vault]).code).toBe(0)

    const result = doku(["tree", "--vault", vault, "--json"])
    expect(result.code).toBe(0)
    const payload = JSON.parse(result.stdout) as {
      ok: boolean
      tree: { type: string; path: string; children?: unknown[] }[]
      docs: string[]
      folders: string[]
      assets: string[]
    }
    expect(payload.ok).toBe(true)
    expect(payload.docs).toContain("projects/x/y")
    expect(payload.docs).toContain("notes")
    expect(payload.folders).toContain("a/b/c")
    expect(Array.isArray(payload.tree)).toBe(true)
    expect(payload.tree.some((node) => node.type === "folder" && node.path === "a")).toBe(true)
  })
})

describe("doku list --tag --json (M4)", () => {
  testCli("กรอง tag ได้ + รูปแบบเดียวกับ GET /api/docs", () => {
    const { vault } = makeVault()
    const result = doku(["list", "--tag", "design", "--vault", vault, "--json"])
    expect(result.code).toBe(0)
    const payload = JSON.parse(result.stdout) as {
      ok: boolean
      tag: string | null
      docs: { id: string; title: string; tags: string[]; status: string }[]
    }
    expect(payload.ok).toBe(true)
    expect(payload.tag).toBe("design")
    expect(payload.docs.map((doc) => doc.id)).toContain("design")
    expect(payload.docs.every((doc) => doc.tags.includes("design"))).toBe(true)
    expect(payload.docs[0]?.id).toBe("design")
    expect(payload.docs[0]?.title).toBe("Design doc")
    expect(payload.docs[0]?.status).toBe("active")
  })

  testCli("list ไม่มี filter → ทุกเอกสาร", () => {
    const { vault } = makeVault()
    const payload = JSON.parse(doku(["list", "--vault", vault, "--json"]).stdout) as {
      docs: { id: string }[]
    }
    expect(payload.docs.map((doc) => doc.id).sort()).toEqual(["design", "notes", "target"])
  })
})

describe("doku mv (M4 · core move engine)", () => {
  testCli("ย้าย + moved_from + inbound link ถูกเขียนใหม่ + เก็บ revision", () => {
    const { vault, varDir } = makeVault()
    const result = doku([
      "mv",
      "target",
      "docs/target",
      "--vault",
      vault,
      "--var",
      varDir,
      "--json",
    ])
    expect(result.code).toBe(0)
    const payload = JSON.parse(result.stdout) as {
      ok: boolean
      kind: string
      from: string
      to: string
      updated_links: number
    }
    expect(payload.ok).toBe(true)
    expect(payload.kind).toBe("doc")
    expect(payload.from).toBe("target")
    expect(payload.to).toBe("docs/target")
    expect(payload.updated_links).toBeGreaterThan(0)

    expect(existsSync(join(vault, "docs/target.md"))).toBe(true)
    expect(existsSync(join(vault, "target.md"))).toBe(false)

    const meta = JSON.parse(readFileSync(join(vault, "docs/target.meta.json"), "utf8")) as {
      relations: { moved_from: string[] }
    }
    expect(meta.relations.moved_from).toContain("target")

    // inbound link ในเอกสารอื่นถูกเขียนใหม่ (relative form — core เขียนเป็น ./docs/…)
    const notes = readFileSync(join(vault, "notes.md"), "utf8")
    expect(notes).toContain("](./docs/target.md)")
    expect(notes).not.toContain("](target.md)")

    // revision-before-overwrite (plan §4 #4) — เก็บสถานะก่อน move จริง
    expect(existsSync(join(varDir, "revisions/target"))).toBe(true)
  })

  testCli("ปลายทางมีอยู่แล้ว → exit ≠ 0 + already_exists ใน --json", () => {
    const { vault, varDir } = makeVault()
    writeFileSync(join(vault, "other.md"), "# Other\n")
    const result = doku(["mv", "target", "other", "--vault", vault, "--var", varDir, "--json"])
    expect(result.code).not.toBe(0)
    const failure = JSON.parse(result.stdout) as { ok: boolean; code: string }
    expect(failure.ok).toBe(false)
    expect(failure.code).toBe("already_exists")
    expect(readFileSync(join(vault, "target.md"), "utf8")).toContain("# Target")
  })

  testCli("ไม่พบต้นทาง → not_found · ย้ายโฟลเดอร์ได้", () => {
    const { vault, varDir } = makeVault()
    const missing = doku(["mv", "nope", "other", "--vault", vault, "--var", varDir, "--json"])
    expect(missing.code).not.toBe(0)
    expect((JSON.parse(missing.stdout) as { code: string }).code).toBe("not_found")

    mkdirSync(join(vault, "projects"), { recursive: true })
    writeFileSync(join(vault, "projects/inner.md"), "# Inner\n")
    const folder = doku(["mv", "projects", "archive/projects", "--vault", vault, "--json"])
    expect(folder.code).toBe(0)
    const payload = JSON.parse(folder.stdout) as { kind: string; to: string }
    expect(payload.kind).toBe("folder")
    expect(payload.to).toBe("archive/projects")
  })
})

describe("error ชั้น dispatch/parse + --json (fix S4 · สัญญา envelope)", () => {
  interface JsonFailure {
    ok: boolean
    code: string
    error: string
  }

  testCli("list --tag (ไม่มีค่า) + --json → stdout เป็น JSON code usage · exit 2", () => {
    const result = doku(["list", "--tag", "--json"])
    expect(result.code).toBe(2)
    const failure = JSON.parse(result.stdout) as JsonFailure
    expect(failure.ok).toBe(false)
    expect(failure.code).toBe("usage")
    expect(failure.error).toContain("--tag")
    // ตรง behavior ของ command-level: มี --json = ไม่ทิ้ง text/usage ลง stderr
    expect(result.stderr).toBe("")
  })

  testCli("คำสั่งที่ไม่รู้จัก + --json → stdout เป็น JSON · exit 2", () => {
    const result = doku(["frobnicate", "--json"])
    expect(result.code).toBe(2)
    const failure = JSON.parse(result.stdout) as JsonFailure
    expect(failure.ok).toBe(false)
    expect(failure.code).toBe("unknown_command")
    expect(failure.error).toContain("frobnicate")
    expect(result.stderr).toBe("")
  })

  testCli("error ทั่วไป (doc ไม่มี) + --json → stdout เป็น JSON · exit 1 · ไม่มี --json = เดิมเป๊ะ", () => {
    const { vault } = makeVault()
    const json = doku(["render", "no/such/doc", "--vault", vault, "--json"])
    expect(json.code).toBe(1)
    const failure = JSON.parse(json.stdout) as JsonFailure
    expect(failure.ok).toBe(false)
    expect(failure.code).toBe("doc_not_found")
    expect(failure.error).toContain("ไม่พบเอกสาร")
    expect(json.stderr).toBe("")

    const plain = doku(["render", "no/such/doc", "--vault", vault])
    expect(plain.code).toBe(1)
    expect(plain.stdout).toBe("")
    expect(plain.stderr).toBe("error: ไม่พบเอกสาร: no/such/doc\n")
  })

  testCli("usage error จากตัวคำสั่ง + --json → JSON · ไม่มี --json = stdout ว่าง", () => {
    const json = doku(["restore", "--json"])
    expect(json.code).toBe(2)
    expect((JSON.parse(json.stdout) as JsonFailure).code).toBe("usage")

    const plain = doku(["restore"])
    expect(plain.code).toBe(2)
    expect(plain.stdout).toBe("")
    expect(plain.stderr).toContain("ต้องระบุ path ของเอกสาร")
  })

  testCli("usage error ไม่มี --json → stdout ว่าง + message/usage บน stderr", () => {
    const result = doku(["list", "--tag"])
    expect(result.code).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("flag --tag ต้องมีค่า")
    expect(result.stderr).toContain("คำสั่ง:")
  })
})

describe("doku mcp dispatch + help (M4)", () => {
  testCli("--help โชว์คำสั่งใหม่ครบทุกตัว", () => {
    const result = doku(["--help"])
    expect(result.code).toBe(0)
    for (const command of [
      "doku new",
      "doku mkdir",
      "doku tree",
      "doku list",
      "doku mv",
      "doku mcp",
    ]) {
      expect(result.stdout).toContain(command)
    }
  })

  testCli("mcp มี dispatch (ไม่ใช่ unknown command) — package ยังไม่มา = not_ready", () => {
    const mcpEntry = resolve(import.meta.dir, "../../mcp/src/index.ts")
    const { vault } = makeVault()
    const result = doku(["mcp", "--vault", vault, "--json"])
    if (existsSync(mcpEntry)) {
      // slice S5 ลง packages/mcp แล้ว — dispatch ต้อง spawn ต่อ (ไม่ใช่ not_ready)
      expect(result.stdout).not.toContain('"code":"not_ready"')
    } else {
      expect(result.code).not.toBe(0)
      expect(result.code).not.toBe(2)
      expect((JSON.parse(result.stdout) as { code: string }).code).toBe("not_ready")
    }
  })
})
