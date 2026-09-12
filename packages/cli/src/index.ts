#!/usr/bin/env bun
/**
 * `doku` CLI — M0: `render` + `check` (คำสั่งอื่นตาม docs/05 ทยอยเพิ่มใน M1–M5)
 *
 * ทุกคำสั่งสำคัญมี `--json` ให้ agent parse
 */

import { basename, resolve as resolvePath } from "node:path"
import {
  buildDocIndex,
  checkVault,
  countByLevel,
  defaultMeta,
  type Meta,
  MetaSchema,
  renderMarkdown,
  resolveDoc,
  resolveInline,
  type VaultFs,
  type Warning,
  walkVault,
} from "@doku/core"
import { createNodeVaultFs } from "@doku/fs-node"
import { loadKatexCss } from "./preview/katex-css.ts"
import { renderPreviewPage } from "./preview/page.ts"

const VERSION = "0.0.0"
const VALUE_FLAGS = new Set(["vault", "out", "meta"])

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

export function usage(): string {
  return `doku — document hub (M0)

คำสั่ง:
  doku render <path>            render เอกสาร → HTML (stdout)
  doku render --stdin           render markdown จาก stdin (stateless)
  doku check [path]             validate vault / เอกสาร

ตัวเลือก:
  --vault <dir>     vault root (default: $DOKU_VAULT หรือ ./vault)
  --fragment        render เฉพาะ HTML fragment (ไม่ห่อ layout)
  --json            ผลลัพธ์เป็น JSON (ให้ agent parse)
  --out <file>      เขียนผลลัพธ์ลงไฟล์แทน stdout
  --meta <file>     meta.json สำหรับโหมด --stdin
  --strict          (check) ให้ warning ทำให้ exit code ≠ 0
  -h, --help        แสดง help
  -v, --version     แสดงเวอร์ชัน

ตัวอย่าง:
  doku render projects/doku/design > out.html
  doku render --vault examples/vault projects/doku/design --out /tmp/design.html
  echo '# hi' | doku render --stdin --fragment
  doku check --vault examples/vault --json
`
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  let args: ParsedArgs
  try {
    args = parseArgs(argv)
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n\n${usage()}`)
    return 2
  }

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
      default:
        process.stderr.write(`ไม่รู้จักคำสั่ง: ${args.command}\n\n${usage()}`)
        return 2
    }
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n`)
      return 2
    }
    process.stderr.write(`error: ${(error as Error).message}\n`)
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

if (import.meta.main) {
  process.exit(await main())
}
