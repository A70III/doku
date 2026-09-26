#!/usr/bin/env bun
/**
 * `doku` CLI — `render` `check` `serve` `restore` (M0–M3)
 * + `new` `mkdir` `tree` `list` `mv` `mcp` (M4 · docs/05 §2)
 *
 * ทุกคำสั่งสำคัญมี `--json` ให้ agent parse — ทั้ง success และ error
 */

import { existsSync } from "node:fs"
import { basename, dirname, join, relative, resolve as resolvePath } from "node:path"
import { fileURLToPath } from "node:url"
import {
  basenameOf,
  buildDocIndex,
  checkVault,
  countByLevel,
  defaultMeta,
  dirnameOf,
  loadMeta,
  type Meta,
  MetaSchema,
  MoveError,
  moveDoc,
  moveFolder,
  normalizeLinkTarget,
  normalizeVaultPath,
  PathError,
  renderMarkdown,
  resolveDoc,
  resolveInline,
  type VaultFs,
  type VaultListing,
  type Warning,
  walkVault,
} from "@doku/core"
import {
  createNodeRevisionStore,
  createNodeVaultFs,
  createSearchIndexStore,
  logAudit,
} from "@doku/fs-node"
import { loadKatexCss } from "./preview/katex-css.ts"
import { renderPreviewPage } from "./preview/page.ts"

const VERSION = "0.0.0"
const VALUE_FLAGS = new Set([
  "vault",
  "out",
  "meta",
  "port",
  "host",
  "var",
  "title",
  "tag",
  "path",
  "limit",
])

export interface ParsedArgs {
  command: string
  positional: string[]
  flags: Map<string, string | boolean>
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>()
  const positional: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string
    if (arg === "--") {
      positional.push(...argv.slice(index + 1))
      break
    }
    if (!arg.startsWith("--")) {
      positional.push(arg)
      continue
    }
    const body = arg.slice(2)
    const separator = body.indexOf("=")
    if (separator !== -1) {
      flags.set(body.slice(0, separator), body.slice(separator + 1))
      continue
    }
    if (VALUE_FLAGS.has(body)) {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`flag --${body} ต้องมีค่า`)
      }
      flags.set(body, value)
      index += 1
      continue
    }
    flags.set(body, true)
  }

  const command = positional.shift() ?? "help"
  return { command, positional, flags }
}

class UsageError extends Error {}

/**
 * error ที่คำสั่ง M4 ตั้ง code เอง (`already_exists` `not_found` …) — `main` map เป็น
 * `{ ok: false, code, error }` เมื่อ `--json` (สัญญา `--json` = ทั้ง success และ error parse ได้)
 */
class CommandFailure extends Error {
  readonly code: string
  readonly exit: number
  constructor(code: string, message: string, exit = 1) {
    super(message)
    this.code = code
    this.exit = exit
  }
}

function emitFailure(args: ParsedArgs, failure: CommandFailure): number {
  if (args.flags.has("json")) {
    process.stdout.write(
      `${JSON.stringify({ ok: false, code: failure.code, error: failure.message })}\n`,
    )
  } else {
    process.stderr.write(`${failure.exit === 2 ? "" : "error: "}${failure.message}\n`)
  }
  return failure.exit
}

/** รูปทรงเดียวกับ `emitFailure` — flat `{ok, code, error}` เพื่อให้ `--json` error shape เดียวทั้ง CLI */
function emitJsonError(code: string, message: string): void {
  process.stdout.write(`${JSON.stringify({ ok: false, code, error: message })}\n`)
}

/** code ของ error ที่หลุดมาถึง catch กลาง — core ตั้ง code เอง (`PathError` `DocNotFoundError` …) */
function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === "string" ? code : "internal_error"
}

export function usage(): string {
  return `doku — document hub

คำสั่ง:
  doku new <path> [--title <ชื่อ>] สร้างเอกสารใหม่ (สร้าง parent folders ให้)
  doku mkdir <path>                 สร้างโฟลเดอร์ (มีอยู่แล้ว = error)
  doku render <path>                render เอกสาร → HTML (stdout)
  doku render --stdin           render markdown จาก stdin (stateless)
  doku check [path]             validate vault / เอกสาร
  doku tree                     โครงสร้าง vault (nested + รายการแบน)
  doku list [--tag <tag>]       list เอกสาร (title/tags/status/mtime)
  doku mv <from> <to>           ย้ายเอกสาร/โฟลเดอร์ (อัปเดตลิงก์ + moved_from)
  doku serve                    เปิด web server (:7667)
  doku mcp                      spawn MCP server ทาง stdio (ต้องมี packages/mcp)
  doku restore <path> [ts]      กู้เอกสารจาก revision (ไม่ระบุ ts = ล่าสุด)
                                ใช้ --list เพื่อดู revision ที่มี
  doku audit [--path <p>]       อ่าน audit log (var/audit.log, JSONL) — อ่านอย่างเดียว
                                กรองตาม path ด้วย --path <p> · เอา n รายการหลังสุดด้วย --limit <n>
  doku search <q> [--tag <t>]   ค้นเอกสารแบบ FTS (var/index.db — เนื้อหา+ชื่อ ไทย/อังกฤษ)
                                หลายคำ = AND · เพิ่ม --limit <n> จำกัดจำนวนผล
  doku build --out <dir>        export vault → HTML อ่าน offline (docs + assets + index.html)

ตัวเลือก:
  --vault <dir>     vault root (default: $DOKU_VAULT หรือ ./vault)
  --var <dir>       โฟลเดอร์ var (default: $DOKU_VAR หรือ ./var) — ใช้กับ restore
  --fragment        render เฉพาะ HTML fragment (ไม่ห่อ layout)
  --json            ผลลัพธ์เป็น JSON (ให้ agent parse) — รวมตอน error ด้วย
  --out <file>      เขียนผลลัพธ์ลงไฟล์แทน stdout
  --meta <file>     meta.json สำหรับโหมด --stdin
  --title <ชื่อ>    (new) ชื่อเรื่อง → h1 + meta.json
  --tag <tag>       (list) กรองตาม tag
  --strict          (check) ให้ warning ทำให้ exit code ≠ 0
  --list            (restore) แสดง revision ที่มี
  -h, --help        แสดง help
  -v, --version     แสดงเวอร์ชัน

serve เท่านั้น:
  --port <n>        (default 7667 · env DOKU_PORT)
  --host <addr>     (default 0.0.0.0 · env DOKU_HOST)

ตัวอย่าง:
  doku render projects/doku/design > out.html
  doku render --vault examples/vault projects/doku/design --out /tmp/design.html
  echo '# hi' | doku render --stdin --fragment
  doku check --vault examples/vault --json
  doku new projects/x/y --title "Y" --vault examples/vault --json
  doku list --tag design --vault examples/vault --json
  doku mv old/path new/path --vault examples/vault --json
  doku restore projects/doku/design --list
  doku restore projects/doku/design 20250912T100000000Z
`
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  // literal `--json` ใน argv = ขอ JSON ตั้งแต่ก่อน parse — parseArgs อาจ throw ก่อนที่จะได้ args
  const wantsJson = argv.includes("--json")
  let args: ParsedArgs
  try {
    args = parseArgs(argv)
  } catch (error) {
    if (wantsJson) emitJsonError("usage", (error as Error).message)
    else process.stderr.write(`${(error as Error).message}\n\n${usage()}`)
    return 2
  }
  const jsonMode = wantsJson || args.flags.has("json")

  if (args.flags.has("help") || args.flags.has("h") || args.command === "help") {
    process.stdout.write(usage())
    return 0
  }
  if (args.flags.has("version") || args.flags.has("v") || args.command === "version") {
    process.stdout.write(`doku ${VERSION}\n`)
    return 0
  }

  try {
    switch (args.command) {
      case "render":
        return await commandRender(args)
      case "check":
        return await commandCheck(args)
      case "new":
        return await commandNew(args)
      case "mkdir":
        return await commandMkdir(args)
      case "tree":
        return await commandTree(args)
      case "list":
        return await commandList(args)
      case "mv":
        return await commandMv(args)
      case "serve":
        return await commandServe(args)
      case "mcp":
        return await commandMcp(args)
      case "restore":
        return await commandRestore(args)
      case "audit":
        return await commandAudit(args)
      case "search":
        return await commandSearch(args)
      case "build":
        return await commandBuild(args)
      default:
        if (jsonMode) emitJsonError("unknown_command", `ไม่รู้จักคำสั่ง: ${args.command}`)
        else process.stderr.write(`ไม่รู้จักคำสั่ง: ${args.command}\n\n${usage()}`)
        return 2
    }
  } catch (error) {
    if (error instanceof CommandFailure) {
      return emitFailure(args, error)
    }
    if (error instanceof UsageError) {
      if (jsonMode) emitJsonError("usage", error.message)
      else process.stderr.write(`${error.message}\n`)
      return 2
    }
    if (jsonMode) emitJsonError(errorCodeOf(error), (error as Error).message)
    else process.stderr.write(`error: ${(error as Error).message}\n`)
    return 1
  }
}

/** หา vault root + fs adapter ที่ผ่าน path safety (docs/06) */
async function openVault(flagValue: string | boolean | undefined) {
  const raw = typeof flagValue === "string" ? flagValue : (process.env.DOKU_VAULT ?? "vault")
  const root = resolvePath(raw)
  const fs = await createNodeVaultFs(root).catch(() => {
    throw new UsageError(
      `ไม่พบ vault: ${root}\nสร้างโฟลเดอร์ vault/ ก่อน หรือระบุ --vault <dir> (ตัวอย่าง: --vault examples/vault)`,
    )
  })
  return { fs, vaultName: basename(root) }
}

async function commandRender(args: ParsedArgs): Promise<number> {
  const useStdin = args.flags.has("stdin")
  const metaFlag = args.flags.get("meta")
  const vaultFlag = args.flags.get("vault")
  const warnings: Warning[] = []

  let fs: VaultFs | undefined
  let docId = ""
  let markdown: string
  let body = ""
  let meta: Meta | undefined

  if (useStdin) {
    markdown = await Bun.stdin.text()
    const inline = resolveInline(markdown, "untitled")
    body = inline.body
    meta = inline.meta
    warnings.push(...inline.warnings)

    if (typeof metaFlag === "string") {
      const parsed = MetaSchema.safeParse(JSON.parse(await Bun.file(metaFlag).text()))
      if (parsed.success) {
        meta = parsed.data
      } else {
        warnings.push({
          code: "meta_invalid",
          message: `--meta ไม่ผ่าน schema: ${parsed.error.issues
            .map((issue) => issue.path.join("."))
            .join(", ")}`,
          level: "warning",
          field: metaFlag,
        })
      }
    }
  } else {
    const target = args.positional[0]
    if (!target) throw new UsageError("ต้องระบุ path ของเอกสาร หรือใช้ --stdin")
    const vault = await openVault(vaultFlag)
    fs = vault.fs
    const resolved = await resolveDoc(target, vault.fs, { vaultName: vault.vaultName })
    docId = resolved.id
    markdown = resolved.markdown
    body = resolved.body
    meta = resolved.meta
    warnings.push(...resolved.warnings)
  }

  // `--stdin --vault ...` = ยัง resolve wikilink/asset ได้ (relative จาก root)
  if (!fs && typeof vaultFlag === "string") {
    fs = (await openVault(vaultFlag)).fs
  }

  let index: Map<string, string[]> | undefined
  let hasDoc: ((id: string) => boolean) | undefined
  if (fs) {
    const listing = await walkVault(fs)
    index = buildDocIndex(listing.docs)
    const known = new Set(listing.docs)
    hasDoc = (id: string) => known.has(id)
  }

  const result = await renderMarkdown(body, {
    docId,
    meta: meta ?? defaultMeta(docId || "untitled"),
    vault: fs ? { fs, index, hasDoc } : undefined,
    warnings,
  })

  for (const item of result.warnings) {
    process.stderr.write(`${item.level}: ${item.code}: ${item.message}\n`)
  }

  const fragment = result.html
  if (args.flags.has("fragment")) {
    return writeOutput(fragment, args)
  }

  const extraCss = fragment.includes("katex") ? await loadKatexCss() : undefined
  const page = renderPreviewPage({
    title: result.meta.title ?? (docId || "untitled"),
    docId,
    meta: result.meta,
    html: fragment,
    toc: result.toc,
    warnings: result.warnings,
    extraCss,
  })
  return writeOutput(page, args)
}

async function writeOutput(content: string, args: ParsedArgs): Promise<number> {
  const out = args.flags.get("out")
  if (typeof out === "string") {
    const path = resolvePath(out)
    await Bun.write(path, content)
    if (args.flags.has("json")) {
      process.stdout.write(`${JSON.stringify({ ok: true, out: path, bytes: content.length })}\n`)
    } else {
      process.stderr.write(`เขียนแล้ว: ${path} (${content.length} bytes)\n`)
    }
    return 0
  }

  if (args.flags.has("json")) {
    process.stdout.write(`${JSON.stringify({ ok: true, bytes: content.length, content })}\n`)
    return 0
  }

  process.stdout.write(content.endsWith("\n") ? content : `${content}\n`)
  return 0
}

/**
 * `doku serve` — สปอร์น server subprocess (docs/08 ข้อ 25)
 * เพราะทิศทาง dependency ห้าม cli import @doku/server ตรงๆ
 * (env ผ่าน DOKU_VAULT / DOKU_PORT / DOKU_HOST)
 */
async function commandServe(args: ParsedArgs): Promise<number> {
  const serverEntry = fileURLToPath(new URL("../../server/src/index.ts", import.meta.url))
  const env: Record<string, string | undefined> = { ...process.env }

  const vaultFlag = args.flags.get("vault")
  if (typeof vaultFlag === "string") env.DOKU_VAULT = resolvePath(vaultFlag)
  const portFlag = args.flags.get("port")
  if (typeof portFlag === "string") env.DOKU_PORT = portFlag
  const hostFlag = args.flags.get("host")
  if (typeof hostFlag === "string") env.DOKU_HOST = hostFlag

  const child = Bun.spawn([process.execPath, serverEntry], {
    env,
    stdio: ["inherit", "inherit", "inherit"],
  })
  process.on("SIGINT", () => child.kill("SIGINT"))
  const exit = await child.exited
  return exit === 0 ? 0 : exit === null ? 0 : exit
}

/**
 * `doku restore <path> [ts]` — กู้ md (+meta) จาก `var/revisions/` (docs/06)
 * ก่อนเขียนทับจะเก็บ revision ของสถานะปัจจุบันก่อน → restore ก็ undo ได้
 */
async function commandRestore(args: ParsedArgs): Promise<number> {
  const target = args.positional[0]
  if (!target) throw new UsageError("ต้องระบุ path ของเอกสาร: doku restore <path> [ts]")

  const vault = await openVault(args.flags.get("vault"))
  const varFlag = args.flags.get("var")
  const varDir = resolvePath(
    typeof varFlag === "string" ? varFlag : (process.env.DOKU_VAR ?? "var"),
  )
  const id = normalizeLinkTarget(target, { vaultName: vault.vaultName })
  const revisions = await createNodeRevisionStore(varDir)

  const list = await revisions.list(id)
  if (args.flags.has("list")) {
    if (args.flags.has("json")) {
      process.stdout.write(`${JSON.stringify({ ok: true, path: id, revisions: list })}\n`)
    } else if (list.length === 0) {
      process.stdout.write(`ไม่มี revision ของ ${id}\n`)
    } else {
      for (const entry of list) process.stdout.write(`${entry.ts}  ${entry.at}\n`)
    }
    return 0
  }

  if (list.length === 0) {
    process.stderr.write(`error: ไม่มี revision ของ ${id}\n`)
    return 1
  }

  const requested = args.positional[1]
  const ts = requested ?? list[0]?.ts
  if (!ts) {
    process.stderr.write(`error: ไม่พบ revision\n`)
    return 1
  }
  const snapshot = await revisions.read(id, ts)
  if (!snapshot) {
    process.stderr.write(`error: ไม่พบ revision ${ts} ของ ${id}\n`)
    return 1
  }

  // เก็บสถานะปัจจุบันก่อนทับ (กู้กลับได้)
  const current = {
    md: await vault.fs.readText(`${id}.md`),
    meta: await vault.fs.readText(`${id}.meta.json`),
  }
  if (current.md !== null || current.meta !== null) await revisions.save(id, current)

  if (snapshot.md !== null) await vault.fs.writeText(`${id}.md`, snapshot.md)
  if (snapshot.meta !== null) await vault.fs.writeText(`${id}.meta.json`, snapshot.meta)
  logAudit({ actor: "cli", action: "doc.revision_restore", path: id }, varDirOf(args))

  if (args.flags.has("json")) {
    process.stdout.write(
      `${JSON.stringify({ ok: true, path: id, ts, restored: { md: snapshot.md !== null, meta: snapshot.meta !== null } })}\n`,
    )
  } else {
    process.stderr.write(`กู้คืน ${id} จาก revision ${ts} แล้ว\n`)
  }
  return 0
}

async function commandCheck(args: ParsedArgs): Promise<number> {
  const vault = await openVault(args.flags.get("vault"))
  const report = await checkVault(vault.fs, {
    path: args.positional[0],
    vaultName: vault.vaultName,
  })

  if (args.flags.has("json")) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: report.ok,
          stats: report.stats,
          errors: report.errors,
          warnings: report.warnings,
          docs: report.docs.map((doc) => ({
            id: doc.id,
            title: doc.title,
            words: doc.words,
            headings: doc.headings,
            blocks: doc.blocks,
            errors: doc.errors.length,
            warnings: doc.warnings.length,
          })),
        },
        null,
        2,
      )}\n`,
    )
  } else {
    for (const item of report.errors) {
      process.stderr.write(
        `error: ${item.code}: ${item.path ? `${item.path}: ` : ""}${item.message}\n`,
      )
    }
    for (const item of report.warnings) {
      process.stderr.write(
        `${item.level}: ${item.code}: ${item.path ? `${item.path}: ` : ""}${item.message}\n`,
      )
    }
    const counts = countByLevel(report.warnings)
    process.stdout.write(
      `doku check: ${report.stats.docs} docs · ${report.stats.assets} assets · ${report.stats.blocks} blocks · ` +
        `${report.errors.length} errors · ${counts.warning} warnings\n`,
    )
  }

  if (!report.ok) return 1
  if (args.flags.has("strict") && report.warnings.some((item) => item.level === "warning")) return 1
  return 0
}

/* ── M4 · new · mkdir · tree · list · mv · mcp (docs/05 §2) ────────────── */

/** path จาก user → path id ที่ปลอดภัย — `PathError` ยกเป็น `CommandFailure` (มี code ให้ `--json`) */
function docPath(input: string, vaultName: string): string {
  try {
    return normalizeLinkTarget(input, { vaultName })
  } catch (error) {
    throw new CommandFailure(
      error instanceof PathError ? error.code : "path_invalid",
      (error as Error).message,
    )
  }
}

/** เหมือน `docPath` แต่ไม่ตัด suffix — folder path ตรงกับ server (`a/b.md` เป็นชื่อโฟลเดอร์ได้) */
function folderPath(input: string, vaultName: string): string {
  try {
    return normalizeVaultPath(input, { vaultName, stripSuffix: false })
  } catch (error) {
    throw new CommandFailure(
      error instanceof PathError ? error.code : "path_invalid",
      (error as Error).message,
    )
  }
}

/** เขียนผลลัพธ์ของคำสั่งใหม่: `--json` = envelope ให้ agent parse · ไม่=json = ข้อความคน */
function emitOk(args: ParsedArgs, payload: Record<string, unknown>, human: string): void {
  if (args.flags.has("json")) {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  } else {
    process.stdout.write(`${human}\n`)
  }
}

/** var root ของคำสั่ง (`--var` หรือ `DOKU_VAR ?? "var"`) — audit log ของ CLI ใช้ที่เดียวกับ server */
function varDirOf(args: ParsedArgs): string {
  const flag = args.flags.get("var")
  return resolvePath(typeof flag === "string" ? flag : (process.env.DOKU_VAR ?? "var"))
}

/**
 * `doku new <path> [--title <ชื่อ>]` — สร้างเอกสารใหม่
 * เขียนผ่าน fs adapter ตัวเดิมทั้งคู่ (safeJoin + atomic write — plan §4 #4 ห้ามเขียนตรง)
 */
async function commandNew(args: ParsedArgs): Promise<number> {
  const target = args.positional[0]
  if (!target) {
    throw new CommandFailure("usage", "ต้องระบุ path ของเอกสาร: doku new <path> [--title <ชื่อ>]", 2)
  }
  const vault = await openVault(args.flags.get("vault"))
  const id = docPath(target, vault.vaultName)
  if (
    (await vault.fs.exists(`${id}.md`)) ||
    (await vault.fs.exists(`${id}.meta.json`)) ||
    (await vault.fs.exists(id))
  ) {
    throw new CommandFailure("already_exists", `มีอยู่แล้ว: ${id}`)
  }

  const titleFlag = args.flags.get("title")
  const title =
    typeof titleFlag === "string" && titleFlag.trim().length > 0 ? titleFlag.trim() : basenameOf(id)

  await vault.fs.writeText(`${id}.md`, `# ${title}\n`)
  // มี --title = เขียน sidecar ด้วย → `list`/`tree` อ่าน title ตรงจาก meta (frontmatter ไม่ได้อ่านตรงนี้)
  if (typeof titleFlag === "string") {
    await vault.fs.writeText(`${id}.meta.json`, `${JSON.stringify({ title }, null, 2)}\n`)
  }

  logAudit({ actor: "cli", action: "doc.create", path: id }, varDirOf(args))
  emitOk(args, { ok: true, path: id, title, md: `${id}.md` }, `สร้างแล้ว: ${id}.md`)
  return 0
}

/** `doku mkdir <path>` — สร้างโฟลเดอร์ (รวม parents) · มีอยู่แล้ว = `already_exists` เหมือน POST /api/folders */
async function commandMkdir(args: ParsedArgs): Promise<number> {
  const target = args.positional[0]
  if (!target) throw new CommandFailure("usage", "ต้องระบุ path ของโฟลเดอร์: doku mkdir <path>", 2)
  const vault = await openVault(args.flags.get("vault"))
  const path = folderPath(target, vault.vaultName)
  if ((await vault.fs.exists(path)) || (await vault.fs.exists(`${path}.md`))) {
    throw new CommandFailure("already_exists", `มีอยู่แล้ว: ${path}`)
  }
  await vault.fs.mkdir(path)
  logAudit({ actor: "cli", action: "folder.create", path }, varDirOf(args))
  emitOk(args, { ok: true, path }, `สร้างโฟลเดอร์แล้ว: ${path}/`)
  return 0
}

interface CliTreeNode {
  type: "folder" | "doc" | "asset"
  path: string
  name: string
  /** title จาก meta (doc เท่านั้น) */
  title?: string
  children?: CliTreeNode[]
}

const NODE_RANK: Record<CliTreeNode["type"], number> = { folder: 0, doc: 1, asset: 2 }

/** โครงสร้าง vault แบบ nested — โฟลเดอร์ว่างก็อยู่ใน tree (ผ่าน walkVault ที่ข้าม dotfile/.trash) */
async function buildTreeNodes(listing: VaultListing, fs: VaultFs): Promise<CliTreeNode[]> {
  const root: CliTreeNode = { type: "folder", path: "", name: "", children: [] }
  const nodes = new Map<string, CliTreeNode>([["", root]])
  const folderAt = (dir: string): CliTreeNode => {
    const existing = nodes.get(dir)
    if (existing) return existing
    const node: CliTreeNode = { type: "folder", path: dir, name: basenameOf(dir), children: [] }
    folderAt(dirnameOf(dir)).children?.push(node)
    nodes.set(dir, node)
    return node
  }
  for (const path of listing.folders) folderAt(path)
  for (const id of listing.docs) {
    const { meta } = await loadMeta(fs, id, null)
    const name = basenameOf(id)
    folderAt(dirnameOf(id)).children?.push({
      type: "doc",
      path: id,
      name,
      title: meta.title ?? name,
    })
  }
  for (const asset of listing.assets) {
    folderAt(dirnameOf(asset)).children?.push({
      type: "asset",
      path: asset,
      name: basenameOf(asset),
    })
  }
  const sortNode = (node: CliTreeNode): void => {
    node.children?.sort(
      (a, b) => NODE_RANK[a.type] - NODE_RANK[b.type] || a.name.localeCompare(b.name, "th"),
    )
    for (const child of node.children ?? []) sortNode(child)
  }
  sortNode(root)
  return root.children ?? []
}

function formatTree(nodes: readonly CliTreeNode[], prefix: string): string[] {
  const lines: string[] = []
  nodes.forEach((node, index) => {
    const last = index === nodes.length - 1
    const label = node.type === "folder" ? `${node.name}/` : node.name
    lines.push(`${prefix}${last ? "└── " : "├── "}${label}`)
    if (node.children && node.children.length > 0) {
      lines.push(...formatTree(node.children, `${prefix}${last ? "    " : "│   "}`))
    }
  })
  return lines
}

/** `doku tree --json` — โครงสร้าง vault: nested `tree` + รายการแบน `docs`/`folders`/`assets` */
async function commandTree(args: ParsedArgs): Promise<number> {
  const vault = await openVault(args.flags.get("vault"))
  const listing = await walkVault(vault.fs)
  const tree = await buildTreeNodes(listing, vault.fs)

  if (args.flags.has("json")) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          tree,
          docs: listing.docs,
          folders: listing.folders,
          assets: listing.assets,
        },
        null,
        2,
      )}\n`,
    )
    return 0
  }

  const lines = formatTree(tree, "")
  if (lines.length === 0) {
    process.stdout.write("(vault ว่าง)\n")
    return 0
  }
  for (const line of lines) process.stdout.write(`${line}\n`)
  return 0
}

interface CliDocSummary {
  id: string
  title: string
  tags: string[]
  status: Meta["status"]
  pinned: boolean
  order?: number
  created?: string
  /** mtime ของ `.md` (0 ถ้า adapter ไม่ให้ stat) — รูปแบบเดียวกับ `GET /api/docs` */
  mtimeMs: number
  bytes: number
}

/** `doku list [--tag <tag>] --json` — list เอกสาร (+ meta) เรียง mtime ใหม่→เก่า ตรง `GET /api/docs` */
async function commandList(args: ParsedArgs): Promise<number> {
  const vault = await openVault(args.flags.get("vault"))
  const tagFlag = args.flags.get("tag")

  const listing = await walkVault(vault.fs)
  const docs: CliDocSummary[] = []
  for (const id of listing.docs) {
    const { meta } = await loadMeta(vault.fs, id, null)
    const stat = (await vault.fs.stat?.(`${id}.md`)) ?? null
    docs.push({
      id,
      title: meta.title ?? basenameOf(id),
      tags: meta.tags,
      status: meta.status,
      pinned: meta.pinned,
      order: meta.order,
      created: meta.created,
      mtimeMs: stat?.mtimeMs ?? 0,
      bytes: stat?.size ?? 0,
    })
  }
  const tag = typeof tagFlag === "string" ? tagFlag : null
  const items = tag ? docs.filter((doc) => doc.tags.includes(tag)) : docs
  items.sort((a, b) => b.mtimeMs - a.mtimeMs || a.id.localeCompare(b.id))

  if (args.flags.has("json")) {
    process.stdout.write(`${JSON.stringify({ ok: true, tag, docs: items }, null, 2)}\n`)
    return 0
  }
  if (items.length === 0) {
    process.stdout.write(tag ? `ไม่พบเอกสาร tag=${tag}\n` : "ไม่มีเอกสาร\n")
    return 0
  }
  for (const doc of items) {
    const tags = doc.tags.length > 0 ? `\t#${doc.tags.join(" #")}` : ""
    process.stdout.write(`${doc.id}\t${doc.title}${tags}\n`)
  }
  return 0
}

/**
 * `doku mv <from> <to>` — ย้ายเอกสาร/โฟลเดอร์ผ่าน core move engine (S1: `core/src/move.ts`)
 * auto-update ลิงก์ทั้ง vault + เขียน `relations.moved_from` + เก็บ revision ก่อนเขียน
 * (plan §4 #4: revision-before-overwrite — เหมือน guard ฝั่ง server)
 */
async function commandMv(args: ParsedArgs): Promise<number> {
  const fromRaw = args.positional[0]
  const toRaw = args.positional[1]
  if (!fromRaw || !toRaw) {
    throw new CommandFailure("usage", "ต้องระบุต้นทางและปลายทาง: doku mv <from> <to>", 2)
  }
  const vault = await openVault(args.flags.get("vault"))
  const from = docPath(fromRaw, vault.vaultName)
  const to = docPath(toRaw, vault.vaultName)

  // `x/` + `x.md` ซ้ำ = doc wins (docs/05) — ตรง URL ที่เปิดเอกสารเสมอเมื่อมีไฟล์
  const isDoc = await vault.fs.exists(`${from}.md`)
  const isFolder = !isDoc && (await vault.fs.exists(from))
  if (!isDoc && !isFolder) {
    throw new CommandFailure("not_found", `ไม่พบเอกสารหรือโฟลเดอร์: ${from}`)
  }

  const varFlag = args.flags.get("var")
  const varDir = resolvePath(
    typeof varFlag === "string" ? varFlag : (process.env.DOKU_VAR ?? "var"),
  )
  const revisions = await createNodeRevisionStore(varDir)
  const beforeMove = async (ids: readonly string[]): Promise<void> => {
    for (const id of ids) {
      const md = await vault.fs.readText(`${id}.md`)
      const meta = await vault.fs.readText(`${id}.meta.json`)
      if (md !== null || meta !== null) await revisions.save(id, { md, meta })
    }
  }

  try {
    const result = isDoc
      ? await moveDoc(vault.fs, from, to, { beforeMove })
      : await moveFolder(vault.fs, from, to, { beforeMove })
    logAudit(
      {
        actor: "cli",
        action: isDoc ? "doc.move" : "folder.move",
        path: result.from,
        to: result.to,
      },
      varDirOf(args),
    )
    emitOk(
      args,
      {
        ok: true,
        kind: isDoc ? "doc" : "folder",
        from: result.from,
        to: result.to,
        updated_links: result.updated_links,
      },
      `ย้ายแล้ว: ${result.from} → ${result.to} · อัปเดต ${result.updated_links} ไฟล์`,
    )
    return 0
  } catch (error) {
    if (error instanceof MoveError) throw new CommandFailure(error.code, error.message)
    throw error
  }
}

/**
 * `doku mcp` — spawn MCP server เป็น subprocess (decision 25 · plan §4 #3: cli ห้าม import @doku/mcp)
 * รูปแบบเดียวกับ `doku serve` — stdio inherit · vault ผ่าน env `DOKU_VAULT`
 * dispatch มาจาก slice S5: ตัว `packages/mcp` ยังไม่มา = ออก `not_ready` ไปก่อน
 */
async function commandMcp(args: ParsedArgs): Promise<number> {
  const mcpEntry = fileURLToPath(new URL("../../mcp/src/index.ts", import.meta.url))
  if (!existsSync(mcpEntry)) {
    throw new CommandFailure("not_ready", `ยังใช้ไม่ได้: ไม่พบ packages/mcp (รอ slice S5)`)
  }

  const env: Record<string, string | undefined> = { ...process.env }
  const vaultFlag = args.flags.get("vault")
  if (typeof vaultFlag === "string") env.DOKU_VAULT = resolvePath(vaultFlag)

  const child = Bun.spawn([process.execPath, mcpEntry], {
    env,
    stdio: ["inherit", "inherit", "inherit"],
  })
  process.on("SIGINT", () => child.kill("SIGINT"))
  const exit = await child.exited
  return exit === 0 ? 0 : exit === null ? 0 : exit
}

/** 1 บรรทัดของ `var/audit.log` (JSONL, docs/06) — field ตามที่ server เขียน */
interface AuditLine {
  ts?: string
  actor?: string
  action?: string
  path?: string
  etag?: string
  ip?: string
  to?: string
}

/**
 * `doku audit [--path <p>] [--limit <n>]` — อ่าน `var/audit.log` (JSONL, docs/06)
 *
 * READ-ONLY เท่านั้น: อ่านไฟล์แล้ว print — **ไม่มี flag หรือ branch ไหนเขียน/ตัด/ล้าง log ได้**
 * (append มีเฉพาะฝั่ง server · การลบไฟล์ = คนจัดการเองข้างนอก ไม่ผ่าน CLI)
 * var root = `--var` หรือ `DOKU_VAR ?? "var"` — ตำแหน่งเดียวกับที่ server เขียน
 */
async function commandAudit(args: ParsedArgs): Promise<number> {
  const varFlag = args.flags.get("var")
  const varDir = resolvePath(
    typeof varFlag === "string" ? varFlag : (process.env.DOKU_VAR ?? "var"),
  )
  const file = resolvePath(varDir, "audit.log")

  const pathFlag = args.flags.get("path")
  const filter = typeof pathFlag === "string" ? pathFlag : null
  const limitFlag = args.flags.get("limit")
  let limit = Number.NaN
  if (typeof limitFlag === "string") {
    limit = Number.parseInt(limitFlag, 10)
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new CommandFailure("usage", `--limit ต้องเป็นจำนวนเต็มบวก: ${limitFlag}`, 2)
    }
  }

  let raw = ""
  try {
    const fileHandle = Bun.file(file)
    if (await fileHandle.exists()) raw = await fileHandle.text()
  } catch (error) {
    throw new CommandFailure(
      "internal_error",
      `อ่าน audit log ไม่สำเร็จ: ${file} (${error instanceof Error ? error.message : String(error)})`,
    )
  }

  const entries: AuditLine[] = []
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue
    try {
      const parsed: unknown = JSON.parse(line)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        entries.push(parsed as AuditLine)
      }
    } catch {
      // บรรทัดไม่ครบ/เสีย — ข้ามแล้วอ่านต่อ (อ่านอย่างเดียว ห้ามแก้ไฟล์)
    }
  }

  const matched = filter === null ? entries : entries.filter((entry) => entry.path === filter)
  const shown = Number.isFinite(limit) ? matched.slice(-limit) : matched

  if (args.flags.has("json")) {
    process.stdout.write(
      `${JSON.stringify({ ok: true, file, path: filter, count: shown.length, entries: shown })}\n`,
    )
    return 0
  }
  if (shown.length === 0) {
    process.stdout.write(filter === null ? "ไม่มี audit entry\n" : `ไม่มี audit entry ของ ${filter}\n`)
    return 0
  }
  for (const entry of shown) {
    const fields = [
      entry.ts ?? "-",
      entry.action ?? "-",
      entry.path ?? "-",
      `actor=${entry.actor ?? "-"}`,
    ]
    if (entry.etag) fields.push(`etag=${entry.etag}`)
    if (entry.ip) fields.push(`ip=${entry.ip}`)
    if (entry.to) fields.push(`to=${entry.to}`)
    process.stdout.write(`${fields.join("  ")}\n`)
  }
  return 0
}

/**
 * `doku search <q> [--limit <n>] [--tag <tag>]` — ค้น FTS จาก `var/index.db` (M5 · docs/05 §2)
 *
 * ก่อนค้น = sync incremental (เทียบ hash — ไฟล์เดิมถูกข้าม) → server ไม่ได้เปิดก็ค้นได้
 * · engine ตัวเดียวกับ server/MCP (`@doku/fs-node`) · vault ไม่ถูกเขียน (index อยู่ฝั่ง var)
 */
async function commandSearch(args: ParsedArgs): Promise<number> {
  const query = args.positional.join(" ").trim()
  if (!query) {
    throw new CommandFailure("usage", "ต้องระบุคำค้น: doku search <q> [--limit <n>] [--tag <tag>]", 2)
  }
  const vault = await openVault(args.flags.get("vault"))
  const varFlag = args.flags.get("var")
  const varDir = resolvePath(
    typeof varFlag === "string" ? varFlag : (process.env.DOKU_VAR ?? "var"),
  )

  const limitFlag = args.flags.get("limit")
  let limit: number | undefined
  if (typeof limitFlag === "string") {
    limit = Number.parseInt(limitFlag, 10)
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new CommandFailure("usage", `--limit ต้องเป็นจำนวนเต็มบวก: ${limitFlag}`, 2)
    }
  }
  const tagFlag = args.flags.get("tag")
  const tag = typeof tagFlag === "string" ? tagFlag : undefined

  const store = createSearchIndexStore(varDir)
  try {
    await store.syncFull(vault.fs)
    const hits = store.search(query, { limit, tag })
    if (args.flags.has("json")) {
      process.stdout.write(`${JSON.stringify({ ok: true, query, count: hits.length, hits })}\n`)
      return 0
    }
    if (hits.length === 0) {
      process.stdout.write(`ไม่พบผลลัพธ์สำหรับ: ${query}\n`)
      return 0
    }
    for (const hit of hits) {
      const snippet = hit.snippet ? `\t${hit.snippet}` : ""
      process.stdout.write(`${hit.path}\t${hit.title}${snippet}\n`)
    }
    return 0
  } finally {
    store.close()
  }
}

/** escape สำหรับ index ที่ build สร้างเอง (title มาจาก meta ที่ AI เขียนได้ — ห้าม raw เข้า HTML) */
function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** URL ภายในของ export = relative เสมอ (`file://` ไม่เข้าใจ path ราก absolute) */
function relativeTo(pageDir: string, targetRel: string): string {
  const rel = relative(pageDir || ".", targetRel)
  return rel === "" ? targetRel : rel
}

/**
 * rewrite URL ฝั่ง server → ไฟล์ export:
 * `/d/<id>(#anchor)` → `<relative>.html#anchor` · `/assets/<path>?h=…` → ไฟล์จริง (ตัด query —
 * offline ไม่เช็ค hash) · URL ภายนอก (`http:`/`//`) ไม่แตะ (pattern ลงตัวที่ prefix สองตัวนี้)
 */
function rewriteOffline(html: string, pageDir: string): string {
  const withDocs = html.replace(
    /href="\/d\/([^"#?]+)((?:#[^"]*)?)"/g,
    (_match, rawPath: string, anchor: string) => {
      let id = rawPath
      try {
        id = decodeURIComponent(rawPath)
      } catch {
        // decode ไม่ได้ = ใช้ raw ตามเดิม
      }
      return `href="${relativeTo(pageDir, `${id}.html`)}${anchor ?? ""}"`
    },
  )
  return withDocs.replace(
    /(href|src|poster)="\/assets\/([^"?]+)(?:\?[^"]*)?"/g,
    (_match, attr: string, rawPath: string) => {
      let asset = rawPath
      try {
        asset = decodeURIComponent(rawPath)
      } catch {
        // ใช้ raw
      }
      return `${attr}="${relativeTo(pageDir, asset)}"`
    },
  )
}

/**
 * `doku build --out <dir>` — export vault → HTML อ่าน offline (M5 · docs/01 §Static export)
 *
 * ทุก doc ผ่าน pipeline เดียวกับ `doku render` (resolve → sanitize → asset rewrite → …) แล้ว rewrite
 * URL ภายในให้ relative · คัดลอก asset ทั้งหมดตาม path เดิม · เขียน `index.html` รายการเอกสาร ·
 * **ไม่ลบไฟล์เดิมใน `--out`** (เขียนทับเฉพาะไฟล์ที่ generate เอง — ไม่มีคำสั่งลบจาก CLI)
 */
async function commandBuild(args: ParsedArgs): Promise<number> {
  const outFlag = args.flags.get("out")
  if (typeof outFlag !== "string" || outFlag.trim() === "") {
    throw new CommandFailure(
      "usage",
      "ต้องระบุโฟลเดอร์ output: doku build --out <dir> [--vault <dir>]",
      2,
    )
  }
  const outRoot = resolvePath(outFlag)
  const vault = await openVault(args.flags.get("vault"))
  const listing = await walkVault(vault.fs)
  const index = buildDocIndex(listing.docs)
  const known = new Set(listing.docs)

  const built: { id: string; title: string }[] = []
  for (const id of listing.docs) {
    const resolved = await resolveDoc(id, vault.fs, { vaultName: vault.vaultName })
    const result = await renderMarkdown(resolved.body, {
      docId: resolved.id,
      meta: resolved.meta,
      vault: { fs: vault.fs, index, hasDoc: (doc) => known.has(doc) },
      warnings: resolved.warnings,
    })
    const dir = dirname(resolved.id)
    const html = rewriteOffline(result.html, dir === "." ? "" : dir)
    const page = renderPreviewPage({
      title: result.meta.title ?? resolved.id,
      docId: resolved.id,
      meta: result.meta,
      html,
      toc: result.toc,
      warnings: result.warnings,
    })
    await Bun.write(join(outRoot, `${resolved.id}.html`), page)
    built.push({ id: resolved.id, title: result.meta.title ?? resolved.id })
  }

  // asset = คัดลอก bytes ตาม path เดิม (หลัง rewriteURL ชี้แบบ relative มาที่ไฟล์เหล่านี้)
  let copied = 0
  for (const asset of listing.assets) {
    const bytes = await vault.fs.readBytes(asset)
    if (!bytes) continue
    await Bun.write(join(outRoot, asset), bytes)
    copied += 1
  }

  const items = [...built]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (item) =>
        `<li><a href="${escapeHtmlText(item.id)}.html">${escapeHtmlText(item.title)}</a>` +
        ` <code>${escapeHtmlText(item.id)}</code></li>`,
    )
    .join("")
  const indexHtml = `<h1>doku export</h1><ul>${items}</ul>`
  const indexPage = renderPreviewPage({
    title: "doku export",
    docId: "index",
    meta: defaultMeta("index"),
    html: indexHtml,
    toc: [],
    warnings: [],
  })
  const indexFile = join(outRoot, "index.html")
  await Bun.write(indexFile, indexPage)

  if (args.flags.has("json")) {
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        out: outRoot,
        docs: built.length,
        assets: copied,
        index: indexFile,
      })}\n`,
    )
    return 0
  }
  process.stdout.write(
    `export แล้ว: ${outRoot} (${built.length} เอกสาร · ${copied} assets · เปิด ${indexFile})\n`,
  )
  return 0
}

if (import.meta.main) {
  process.exit(await main())
}
