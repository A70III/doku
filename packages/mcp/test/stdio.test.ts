/**
 * S11 DoD (stdio) — spawn `bun run packages/mcp/src/index.ts` จริงบน temp vault (คัดลอก
 * examples/vault) แล้วขับ JSON-RPC ครบทั้ง session ตาม ticket:
 *
 *   initialize → notifications/initialized → tools/list (12 ตัวเป๊ะ รวม doc_search) → folder_create →
 *   doc_write → file จริงบน disk → doc_delete → ย้ายเข้า .trash/ (ไม่ถูก purge) →
 *   doc_read / doc_render / doc_validate smoke → shutdown → exit 0
 *
 * ทุกบรรทัดที่อ่านจาก stdout ต้อง JSON parse ได้ (protocol-pure — log ห้ามปน stdout)
 */

import { describe, expect, test } from "bun:test"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const REPO = resolve(import.meta.dir, "../../..")
const ENTRY = resolve(import.meta.dir, "../src/index.ts")
const EXAMPLE_VAULT = join(REPO, "examples/vault")

const EXPECTED_TOOL_NAMES = [
  "doc_list",
  "doc_read",
  "doc_write",
  "doc_move",
  "doc_delete",
  "folder_create",
  "folder_list",
  "doc_search",
  "doc_render",
  "doc_validate",
  "asset_put",
  "template_get",
]

/** อ่าน 1 บรรทัดจาก stdout — timeout = reject (ไม่ค้างบั๊ก test ไว้) */
class LineReader {
  #reader: ReadableStreamDefaultReader<Uint8Array>
  #buffer = ""
  #decoder = new TextDecoder()

  constructor(stream: ReadableStream<Uint8Array>) {
    this.#reader = stream.getReader()
  }

  async read(timeoutMs = 20_000): Promise<string> {
    const newline = this.#buffer.indexOf("\n")
    if (newline !== -1) {
      const line = this.#buffer.slice(0, newline)
      this.#buffer = this.#buffer.slice(newline + 1)
      return line
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        this.#reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            void this.#reader.cancel()
            reject(new Error(`หมดเวลาคอยคำตอบจาก mcp (${timeoutMs}ms)`))
          }, timeoutMs)
        }),
      ])
      if (result.done) throw new Error("ปิด stdout ก่อนได้คำตอบครบ")
      this.#buffer += this.#decoder.decode(result.value, { stream: true })
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
    return this.read(timeoutMs)
  }
}

interface RpcMessage {
  jsonrpc: string
  id?: number | null
  result?: Record<string, unknown> & {
    content?: { type: string; text: string }[]
    isError?: boolean
    tools?: { name: string }[]
    protocolVersion?: string
    capabilities?: Record<string, unknown>
    serverInfo?: { name: string; version: string }
  }
  error?: { code: number; message: string }
}

describe("stdio session จริง (spawn process + DOKU_VAULT temp)", () => {
  test("ครบตาม DoD: initialize → tools/list 12 ตัว → write/search-able → soft-delete → shutdown", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "doku-mcp-"))
    const vault = join(tmp, "vault")
    const varDir = join(tmp, "var")
    cpSync(EXAMPLE_VAULT, vault, { recursive: true })

    const child = Bun.spawn(["bun", "run", ENTRY], {
      cwd: REPO,
      env: { ...process.env, DOKU_VAULT: vault, DOKU_VAR: varDir },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    })
    const reader = new LineReader(child.stdout)
    let id = 0

    const send = (message: Record<string, unknown>): void => {
      child.stdin.write(`${JSON.stringify(message)}\n`)
      child.stdin.flush()
    }
    const request = async (method: string, params?: unknown): Promise<RpcMessage> => {
      id += 1
      send({ jsonrpc: "2.0", id, ...(params === undefined ? {} : { params }), method })
      return JSON.parse(await reader.read()) as RpcMessage // ทุกบรรทัดต้องเป็น JSON — purity check
    }
    const toolCall = async (name: string, args: unknown): Promise<Record<string, unknown>> => {
      const reply = await request("tools/call", { name, arguments: args })
      expect(reply.error).toBeUndefined()
      const text = reply.result?.content?.[0]?.text ?? "{}"
      return JSON.parse(text) as Record<string, unknown>
    }

    try {
      // 1) initialize — echo protocolVersion ของ client
      const init = await request("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "dod", version: "0" },
      })
      expect(init.jsonrpc).toBe("2.0")
      expect(init.result?.protocolVersion).toBe("2025-06-18")
      expect(init.result?.capabilities).toEqual({ tools: {} })
      expect(init.result?.serverInfo).toEqual({ name: "doku", version: "0.0.0" })

      // 2) notification — ต้องไม่มีคำตอบ (ถ้าตอบ จะไปชนกับคำตอบของ ping)
      id += 1
      send({ jsonrpc: "2.0", method: "notifications/initialized" })
      const ping = await request("ping")
      expect(ping.result).toEqual({})

      // 3) tools/list = 12 ตัวเป๊ะ (รวม doc_search — M5 S3)
      const list = await request("tools/list")
      const names = (list.result?.tools ?? []).map((tool) => tool.name)
      expect(names).toEqual(EXPECTED_TOOL_NAMES)
      expect(names.some((name) => /purge|empty|restore/i.test(name))).toBe(false)

      // 4) folder_create a/b → มีโฟลเดอร์จริงบน disk
      const folder = await toolCall("folder_create", { path: "a/b" })
      expect(folder.ok).toBe(true)
      expect(statSync(join(vault, "a/b")).isDirectory()).toBe(true)

      // 5) doc_write create a/b/n → เนื้อไฟล์ตรงเป๊ะ
      const write = await toolCall("doc_write", {
        path: "a/b/n",
        md: "# Hi",
        mode: "create",
      })
      expect(write.ok).toBe(true)
      expect(readFileSync(join(vault, "a/b/n.md"), "utf8")).toBe("# Hi")

      // 6) doc_read กลับมา
      const read = await toolCall("doc_read", { path: "a/b/n", format: "md" })
      expect(read.md).toBe("# Hi")
      expect(read.etag).toMatch(/^[0-9a-f]{64}$/)

      // 6b) doc_search — เขียน doc ใหม่ (FTS ≥3 อักขระ) แล้วค้นเจอ · miss = 0 (M5 S3)
      const searchWrite = await toolCall("doc_write", {
        path: "a/b/s",
        md: "# Notes\n\npegasus activity log\n",
        mode: "create",
      })
      expect(searchWrite.ok).toBe(true)
      const found = await toolCall("doc_search", { q: "pegasus activity" })
      expect(found.ok).toBe(true)
      expect(found.count).toBe(1)
      expect((found.hits as { path: string }[])[0]?.path).toBe("a/b/s")
      const miss = await toolCall("doc_search", { q: "zzz-not-here" })
      expect(miss.count).toBe(0)

      // 7) doc_delete = soft-delete → ไฟล์หายจากที่เดิม + ไปอยู่ใต้ .trash/
      const deleted = await toolCall("doc_delete", { path: "a/b/n" })
      expect(deleted.ok).toBe(true)
      expect(existsSync(join(vault, "a/b/n.md"))).toBe(false)
      const trashRoot = join(vault, ".trash")
      expect(existsSync(trashRoot)).toBe(true)
      const trashed: string[] = []
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name)
          if (entry.isDirectory()) walk(full)
          else if (full.endsWith("a/b/n.md")) trashed.push(full)
        }
      }
      walk(trashRoot)
      expect(trashed).toHaveLength(1)
      expect(readFileSync(trashed[0] as string, "utf8")).toBe("# Hi")

      // 8) doc_render + doc_validate smoke
      const rendered = await toolCall("doc_render", { md: "# Hi\n\n:::note\nx\n:::\n" })
      expect(String(rendered.html)).toContain("<h1")
      expect(String(rendered.html)).toContain('data-block="callout"')
      const validated = await toolCall("doc_validate", { path: "projects/doku/design" })
      expect(validated.ok).toBe(true)
      expect(validated.errors).toEqual([])

      // 9) shutdown → client ปิด stdin → process จบด้วย exit 0
      const shutdown = await request("shutdown")
      expect(shutdown.result).toEqual({})

      child.stdin.flush()
      child.stdin.end()
      const exit = await child.exited
      expect(exit).toBe(0)

      const stderr = await new Response(child.stderr).text()
      expect(stderr).toContain("doku mcp: stdio พร้อม")
      expect(stderr).not.toContain("internal")
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill()
      rmSync(tmp, { recursive: true, force: true })
    }
    expect(existsSync(tmp)).toBe(false) // cleanup จริง
  }, 90_000)
})
