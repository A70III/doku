/**
 * FolderPage — หน้าโฟลเดอร์ (M3.5 · plan 3.5.2 · ticket 06)
 *
 * เข้าถึงผ่าน `GET /d/*path` เมื่อ path ไม่มี `<path>.md` แต่มี node โฟลเดอร์ใน tree
 * (ticket 06 ข้อ 8c: `x/` + `x.md` อยู่คู่กัน → `/d/x` เปิดเอกสารเสมอ — doc wins)
 *
 * โครงหน้า (ticket 06 ข้อ 8a/8b — ยึด doku design, docs/03 Part B):
 * - header = masthead: breadcrumb + title (จาก `_folder.meta.json` fallback ชื่อโฟลเดอร์)
 *   + บรรทัดสถิติ — **ไม่มีปุ่ม action** (action อยู่ในเมนู `⋯` เดิม)
 * - body: ปักหมุด → โฟลเดอร์ย่อย → เอกสาร (เรียงตาม `?sort=` · default = จัดกลุ่มตามวันที่)
 * - แถว = catalogue row + hairline เหมือนหน้าแรก · ไม่มี card/gradient · ห้ามล้น 360px
 * - โฟลเดอร์ว่าง = บรรทัดเปล่าเงียบ ๆ บรรทัดเดียว
 *
 * invariant 9: ทุกข้อมูลมาจาก tree/state ที่ `walkVault` ข้าม dotfolder/`.trash` แล้ว
 *
 * ⚠️ สำเนาจากรายการของ `pages.tsx` (DocRow/SectionTitle/formatDate) — S2 เป็นเจ้าของ
 * pages.tsx และห้ามแก้ใน slice นี้ → duplicate นิดหน่อยไว้ก่อน (แจ้ง controller ให้
 * ย้ายไป shared module ทีหลังถ้าต้องการ)
 */

import { dirnameOf, docUrl, HEX_COLOR_PATTERN } from "@doku/core"
import type { Child, FC } from "hono/jsx"
import type { DocSummary, TreeFolder, TreeNode } from "../tree.ts"
import { groupDocsByDate, type SortKey, sortDocs } from "./listing.ts"
import { Icon, Layout, Sidebar } from "./pages.tsx"

/* ── helpers ─────────────────────────────────────────────────────────── */

/** หา node โฟลเดอร์จาก path — route เรียกตอน renderer throw `DocNotFoundError` */
export function findFolderNode(nodes: TreeNode[], path: string): TreeFolder | null {
  for (const node of nodes) {
    if (node.type !== "folder") continue
    if (node.path === path) return node
    const found = findFolderNode(node.children, path)
    if (found) return found
  }
  return null
}

/** วันที่แบบคลังเอกสาร — สำเนาจาก pages.tsx (`formatDate` ไม่ได้ export) */
function formatDate(mtimeMs: number): string {
  if (!mtimeMs) return ""
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(new Date(mtimeMs))
}

/* ── primitives (สำเนาจากหน้าแรก — ภาษาแถวร่วมกัน) ──────────────────── */

/** หัว section — ชื่อ + จำนวน (tabular) เหมือน SectionTitle ของหน้าแรก */
const SectionTitle: FC<{ children: Child; count: number }> = ({ children, count }) => (
  <h2 class="mb-1 flex items-baseline gap-2 text-sm font-medium text-(--k-text)">
    {children}
    <span class="text-xs font-normal text-(--d-text-subtle) tabular-nums">{count}</span>
  </h2>
)

/** แถวเอกสาร = catalogue row + hairline (สำเนาจาก DocRow ของหน้าแรก) */
const FolderDocRow: FC<{ doc: DocSummary }> = ({ doc }) => {
  const hasMeta = doc.status !== "active" || doc.tags.length > 0
  return (
    <a
      href={docUrl(doc.id)}
      class="group block border-b border-(--d-border) py-3 no-underline last:border-b-0"
    >
      <div class="flex items-baseline justify-between gap-4">
        <span class="min-w-0 truncate font-medium text-(--k-text) transition-colors group-hover:text-(--d-accent)">
          {doc.title}
        </span>
        <span class="shrink-0 text-xs text-(--d-text-subtle) tabular-nums">
          {formatDate(doc.mtimeMs)}
        </span>
      </div>
      {hasMeta ? (
        <div class="mt-0.5 flex flex-wrap items-baseline gap-x-4 text-xs text-(--d-text-muted)">
          {doc.status !== "active" ? (
            <span class="text-(--d-text-subtle)">{doc.status}</span>
          ) : null}
          {doc.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}
    </a>
  )
}

/** แถวโฟลเดอร์ย่อย — ชื่อ (+ tint ไอคอนจากสีโฟลเดอร์) + จำนวนเอกสาร + ลิงก์ `/d/…` */
const SubfolderRow: FC<{ node: TreeFolder; docs: DocSummary[] }> = ({ node, docs }) => {
  const label = node.title ?? node.name
  const count = docs.filter((doc) => dirnameOf(doc.id) === node.path).length
  const color = node.color && HEX_COLOR_PATTERN.test(node.color) ? node.color : undefined
  return (
    <a
      href={docUrl(node.path)}
      class="group flex items-center justify-between gap-4 border-b border-(--d-border) py-3 no-underline last:border-b-0"
    >
      <span class="flex min-w-0 items-center gap-2">
        <span
          class="doku-folder-icon inline-flex shrink-0"
          {...(color ? { style: { color } as never } : {})}
        >
          <Icon name="folder" size={14} />
        </span>
        <span class="truncate font-medium text-(--k-text) transition-colors group-hover:text-(--d-accent)">
          {label}
        </span>
      </span>
      <span class="shrink-0 text-xs text-(--d-text-subtle) tabular-nums">{count} เอกสาร</span>
    </a>
  )
}

/* ── breadcrumb + sort control ───────────────────────────────────────── */

/** breadcrumb: root (หน้าแรก) → บรรพบุรุษเป็นลิงก์ `/d/…` → ชื่อปัจจุบันเป็นข้อความเปล่า */
const Breadcrumb: FC<{ path: string; vaultName: string }> = ({ path, vaultName }) => {
  const segments = path.split("/")
  const current = segments[segments.length - 1] ?? path
  const crumbs: Child[] = [
    <a
      key="root"
      href="/"
      class="text-(--d-text-subtle) no-underline transition-colors hover:text-(--d-accent)"
    >
      {vaultName || "doku"}
    </a>,
  ]
  for (let index = 0; index < segments.length - 1; index += 1) {
    const ancestor = segments.slice(0, index + 1).join("/")
    crumbs.push(
      <span key={`sep-${ancestor}`} aria-hidden="true" class="text-(--d-text-subtle)">
        /
      </span>,
      <a
        key={ancestor}
        href={docUrl(ancestor)}
        class="text-(--d-text-subtle) no-underline transition-colors hover:text-(--d-accent)"
      >
        {segments[index]}
      </a>,
    )
  }
  crumbs.push(
    <span key="sep-current" aria-hidden="true" class="text-(--d-text-subtle)">
      /
    </span>,
    <span key="current" aria-current="page" class="text-(--d-text-muted)">
      {current}
    </span>,
  )
  return (
    <nav aria-label="เส้นทาง" class="mb-2 flex flex-wrap items-baseline gap-x-1.5 text-xs">
      {crumbs}
    </nav>
  )
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "mtime", label: "วันที่" },
  { key: "name", label: "ชื่อ" },
  { key: "size", label: "ขนาด" },
]

/** แถบ sort เล็ก ๆ — SSR ผ่าน `?sort=` (ticket 05) · ตัวที่เลือกอยู่ = accent */
const SortControl: FC<{ path: string; sort: SortKey }> = ({ path, sort }) => (
  <nav aria-label="เรียงลำดับ" class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
    <span class="text-(--d-text-subtle)">เรียง</span>
    {SORT_OPTIONS.map((option) => {
      const active = option.key === sort
      return (
        <a
          key={option.key}
          href={`${docUrl(path)}?sort=${option.key}`}
          aria-current={active ? "true" : undefined}
          class={
            active
              ? "font-medium text-(--d-accent)"
              : "text-(--d-text-muted) no-underline transition-colors hover:text-(--d-accent)"
          }
        >
          {option.label}
        </a>
      )
    })}
  </nav>
)

/* ── page ────────────────────────────────────────────────────────────── */

export const FolderPage: FC<{
  folder: TreeFolder
  docs: DocSummary[]
  tree: TreeNode[]
  sort: SortKey
  vaultName: string
  trashCount?: number
}> = ({ folder, docs, tree, sort, vaultName, trashCount }) => {
  const path = folder.path
  const title = folder.title ?? folder.name
  // เอกสาร/โฟลเดอร์ย่อย = ลูกโดยตรง (นับตรงกับที่โชว์ในหน้า — ไม่รวมลึกกว่านั้น)
  const directDocs = docs.filter((doc) => dirnameOf(doc.id) === path)
  const subfolders = folder.children.filter((node): node is TreeFolder => node.type === "folder")

  // pipeline เดียว: sort ก่อน (มีผลทั้งปักหมุดและรายการ) → group ตามวันที่เมื่อ sort = วันที่
  // (sort ชื่อ/ขนาด ไม่จับกลุ่มวันที่ — ไม่งั้นลำดับที่คนเลือกจะถูกหัวข้อวันที่ฉีก)
  const sorted = sortDocs(directDocs, sort)
  const pinned = sorted.filter((doc) => doc.pinned)
  const rest = sorted.filter((doc) => !doc.pinned)
  const groups: { label: string; docs: DocSummary[] }[] =
    rest.length === 0
      ? []
      : sort === "mtime"
        ? groupDocsByDate(rest).map((group) => ({ label: group.label, docs: group.docs }))
        : [{ label: "ทั้งหมด", docs: rest }]
  const isEmpty = directDocs.length === 0 && subfolders.length === 0

  return (
    <Layout title={`${title} — doku`}>
      <div class="doku-shell">
        <Sidebar tree={tree} vaultName={vaultName} trashCount={trashCount} />
        <main class="doku-main">
          {/* masthead: breadcrumb + title + สถิติ — ไม่มีปุ่ม action (ticket 06 ข้อ 8b) */}
          <header class="mb-10 border-b border-(--d-border) pb-6">
            <Breadcrumb path={path} vaultName={vaultName} />
            <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h1 class="min-w-0 text-2xl font-semibold tracking-tight break-words text-(--k-text)">
                {title}
              </h1>
              <p class="text-sm text-(--d-text-muted) tabular-nums">
                {directDocs.length} เอกสาร · {subfolders.length} โฟลเดอร์ย่อย
              </p>
            </div>
          </header>

          {/* (i) ปักหมุด */}
          {pinned.length > 0 ? (
            <section class="mb-12">
              <SectionTitle count={pinned.length}>ปักหมุด</SectionTitle>
              {pinned.map((doc) => (
                <FolderDocRow key={doc.id} doc={doc} />
              ))}
            </section>
          ) : null}

          {/* (ii) โฟลเดอร์ย่อย — มาก่อนรายการเอกสาร (ticket 06 ข้อ 8a) */}
          {subfolders.length > 0 ? (
            <section class="mb-12">
              <SectionTitle count={subfolders.length}>โฟลเดอร์ย่อย</SectionTitle>
              {subfolders.map((node) => (
                <SubfolderRow key={node.path} node={node} docs={docs} />
              ))}
            </section>
          ) : null}

          {/* (iii) เอกสาร — default จัดกลุ่มตามวันที่ · `?sort=` อื่น = รายการแบน */}
          {rest.length > 0 ? (
            <section class="mb-12">
              <SortControl path={path} sort={sort} />
              {groups.map((group) => (
                <div key={group.label} class="mb-6 last:mb-0">
                  <SectionTitle count={group.docs.length}>{group.label}</SectionTitle>
                  {group.docs.map((doc) => (
                    <FolderDocRow key={doc.id} doc={doc} />
                  ))}
                </div>
              ))}
            </section>
          ) : null}

          {isEmpty ? (
            <p class="text-sm text-(--d-text-subtle)">โฟลเดอร์นี้ว่าง — ยังไม่มีอะไรข้างใน</p>
          ) : null}
        </main>
      </div>
    </Layout>
  )
}
