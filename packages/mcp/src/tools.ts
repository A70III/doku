/**
 * เครื่องมือ MCP ทั้ง 12 ตัวของ doku — ครบตาราง docs/05 §4 (`doc_search` เติมตอน M5 S3)
 *
 * หลักการของ docs/05 §4: "tool น้อย, ชื่อตรง, input แบน" — ชื่อและ key ของ input ตรงกับ
 * ตารางเป๊ะ (lock ด้วย `test/server.test.ts`) · **ไม่มี tool ลบถาวร/purge/restore** เด็ดขาด
 * (docs/06: ลบถาวร = คนเท่านั้น · `doc_delete` = soft-delete เข้า `.trash/` เท่านั้น)
 *
 * `inputSchema` เขียนเป็น JSON Schema แบนตามตาราง — ต้นแบบของ contract คือ docs/05 §4
 * (ไม่มี Zod schema ของ tool input อยู่ที่ไหนใน repo → ไม่มี source ที่สองให้ drift)
 * ส่วน `meta` ที่รับมา validate ด้วย `MetaSchema` ของ core เสมอ (Zod = single source · plan §4 #8)
 *
 * เขียน vault ผ่าน guard ของ `vault.ts` เท่านั้น — path ผ่าน `normalizeVaultPath` + `safeJoin`
 * ของ adapter · atomic write ของ adapter · revision ก่อนทับ/ย้าย/ลบ · asset checks ด้วย
 * `isSafeAssetName`/`assetMimeOf` ตัวเดียวกับ REST (mirror `packages/server/src/api.ts` · plan §4 #4)
 */

import { resolve as resolvePath } from "node:path"
import {
  assetMimeOf,
  assetUrl,
  BLOCK_COLORS,
  BLOCKS,
  basenameOf,
  buildDocIndex,
  CALLOUT_TYPES,
  checkVault,
  dirnameOf,
  isSafeAssetName,
  isSafeVaultPath,
  loadMeta,
  META_KNOWN_KEYS,
  type Meta,
  MetaSchema,
  moveDoc,
  renderMarkdown,
  resolveDoc,
  resolveInline,
  resolveWikiTarget,
  scanMarkdown,
  shortHash,
  type Warning,
  walkVault,
  warning,
} from "@doku/core"
import { createSearchIndexStore, logAudit } from "@doku/fs-node"
import {
  currentEtag,
  docPath,
  ensureMdSize,
  jsonSidecar,
  type McpDeps,
  mergeShallowObjects,
  optionalBoolean,
  optionalMeta,
  optionalString,
  parseJsonObject,
  requireEnum,
  requireString,
  saveRevision,
  saveRevisions,
  ToolError,
  validateMeta,
} from "./vault.ts"

/** 25 MB ต่อ asset (docs/05 agent policy) — ค่าเดียวกับ `ASSET_MAX_BYTES` ของ REST (api.ts) */
const MAX_ASSET_BYTES = 25 * 1024 * 1024

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolSpec {
  definition: ToolDefinition
  handle(deps: McpDeps, args: Record<string, unknown>): Promise<Record<string, unknown>>
}

/** โครงสร้างย่อยของผลลัพธ์ (JS object ล้วน — validate ด้วย Zod ตอนรับเข้า ไม่ประกาศ type ซ้ำ) */
interface DocListEntry {
  id: string
  title: string
  tags: string[]
  pinned: boolean
  order?: number
  status: Meta["status"]
  created?: string
  mtimeMs: number
  bytes: number
}

interface TreeFolderNode {
  type: "folder"
  name: string
  path: string
  children: TreeNode[]
}

interface TreeDocNode {
  type: "doc"
  name: string
  path: string
  title: string
}

type TreeNode = TreeFolderNode | TreeDocNode

/* ── โครงตัวอย่างของ `template_get` ────────────────────────────────────── */

const TEMPLATE_MD = `# ชื่อเอกสาร

สรุปสั้น ๆ ว่าเอกสารนี้พูดถึงอะไร

## หัวข้อแรก

เนื้อหาของหัวข้อ — เรียก block ได้ด้วย \`:::name\` เช่น callout:

:::note{title="หมายเหตุ"}
ข้อความสำคัญที่ควรเห็น
:::

## หัวข้อสอง

- รายการหนึ่ง
- รายการสอง
`

const TEMPLATE_META: Record<string, unknown> = {
  title: "ชื่อเอกสาร",
  tags: [],
  status: "active",
}

/* ── helpers ใช้ร่วม ───────────────────────────────────────────────────── */

/** สร้าง sidecar ใหม่จาก meta input ที่ผ่าน validate แล้ว */
function sidecarOf(meta: Record<string, unknown>): string {
  validateMeta(meta)
  return jsonSidecar(meta)
}

/** tree ของ `folder_list` — เดินจาก `fs.list` (ข้าม dotfile/dotfolder อยู่แล้ว · invariant 9) */
async function listNodes(deps: McpDeps, dir: string): Promise<TreeNode[]> {
  const nodes: TreeNode[] = []
  for (const entry of await deps.fs.list(dir)) {
    const path = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.type === "dir") {
      nodes.push({ type: "folder", name: entry.name, path, children: await listNodes(deps, path) })
      continue
    }
    // sidebar parity: tree มีแค่โฟลเดอร์ + เอกสาร — asset กับ sidecar ไม่ขึ้น
    if (!entry.name.endsWith(".md")) continue
    const id = path.slice(0, -3)
    const { meta } = await loadMeta(deps.fs, id, null)
    nodes.push({ type: "doc", name: basenameOf(id), path: id, title: meta.title ?? basenameOf(id) })
  }
  return nodes
}

/** ข้อความของ fence problem — ข้อความเดียวกับ `describeFenceProblem` ใน core (ไม่ถูก export) */
function fenceMessage(problem: {
  kind: "unclosed" | "stray" | "ambiguous-nesting"
  name?: string
  line: number
  parent?: string
}): string {
  if (problem.kind === "unclosed") {
    return `block :::${problem.name} (บรรทัด ${problem.line}) เปิดแล้วไม่ปิด`
  }
  if (problem.kind === "stray") {
    return `พบ \`:::\` ที่ไม่มี block ให้ปิด (บรรทัด ${problem.line})`
  }
  return `block :::${problem.name} (บรรทัด ${problem.line}) ซ้อนใน :::${problem.parent} ด้วย \`:::\` ยาวเท่ากัน/ยาวกว่า — ให้เขียนชั้นนอกด้วย \`::::\` ที่ยาวกว่า`
}

function fenceCode(kind: "unclosed" | "stray" | "ambiguous-nesting"): Warning["code"] {
  if (kind === "unclosed") return "block_unclosed"
  if (kind === "stray") return "block_stray_fence"
  return "block_nesting_ambiguous"
}

/* ── 11 tools (docs/05 §4 — ลำดับและชื่อตามตาราง) ─────────────────────── */

export const TOOL_SPECS: readonly ToolSpec[] = [
  {
    definition: {
      name: "doc_list",
      description:
        "รายการ metadata ของเอกสารทั้ง vault (เรียงใหม่ → เก่า) — กรองด้วย folder (prefix), tag, q (ค้นจาก path/title) ได้",
      inputSchema: {
        type: "object",
        properties: {
          folder: { type: "string", description: "list เฉพาะเอกสารใต้โฟลเดอร์นี้" },
          tag: { type: "string", description: "list เฉพาะเอกสารที่มี tag นี้" },
          q: { type: "string", description: "ค้นจาก path หรือ title (case-insensitive)" },
        },
        additionalProperties: false,
      },
    },
    async handle(deps, args) {
      const folderRaw = optionalString(args, "folder")
      const tag = optionalString(args, "tag")
      const q = optionalString(args, "q")
      const folderId = folderRaw ? docPath(deps, folderRaw, false) : undefined

      const { docs } = await walkVault(deps.fs)
      const items: DocListEntry[] = []
      for (const id of docs) {
        if (folderId !== undefined && id !== folderId && !id.startsWith(`${folderId}/`)) continue
        const { meta } = await loadMeta(deps.fs, id, null)
        if (tag !== undefined && !meta.tags.includes(tag)) continue
        const title = meta.title ?? basenameOf(id)
        if (q !== undefined) {
          const needle = q.toLowerCase()
          if (!id.toLowerCase().includes(needle) && !title.toLowerCase().includes(needle)) continue
        }
        const stat = deps.fs.stat ? await deps.fs.stat(`${id}.md`).catch(() => null) : null
        items.push({
          id,
          title,
          tags: meta.tags,
          pinned: meta.pinned,
          order: meta.order,
          status: meta.status,
          created: meta.created,
          mtimeMs: stat?.mtimeMs ?? 0,
          bytes: stat?.size ?? 0,
        })
      }
      items.sort((a, b) => b.mtimeMs - a.mtimeMs)
      return { ok: true, docs: items }
    },
  },

  {
    definition: {
      name: "doc_read",
      description:
        "อ่านเอกสาร 1 ตัว — format 'md' = markdown ต้นฉบับ + meta + etag · format 'html' = HTML fragment ที่ render แล้ว (มี warnings)",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "path ของเอกสาร (จาก vault root ตัด .md)" },
          format: { type: "string", enum: ["md", "html"], description: "md หรือ html" },
        },
        required: ["path", "format"],
        additionalProperties: false,
      },
    },
    async handle(deps, args) {
      const id = docPath(deps, requireString(args, "path"))
      const format = requireEnum(args, "format", ["md", "html"] as const)
      const current = await currentEtag(deps, id)
      if (!current) throw new ToolError("not_found", `ไม่พบเอกสาร: ${id}`)

      if (format === "md") {
        const metaRaw = await deps.fs.readText(`${id}.meta.json`)
        return {
          ok: true,
          path: id,
          md: current.md,
          meta: current.meta,
          meta_raw: metaRaw,
          etag: current.etag,
        }
      }

      const resolved = await resolveDoc(id, deps.fs, { vaultName: deps.vaultName })
      const listing = await walkVault(deps.fs)
      const index = buildDocIndex(listing.docs)
      const known = new Set(listing.docs)
      const result = await renderMarkdown(resolved.body, {
        docId: resolved.id,
        meta: resolved.meta,
        vault: { fs: deps.fs, index, hasDoc: (doc) => known.has(doc) },
        warnings: [...resolved.warnings],
      })
      return {
        ok: true,
        path: id,
        html: result.html,
        meta: result.meta,
        warnings: result.warnings,
        etag: current.etag,
      }
    },
  },

  {
    definition: {
      name: "doc_write",
      description:
        "เขียนเอกสาร — mode 'create' ต้องยังไม่มี · 'replace' ทับทั้งไฟล์ (ต้องมีอยู่แล้ว) · 'patch' ทับ md + merge meta แบบ shallow (ต้องมีอยู่แล้ว) · ก่อนทับจะเก็บ revision เสมอ (doku restore กู้ได้)",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "path ของเอกสาร (จาก vault root ตัด .md)" },
          md: { type: "string", description: "markdown เนื้อหาใหม่" },
          meta: { type: "object", description: "meta.json (ไม่ส่ง = ไม่แตะ sidecar เดิม)" },
          mode: { type: "string", enum: ["create", "replace", "patch"], description: "โหมดเขียน" },
        },
        required: ["path", "md", "mode"],
        additionalProperties: false,
      },
    },
    async handle(deps, args) {
      const id = docPath(deps, requireString(args, "path"))
      const md = requireString(args, "md")
      const mode = requireEnum(args, "mode", ["create", "replace", "patch"] as const)
      const meta = optionalMeta(args)
      ensureMdSize(md)

      const hasDoc = await deps.fs.exists(`${id}.md`)
      if (mode === "create") {
        if (hasDoc || (await deps.fs.exists(`${id}.meta.json`)) || (await deps.fs.exists(id))) {
          throw new ToolError("already_exists", `มีอยู่แล้ว: ${id}`)
        }
      } else if (!hasDoc) {
        throw new ToolError("not_found", `ไม่พบเอกสาร: ${id}`)
      }

      // validate meta ทั้งหมด "ก่อน" เขียนอะไรทั้งคู่ — พลาด = ไม่มีไฟล์/revision หลุด (แบบ REST)
      let sidecar: string | null = null
      if (meta) {
        if (mode === "patch") {
          const merged = mergeShallowObjects(
            parseJsonObject(await deps.fs.readText(`${id}.meta.json`)),
            meta,
          )
          sidecar = sidecarOf(merged)
        } else {
          sidecar = sidecarOf(meta)
        }
      }

      if (mode !== "create") await saveRevision(deps, id)
      await deps.fs.writeText(`${id}.md`, md)
      if (sidecar !== null) await deps.fs.writeText(`${id}.meta.json`, sidecar)

      const next = await currentEtag(deps, id)
      logAudit(
        {
          actor: "mcp",
          action: mode === "create" ? "doc.create" : "doc.update",
          path: id,
          etag: next?.etag,
        },
        deps.varDir,
      )
      return { ok: true, path: id, mode, etag: next?.etag ?? "" }
    },
  },

  {
    definition: {
      name: "doc_move",
      description:
        "ย้ายเอกสารจาก from ไป to — อัปเดตลิงก์ทั้ง vault + เขียน relations.moved_from ให้ (update_links default = true)",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "path เดิม" },
          to: { type: "string", description: "path ใหม่" },
          update_links: {
            type: "boolean",
            description: "อัปเดตลิงก์ที่ชี้ไปยัง path เดิม (default true)",
          },
        },
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
    async handle(deps, args) {
      const from = docPath(deps, requireString(args, "from"))
      const to = docPath(deps, requireString(args, "to"))
      const updateLinks = optionalBoolean(args, "update_links") ?? true
      const result = await moveDoc(deps.fs, from, to, {
        updateLinks,
        beforeMove: (ids) => saveRevisions(deps, ids),
      })
      logAudit({ actor: "mcp", action: "doc.move", path: result.from, to: result.to }, deps.varDir)
      return { ok: true, ...result }
    },
  },

  {
    definition: {
      name: "doc_delete",
      description:
        "ลบเอกสาร = soft-delete เท่านั้น — ย้ายเข้า vault/.trash/ (กู้ได้เสมอผ่านเว็บ/CLI) · ไม่มีการลบถาวรจาก agent (docs/06)",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "path ของเอกสารที่จะลบ" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    async handle(deps, args) {
      const id = docPath(deps, requireString(args, "path"))
      if (!(await deps.fs.exists(`${id}.md`))) {
        throw new ToolError("not_found", `ไม่พบเอกสาร: ${id}`)
      }
      await saveRevision(deps, id)
      const item = await deps.fs.trashStore().put([`${id}.md`, `${id}.meta.json`], {
        label: id,
        kind: "doc",
      })
      logAudit({ actor: "mcp", action: "doc.delete", path: id }, deps.varDir)
      return { ok: true, path: id, trash: item }
    },
  },

  {
    definition: {
      name: "folder_create",
      description: "สร้างโฟลเดอร์ (รวมโฟลเดอร์แม่) — มีอยู่แล้ว = already_exists",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "path ของโฟลเดอร์ที่จะสร้าง" },
        },
        required: ["path"],
        additionalProperties: false,
      },
    },
    async handle(deps, args) {
      const path = docPath(deps, requireString(args, "path"), false)
      if ((await deps.fs.exists(path)) || (await deps.fs.exists(`${path}.md`))) {
        throw new ToolError("already_exists", `มีอยู่แล้ว: ${path}`)
      }
      await deps.fs.mkdir(path)
      logAudit({ actor: "mcp", action: "folder.create", path }, deps.varDir)
      return { ok: true, path }
    },
  },

  {
    definition: {
      name: "folder_list",
      description:
        "โครงสร้างโฟลเดอร์/เอกสารเป็น tree (โฟลเดอร์ก่อน แล้วเรียงตามชื่อ · ไม่รวม dotfile/.trash) — path ว่าง = ทั้ง vault",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "โฟลเดอร์ตั้งต้น (ไม่ส่ง = root ของ vault)" },
        },
        additionalProperties: false,
      },
    },
    async handle(deps, args) {
      const raw = optionalString(args, "path")
      const base = raw ? docPath(deps, raw, false) : ""
      if (base) {
        const { folders } = await walkVault(deps.fs)
        if (!folders.includes(base)) throw new ToolError("not_found", `ไม่พบโฟลเดอร์: ${base}`)
      }
      const tree = await listNodes(deps, base)
      return { ok: true, path: base, tree }
    },
  },

  {
    definition: {
      name: "doc_search",
      description:
        "ค้นเอกสารเต็มรูปแบบ (FTS trigram จาก var/index.db — substring ไทย/อังกฤษ ทั้งชื่อและเนื้อหา) คืน hits พร้อม snippet",
      inputSchema: {
        type: "object",
        properties: {
          q: { type: "string", description: "คำค้น" },
          limit: { type: "number", description: "จำนวนผลสูงสุด (default 20 · cap 100)" },
        },
        required: ["q"],
        additionalProperties: false,
      },
    },
    async handle(deps, args) {
      const q = requireString(args, "q").trim()
      if (q === "") return { ok: true, query: q, count: 0, hits: [] }
      let limit: number | undefined
      if (args.limit !== undefined) {
        if (typeof args.limit !== "number" || !Number.isFinite(args.limit)) {
          throw new ToolError("invalid_body", "limit ต้องเป็นตัวเลข")
        }
        limit = Math.trunc(args.limit)
      }
      // sync incremental ก่อนค้น (เทียบ hash — ไฟล์เดิมถูกข้าม) — server ไม่ได้เปิดก็ค้นได้
      const store = createSearchIndexStore(resolvePath(process.env.DOKU_VAR ?? "var"))
      try {
        await store.syncFull(deps.fs)
        const hits = store.search(q, { limit })
        return { ok: true, query: q, count: hits.length, hits }
      } finally {
        store.close()
      }
    },
  },

  {
    definition: {
      name: "doc_render",
      description:
        "render markdown เป็น HTML fragment (stateless — ยัง resolve wikilink/asset กับ vault ได้) + warnings · meta ที่ส่งมาใช้แทน frontmatter",
      inputSchema: {
        type: "object",
        properties: {
          md: { type: "string", description: "markdown ต้นฉบับ (มี frontmatter ได้)" },
          meta: { type: "object", description: "meta ที่จะใช้แทน frontmatter" },
        },
        required: ["md"],
        additionalProperties: false,
      },
    },
    async handle(deps, args) {
      const md = requireString(args, "md")
      ensureMdSize(md)
      const meta = optionalMeta(args)
      if (meta) validateMeta(meta)

      const inline = resolveInline(md, "untitled")
      const listing = await walkVault(deps.fs)
      const index = buildDocIndex(listing.docs)
      const known = new Set(listing.docs)
      const result = await renderMarkdown(inline.body, {
        docId: inline.id,
        meta: meta ? MetaSchema.parse(meta) : inline.meta,
        vault: { fs: deps.fs, index, hasDoc: (doc) => known.has(doc) },
        warnings: meta ? [] : [...inline.warnings],
      })
      return { ok: true, html: result.html, meta: result.meta, warnings: result.warnings }
    },
  },

  {
    definition: {
      name: "doc_validate",
      description:
        "ตรวจความถูกต้อง — แบบ {path} = ตรวจเอกสารเดียวใน vault (เท่ากับ doku check <path>) · แบบ {md, meta} = ตรวจเนื้อหาแบบ stateless · คืน errors/warnings",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "ตรวจเอกสารที่มีอยู่ใน vault (รูปแบบที่ 1)" },
          md: { type: "string", description: "ตรวจเนื้อหา md (รูปแบบที่ 2 — คู่กับ meta)" },
          meta: { type: "object", description: "meta ที่ตรวจคู่กับ md" },
        },
        anyOf: [{ required: ["path"] }, { required: ["md", "meta"] }],
        additionalProperties: false,
      },
    },
    async handle(deps, args) {
      const pathRaw = optionalString(args, "path")
      if (pathRaw !== undefined) {
        const id = docPath(deps, pathRaw)
        const report = await checkVault(deps.fs, { path: id, vaultName: deps.vaultName })
        const doc = report.docs[0] ?? null
        return {
          ok: report.ok,
          path: id,
          errors: report.errors,
          warnings: report.warnings,
          doc,
        }
      }

      const md = requireString(args, "md")
      const metaInput = optionalMeta(args)
      const errors: Warning[] = []
      const warnings: Warning[] = []
      const bytes = new TextEncoder().encode(md).byteLength
      if (bytes > 5 * 1024 * 1024) {
        warnings.push(
          warning(
            "md_too_large",
            `md ใหญ่กว่า limit (${bytes} > ${5 * 1024 * 1024} bytes)`,
            "warning",
          ),
        )
      }

      // meta: ส่งมา = validate ตรง ๆ · ไม่ส่ง = อ่านจาก frontmatter (meta_invalid = error เหมือน doku check)
      const inline = resolveInline(md, "untitled")
      let title: string | undefined
      if (metaInput) {
        const parsed = MetaSchema.safeParse(metaInput)
        if (!parsed.success) {
          errors.push(
            warning(
              "meta_invalid",
              `meta ไม่ผ่าน schema ที่ ${parsed.error.issues
                .map((issue) => issue.path.join(".") || "(root)")
                .join(", ")}`,
              "error",
            ),
          )
        } else {
          title = parsed.data.title
        }
        for (const key of Object.keys(metaInput)) {
          if (!META_KNOWN_KEYS.has(key)) {
            warnings.push(
              warning("meta_unknown_field", `meta มี field ที่ระบบไม่รู้จัก: ${key}`, "warning", {
                field: key,
              }),
            )
          }
        }
      } else {
        for (const item of inline.warnings) {
          errors.push({ ...item, level: item.code === "meta_invalid" ? "error" : item.level })
        }
        if (inline.metaSource !== "default") title = inline.meta.title
      }

      const scan = scanMarkdown(inline.body, "untitled")
      const firstHeading = scan.headings.find((heading) => heading.depth === 1)
      if (!title && !firstHeading) {
        warnings.push(warning("missing_title", "เอกสารไม่มี title (ทั้ง meta และ h1)", "warning"))
      }

      for (const block of scan.blocks) {
        if (!block.known) {
          errors.push(
            warning("block_unknown", `block ที่ไม่รู้จัก: :::${block.name}`, "error", {
              field: block.name,
            }),
          )
        } else if (!block.implemented) {
          warnings.push(
            warning("block_unimplemented", `block :::${block.name} ยังไม่รองรับ (M2)`, "info", {
              field: block.name,
            }),
          )
        }
      }
      for (const problem of scan.fenceProblems) {
        errors.push(
          warning(fenceCode(problem.kind), fenceMessage(problem), "error", { field: problem.name }),
        )
      }

      const listing = await walkVault(deps.fs)
      const knownDocs = new Set(listing.docs)
      const knownAssets = new Set(listing.assets)
      const index = buildDocIndex(listing.docs)

      for (const link of scan.links) {
        if (link.kind === "unsafe") {
          errors.push(
            warning("asset_path_unsafe", `path หลุด vault หรือไม่ปลอดภัย: ${link.raw}`, "error", {
              field: link.raw,
            }),
          )
          continue
        }
        if (!link.resolved) continue
        if (link.kind === "doc") {
          const target = link.resolved.slice(0, -3)
          if (!knownDocs.has(target)) {
            errors.push(
              warning("link_broken", `ลิงก์ไปเอกสารที่ไม่มีอยู่: ${target}`, "error", {
                field: link.raw,
              }),
            )
          }
          continue
        }
        if (!knownAssets.has(link.resolved)) {
          errors.push(
            warning("asset_missing", `asset ไม่มีอยู่จริง: ${link.resolved}`, "error", {
              field: link.raw,
            }),
          )
        }
      }

      for (const target of new Set(scan.wikilinks)) {
        const resolved = resolveWikiTarget(index, target)
        const candidates = target.includes("/") ? [] : (index.get(target) ?? [])
        if (!resolved.id) {
          errors.push(
            warning("wikilink_missing", `wikilink [[${target}]] หาไม่เจอ`, "error", {
              field: target,
            }),
          )
        } else if (resolved.ambiguous && candidates.length > 1) {
          warnings.push(
            warning(
              "wikilink_ambiguous",
              `wikilink [[${target}]] ซ้ำ ${candidates.length} ไฟล์ — เลือก ${candidates[0]}`,
              "warning",
              { field: target },
            ),
          )
        }
      }

      return { ok: errors.length === 0, errors, warnings }
    },
  },

  {
    definition: {
      name: "asset_put",
      description:
        "วาง asset ลง vault — ตำแหน่ง <โฟลเดอร์ของเอกสาร path>/assets/<filename> (ตรงกับ REST upload · put = เขียนทับได้) · filename ต้องผ่าน charset ของ docs/06 + นามสกุลต้องอยู่ใน allowlist · คืน url พร้อม ?h=hash",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "path ของเอกสารเป้าหมาย (asset ไปอยู่ข้าง ๆ เอกสารนี้)",
          },
          filename: { type: "string", description: "ชื่อไฟล์ (เช่น diagram.png)" },
          content_base64: { type: "string", description: "เนื้อไฟล์ base64" },
        },
        required: ["path", "filename", "content_base64"],
        additionalProperties: false,
      },
    },
    async handle(deps, args) {
      const id = docPath(deps, requireString(args, "path"))
      const filename = requireString(args, "filename")
      const contentBase64 = requireString(args, "content_base64")

      if (!isSafeAssetName(filename)) {
        throw new ToolError("path_invalid", `ชื่อไฟล์ไม่ผ่าน charset ของ asset (docs/06): ${filename}`)
      }
      const mime = assetMimeOf(filename)
      if (!mime) {
        throw new ToolError("asset_type_rejected", `นามสกุลไม่อยู่ใน allowlist: ${filename}`)
      }
      const compact = contentBase64.replace(/\s+/g, "")
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(compact) || compact.length % 4 !== 0) {
        throw new ToolError("invalid_body", "`content_base64` ไม่ใช่ base64 ที่ถูกต้อง")
      }
      const bytes = new Uint8Array(Buffer.from(compact, "base64"))
      if (bytes.byteLength > MAX_ASSET_BYTES) {
        throw new ToolError("too_large", `ไฟล์ใหญ่กว่า limit ${MAX_ASSET_BYTES} bytes`)
      }

      const dir = dirnameOf(id)
      const target = dir ? `${dir}/assets/${filename}` : `assets/${filename}`
      // กันซ้ำอีกชั้น: filename ที่ผ่าน charset อาจทำให้ segment เป็น dotfile ได้ (invariant 9)
      if (!isSafeVaultPath(target)) throw new ToolError("path_invalid", `path ไม่ปลอดภัย: ${target}`)

      await deps.fs.writeBytes(target, bytes)
      logAudit({ actor: "mcp", action: "asset.upload", path: target }, deps.varDir)
      return {
        ok: true,
        path: id,
        assets: [
          {
            path: target,
            url: assetUrl(target, await shortHash(bytes)),
            bytes: bytes.byteLength,
            content_type: mime,
          },
        ],
      }
    },
  },

  {
    definition: {
      name: "template_get",
      description:
        "โครงตัวอย่างเอกสารใหม่ + block schema (ชุดเดียวกับ GET /api/schema — จาก block registry ของ core): colors, variants, blocks พร้อม example",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    async handle() {
      return {
        ok: true,
        template: { md: TEMPLATE_MD, meta: TEMPLATE_META },
        schema: {
          colors: BLOCK_COLORS,
          variants: CALLOUT_TYPES,
          blocks: BLOCKS.filter((block) => block.implemented).map((block) => ({
            name: block.name,
            kind: block.kind,
            attributes: block.attributes,
            values: block.values,
            example: block.example,
          })),
        },
      }
    },
  },
]

/** ชื่อ tool ตามลำดับที่ `tools/list` ตอบ — ครบ 12 ตัวตามตาราง docs/05 §4 */
export function toolDefinitions(): ToolDefinition[] {
  return TOOL_SPECS.map((spec) => spec.definition)
}

const SPEC_BY_NAME = new Map(TOOL_SPECS.map((spec) => [spec.definition.name, spec]))

export function hasTool(name: string): boolean {
  return SPEC_BY_NAME.has(name)
}

/** เรียก tool 1 ตัว — error ที่หลุดออกมาถูก map เป็น `{ok:false, error}` โดย server */
export async function callTool(
  deps: McpDeps,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const spec = SPEC_BY_NAME.get(name)
  if (!spec) throw new ToolError("not_found", `ไม่รู้จัก tool: ${name}`)
  return spec.handle(deps, args)
}
