/**
 * JSON-RPC 2.0 subset ของ MCP เหนือ stdio — เขียนเอง (controller ruling: zero new dependency,
 * ไม่เพิ่ม `@modelcontextprotocol/sdk`) · protocol ที่ต้องใช้มีแค่ 3 เมธอดตาม plan §5 M4
 *
 * รองรับ: `initialize` (echo protocolVersion + capabilities.tools + serverInfo) ·
 * `notifications/initialized` (no-op) · `ping` · `shutdown` · `tools/list` · `tools/call`
 *
 * framing: newline-delimited JSON ต่อ 1 บรรทัด — **stdout มีเฉพาะ JSON-RPC เท่านั้น**
 * (protocol-pure) · log ทุกอย่างลง stderr
 *
 * error mapping:
 * - protocol: parse -32700 · invalid request -32600 · method not found -32601 ·
 *   invalid params (รวม unknown tool) -32602 · internal -32603
 * - **tool ทำงานไม่ได้ = ตอบ result ปกติพร้อม `isError: true`** (ให้อ่าน error เป็นข้อความ
 *   `{ok:false, error:{code, message}}` ตาม vocabulary ของ docs/05) — ไม่ใช่ JSON-RPC error
 */

import { callTool, hasTool, toolDefinitions } from "./tools.ts"
import { type McpDeps, toToolError } from "./vault.ts"

/** เวอร์ชัน MCP ที่รู้จัก — client ขอมาอันไหนก็ echo กลับไป (server มีชุดเดียว) */
export const MCP_PROTOCOL_VERSION = "2024-11-05"

export const SERVER_INFO = { name: "doku", version: "0.0.0" } as const

const INSTRUCTIONS =
  "doku document hub — path = id (relative จาก vault root ตัด .md) · เขียนด้วย doc_write " +
  "(mode create|replace|patch) · ลบ = soft-delete เข้า vault/.trash/ เท่านั้น ไม่มี tool ลบถาวร (docs/06)"

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603

type JsonRpcId = string | number | null

class RpcError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = "RpcError"
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asId(value: unknown): JsonRpcId {
  return typeof value === "string" || typeof value === "number" || value === null ? value : null
}

function resultResponse(id: JsonRpcId, result: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, result })
}

function errorResponse(id: JsonRpcId, code: number, message: string): string {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })
}

export interface McpServer {
  /** รับ 1 บรรทัดจาก stdin → คืน 1 บรรทัดคำตอบ (JSON) · `null` = ไม่ตอบ (notification/บรรทัดว่าง) */
  handleLine(line: string): Promise<string | null>
}

export function createMcpServer(deps: McpDeps): McpServer {
  return {
    async handleLine(line: string): Promise<string | null> {
      return handleLine(deps, line)
    },
  }
}

async function handleLine(deps: McpDeps, line: string): Promise<string | null> {
  const trimmed = line.trim()
  if (!trimmed) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return errorResponse(null, PARSE_ERROR, "Parse error")
  }
  if (!isRecord(parsed)) {
    return errorResponse(null, INVALID_REQUEST, "Invalid Request")
  }

  const isRequest = "id" in parsed
  const method = parsed.method
  if (typeof method !== "string") {
    return isRequest ? errorResponse(asId(parsed.id), INVALID_REQUEST, "Invalid Request") : null
  }
  if (!isRequest) {
    handleNotification(method)
    return null
  }

  const id = asId(parsed.id)
  try {
    return resultResponse(id, await dispatch(deps, method, parsed.params))
  } catch (error) {
    if (error instanceof RpcError) return errorResponse(id, error.code, error.message)
    process.stderr.write(
      `[doku mcp] internal (${method}): ${
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      }\n`,
    )
    return errorResponse(id, INTERNAL_ERROR, "Internal error")
  }
}

/** notification (ไม่มี `id`) — `notifications/*` = no-op เงียบ ๆ ตาม JSON-RPC */
function handleNotification(method: string): void {
  if (method.startsWith("notifications/")) return
  process.stderr.write(`[doku mcp] เพิกเฉยต่อ method ที่ไม่มี id: ${method}\n`)
}

async function dispatch(deps: McpDeps, method: string, params: unknown): Promise<unknown> {
  switch (method) {
    case "initialize":
      return initializeResult(params)
    case "ping":
      return {}
    case "shutdown":
      // client ปิด stdin หลังจากนี้ = process จบเอง (ไม่มี state ต้อง cleanup)
      return {}
    case "tools/list":
      return { tools: toolDefinitions() }
    case "tools/call":
      return await toolsCall(deps, params)
    default:
      throw new RpcError(METHOD_NOT_FOUND, `Method not found: ${method}`)
  }
}

function initializeResult(params: unknown): unknown {
  const protocolVersion =
    isRecord(params) && typeof params.protocolVersion === "string"
      ? params.protocolVersion
      : MCP_PROTOCOL_VERSION
  return {
    protocolVersion,
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
  }
}

interface TextContent {
  type: "text"
  text: string
}

function contentOf(payload: unknown, isError = false): unknown {
  const content: TextContent = { type: "text", text: JSON.stringify(payload, null, 2) }
  return isError ? { content: [content], isError: true } : { content: [content] }
}

async function toolsCall(deps: McpDeps, params: unknown): Promise<unknown> {
  if (!isRecord(params)) throw new RpcError(INVALID_PARAMS, "`params` ต้องเป็น object")
  const name = params.name
  if (typeof name !== "string" || name === "") {
    throw new RpcError(INVALID_PARAMS, "`params.name` ต้องเป็น string")
  }
  const args = params.arguments === undefined ? {} : params.arguments
  if (!isRecord(args)) throw new RpcError(INVALID_PARAMS, "`params.arguments` ต้องเป็น object")
  if (!hasTool(name)) throw new RpcError(INVALID_PARAMS, `unknown tool: ${name}`)

  try {
    return contentOf(await callTool(deps, name, args))
  } catch (error) {
    const toolError = toToolError(error)
    if (toolError.code === "internal_error") {
      process.stderr.write(
        `[doku mcp] ${name}: ${
          error instanceof Error ? (error.stack ?? error.message) : String(error)
        }\n`,
      )
      return contentOf(
        { ok: false, error: { code: "internal_error", message: "เกิดข้อผิดพลาดภายใน" } },
        true,
      )
    }
    const errorBody: { code: string; message: string; fields?: string[] } = {
      code: toolError.code,
      message: toolError.message,
    }
    if (toolError.fields) errorBody.fields = toolError.fields
    return contentOf({ ok: false, error: errorBody }, true)
  }
}
