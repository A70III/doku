/**
 * `@doku/mcp` — stdio MCP server สำหรับ Hermes (docs/05 §4 · plan §5 M4)
 *
 * รันตรง: `bun run packages/mcp/src/index.ts` · หรือผ่าน `doku mcp` (CLI spawn เป็น subprocess
 * ตาม decision 25 — ห้าม cli import mcp ตรง ๆ · plan §4 #3)
 *
 * env: `DOKU_VAULT` (default `vault`) · `DOKU_VAR` (default `var` — ที่เก็บ revision)
 *
 * stdio contract: newline-delimited JSON-RPC 2.0 — **stdout มีเฉพาะ JSON-RPC เท่านั้น**
 * log ทุกอย่างลง stderr · process จบเองเมื่อ client ปิด stdin (หลัง `shutdown`)
 */

import { createMcpServer } from "./server.ts"
import { type OpenedMcpVault, openMcpVault } from "./vault.ts"

export type { McpServer } from "./server.ts"
export { createMcpServer, MCP_PROTOCOL_VERSION, SERVER_INFO } from "./server.ts"
export type { ToolDefinition, ToolSpec } from "./tools.ts"
export { callTool, hasTool, TOOL_SPECS, toolDefinitions } from "./tools.ts"
export type { McpDeps, OpenedMcpVault } from "./vault.ts"
export { openMcpVault, ToolError } from "./vault.ts"

async function main(): Promise<number> {
  let deps: OpenedMcpVault
  try {
    deps = await openMcpVault()
  } catch (error) {
    process.stderr.write(
      `เปิด vault ไม่ได้: ${error instanceof Error ? error.message : String(error)}\n` +
        `ตั้ง DOKU_VAULT=<dir> ชี้ไปยัง vault ที่มีอยู่ (เช่น DOKU_VAULT=examples/vault)\n`,
    )
    return 1
  }

  const server = createMcpServer(deps)
  process.stderr.write(`doku mcp: stdio พร้อม — vault ${deps.root}\n`)

  const decoder = new TextDecoder()
  let buffer = ""

  const drain = async (): Promise<void> => {
    let newline = buffer.indexOf("\n")
    while (newline !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      const reply = await server.handleLine(line)
      if (reply !== null) process.stdout.write(`${reply}\n`)
      newline = buffer.indexOf("\n")
    }
  }

  // chunk เป็น string หรือ bytes ขึ้นกับ runtime — รองรับทั้งคู่
  for await (const chunk of process.stdin) {
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true })
    await drain()
  }
  // EOF ครึ่งบรรทัดสุดท้าย (ไม่มี newline)
  if (buffer.length > 0) {
    const reply = await server.handleLine(buffer)
    if (reply !== null) process.stdout.write(`${reply}\n`)
  }
  return 0
}

if (import.meta.main) {
  const code = await main()
  // สำเร็จ = จบเองหลัง stdin EOF (ให้ stdout flush ก่อน) · ล้มเหลว = exit ทันที (ยังไม่มีอะไรเขียน stdout)
  if (code !== 0) process.exit(code)
}
