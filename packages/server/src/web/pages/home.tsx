/** หน้าแรก (section ต่อโฟลเดอร์ · tag · sort) — แยกจาก pages.tsx (ไม่เปลี่ยนพฤติกรรม) */

import { docUrl, encodeVaultUrl, HEX_COLOR_PATTERN, hasIcon, type LucideIconName } from "@doku/core"
import type { Child, FC } from "hono/jsx"
import type { DocSummary, TreeNode } from "../../tree.ts"
import { groupDocsByDate, parseSort, type SortKey, sortDocs } from "../listing.ts"
import { getSiteName } from "../site.ts"
import { Layout } from "./layout.tsx"
import { formatDate, Icon } from "./shared.tsx"
import { Sidebar } from "./sidebar.tsx"

type FolderNode = Extract<TreeNode, { type: "folder" }>

const DocRow: FC<{ doc: DocSummary; showPin?: boolean }> = ({ doc, showPin }) => {
  const hasMeta = doc.status !== "active" || doc.tags.length > 0
  const title = (
    <span class="min-w-0 truncate font-medium text-(--k-text) transition-colors group-hover:text-(--d-accent)">
      {doc.title}
    </span>
  )
  return (
    <a
      href={docUrl(doc.id)}
      class="group block border-b border-(--d-border) py-3 no-underline last:border-b-0"
    >
      <div class="flex items-baseline justify-between gap-4">
        {showPin && doc.pinned ? (
          <span class="flex min-w-0 items-baseline gap-1.5">
            <span class="shrink-0 text-(--d-text-subtle)">
              <Icon name="pin" size={12} />
              <span class="sr-only">ปักหมุด</span>
            </span>
            {title}
          </span>
        ) : (
          title
        )}
        <span class="shrink-0 text-xs text-(--d-text-subtle) tabular-nums">
          {formatDate(doc.mtimeMs)}
        </span>
      </div>
      {hasMeta ? (
        // `data-row-meta="tags-only"` = แถวนี้มีแต่แท็ก → ซ่อนทั้งแถวตอนปิดแท็ก
        // (ไม่ปล่อยเหลืองานว่างสูง 2px) · `status` เป็นสถานะ ไม่ใช่แท็ก → ไม่ถูกซ่อน
        <div
          class="mt-0.5 flex flex-wrap items-baseline gap-x-4 text-xs text-(--d-text-muted)"
          {...(doc.status === "active" ? { "data-row-meta": "tags-only" } : {})}
        >
          {doc.status !== "active" ? (
            <span class="text-(--d-text-subtle)">{doc.status}</span>
          ) : null}
          <span data-row-tags class="flex flex-wrap gap-x-4">
            {doc.tags.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </span>
        </div>
      ) : null}
    </a>
  )
}

/**
 * ปุ่มเปิด/ปิดแท็กของหน้าแรก (docs/08 ข้อ 85)
 *
 * - โชว์เฉพาะหน้าแรกที่ยัง**ไม่ได้กรอง**ด้วย `?tag=` — ถ้ากรองอยู่ แถวแท็กคือทางออก
 *   ของตัวเอง (ลิงก์กดแล้วกลับ `/`) ซ่อนทิ้ง = คนค้างในหน้าที่กรองไว้
 * - ไม่โชว์เมื่อ vault ไม่มีแท็กเลย — ไม่มี chrome ตาย
 * - `aria-expanded` + `aria-controls` = disclosure จริงตาม ARIA · ป้ายสลับโดย client
 * - ปิด JS = ยังโชว์แท็กครบ (SSR ค่าเริ่มต้น = เปิด) — progressive enhancement
 */
const TagsToggle: FC = () => (
  <button
    type="button"
    class="doku-btn doku-tag-toggle"
    data-action="toggle-tags"
    aria-expanded="true"
    aria-controls="doku-tag-filter"
  >
    <Icon name="tag" size={12} />
    <span data-tags-label>ซ่อนแท็ก</span>
  </button>
)

/** หัว section — masthead บาง ๆ + hairline ใต้ + ตัวเลข tabular (docs/03 Part B · Digital Archivist) */
const SectionHead: FC<{ count: number; right?: Child; children: Child }> = ({
  count,
  right,
  children,
}) => (
  <div class="mb-1.5 flex items-baseline justify-between gap-4 border-b border-(--d-border) pb-1.5">
    <h2 class="flex min-w-0 items-baseline gap-2 text-sm font-medium text-(--k-text)">
      {children}
      <span class="shrink-0 text-xs font-normal text-(--d-text-subtle) tabular-nums">{count}</span>
    </h2>
    {right ? <div class="flex shrink-0 items-baseline gap-3">{right}</div> : null}
  </div>
)

/** ตัวเลือกเรียงของ flat list — label ตรงกับ whitelist `?sort=` ใน `listing.ts` (3.5.4) */
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "mtime", label: "วันที่" },
  { key: "name", label: "ชื่อ" },
  { key: "size", label: "ขนาด" },
]

const SortControl: FC<{ active: SortKey; hrefFor: (key: SortKey) => string }> = ({
  active,
  hrefFor,
}) => (
  <nav aria-label="เรียงลำดับ" class="flex items-baseline gap-3 text-xs">
    {SORT_OPTIONS.map((option) => {
      const isActive = option.key === active
      return (
        <a
          key={option.key}
          href={hrefFor(option.key)}
          aria-current={isActive ? "true" : undefined}
          class={`no-underline transition-colors ${
            isActive
              ? "font-medium text-(--d-accent)"
              : "text-(--d-text-muted) hover:text-(--d-accent)"
          }`}
        >
          {option.label}
        </a>
      )
    })}
  </nav>
)

/** ลำดับแถวใน section โฟลเดอร์ — mirror sidebar tree: pinned → order → ชื่อ (th) */
function folderRowOrder(a: DocSummary, b: DocSummary): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  if (a.order !== undefined && b.order !== undefined && a.order !== b.order)
    return a.order - b.order
  if (a.order !== undefined) return -1
  if (b.order !== undefined) return 1
  return a.title.localeCompare(b.title, "th")
}

/**
 * section ต่อ top-level folder (3.5.1) — header: ไอคอน tint ด้วยสีโฟลเดอร์ + ชื่อ (fallback = ชื่อโฟลเดอร์)
 * + จำนวนแถว tabular + ลิงก์ "ทั้งหมด →" ไปหน้าโฟลเดอร์ · เนื้อหา = แถว catalogue ของ doc ที่อยู่ในโฟลเดอร์นั้น
 * (หมุดแสดงเป็นไอคอน pin เล็ก ๆ — "pin ข้างใน" ตาม plan 3.5.1)
 */
const FolderSection: FC<{ folder: FolderNode; docs: DocSummary[] }> = ({ folder, docs }) => {
  const label = folder.title ?? folder.name
  const icon: LucideIconName = hasIcon(folder.icon) ? folder.icon : "folder"
  const color = folder.color && HEX_COLOR_PATTERN.test(folder.color) ? folder.color : undefined
  return (
    <section class="mb-12" data-home-section="folder" data-home-folder={folder.path}>
      <SectionHead
        count={docs.length}
        right={
          <a
            href={encodeVaultUrl("/d", folder.path)}
            class="flex items-baseline gap-1 text-xs text-(--d-text-muted) no-underline transition-colors hover:text-(--d-accent)"
          >
            ทั้งหมด
            <Icon name="arrow-right" size={12} />
          </a>
        }
      >
        <span
          class={color ? "shrink-0 self-center" : "shrink-0 self-center text-(--d-text-subtle)"}
          {...(color ? { style: { color } as never } : {})}
        >
          <Icon name={icon} size={14} />
        </span>
        <span class="min-w-0 truncate">{label}</span>
      </SectionHead>
      {docs.map((doc) => (
        <DocRow key={doc.id} doc={doc} showPin />
      ))}
    </section>
  )
}

export const HomePage: FC<{
  tree: TreeNode[]
  docs: DocSummary[]
  tag?: string
  /** `?sort=` ดิบจาก query string — whitelist ผ่าน `parseSort` (ค่าอื่น/ไม่ส่ง = `mtime`) */
  sort?: string
  trashCount?: number
}> = ({ tree, docs, tag, sort, trashCount }) => {
  const tagCounts = new Map<string, number>()
  for (const doc of docs) {
    for (const item of doc.tags) tagCounts.set(item, (tagCounts.get(item) ?? 0) + 1)
  }
  const allTags = [...tagCounts.keys()].sort()

  const filtered = tag ? docs.filter((doc) => doc.tags.includes(tag)) : docs

  /**
   * single-appearance — doc แต่ละตัวปรากฏในรายการบ้านของตัวเอง exactly once:
   * - อยู่ "โดยตรง" ใน top-level folder → section ของโฟลเดอร์นั้น (plan 3.5.1)
   * - ที่เหลือ (root + ซับโฟลเดอร์ลึกกว่าชั้นบน) → flat list · หมุด → section ปักหมุด
   * flat list จึงเป็น complement ของ folder sections — ไม่มี doc หาย
   * (ข้อยกเว้นเดียว = section "ล่าสุด" ด้านล่าง — highlight ตั้งใจซ้ำเพื่อคงพฤติกรรมเดิม)
   */
  const folderNodes = tree.filter((node): node is FolderNode => node.type === "folder")
  const docsByFolder = new Map<string, DocSummary[]>(folderNodes.map((folder) => [folder.path, []]))
  const looseDocs: DocSummary[] = []
  for (const doc of filtered) {
    const slash = doc.id.indexOf("/")
    if (slash < 0) {
      looseDocs.push(doc)
      continue
    }
    const bucket = docsByFolder.get(doc.id.slice(0, slash))
    const nested = doc.id.slice(slash + 1).includes("/")
    if (bucket && !nested) bucket.push(doc)
    else looseDocs.push(doc)
  }

  const pinned = looseDocs.filter((doc) => doc.pinned)
  const rest = looseDocs.filter((doc) => !doc.pinned)
  const sortKey = parseSort(sort)
  const groups = groupDocsByDate(sortDocs(rest, sortKey))

  /**
   * ล่าสุด — section เดิมของหน้าแรกคงไว้ (ticket 02: keep pinned/recent/tag sections):
   * 8 เอกสารใหม่สุดจากชุดที่กรองแล้ว · ไม่รวมหมุด · mtime desc เสมอ (ไม่ผูก `?sort=` —
   * "ล่าสุด" แปลตามเวลา) · ยอมซ้ำกับ section โฟลเดอร์/flat list เพราะเป็น highlight ผิวบน
   */
  const recent = sortDocs(
    filtered.filter((doc) => !doc.pinned),
    "mtime",
  ).slice(0, 8)

  /** ลิงก์ sort — คง query ที่มีอยู่ (เช่น `?tag=`) แล้วแทนที่ `?sort=` เฉย ๆ */
  const sortHref = (key: SortKey): string => {
    const params = new URLSearchParams()
    if (tag) params.set("tag", tag)
    params.set("sort", key)
    return `/?${params.toString()}`
  }

  const heading = tag ? `#${tag}` : "ทุกเอกสาร"
  const stats = tag ? `${filtered.length} เอกสาร` : `${docs.length} เอกสาร · ${allTags.length} แท็ก`

  return (
    <Layout title={tag ? `${getSiteName()} · #${tag}` : getSiteName()}>
      <div class="doku-shell">
        <Sidebar tree={tree} trashCount={trashCount} />
        <main class="doku-main">
          <header class="mb-10 border-b border-(--d-border) pb-6">
            <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h1 class="text-2xl font-semibold tracking-tight text-(--k-text)">{heading}</h1>
              <div class="flex items-baseline gap-4">
                <p class="text-sm text-(--d-text-muted) tabular-nums">{stats}</p>
                {/* ไม่กรองแท็กอยู่ + vault มีแท็ก = ปุ่มมีที่ใช้ประโยชน์ (ข้อ 85) */}
                {!tag && allTags.length > 0 ? <TagsToggle /> : null}
              </div>
            </div>
          </header>

          {allTags.length > 0 ? (
            <div
              id="doku-tag-filter"
              data-tag-filter
              class="doku-tag-filter mb-10 flex flex-wrap items-baseline gap-x-5 gap-y-2 text-sm"
            >
              <span class="text-(--d-text-subtle)">แท็ก</span>
              {allTags.map((item) => {
                const active = item === tag
                return (
                  <a
                    key={item}
                    href={active ? "/" : `/?tag=${encodeURIComponent(item)}`}
                    class={`no-underline transition-colors ${
                      active
                        ? "font-medium text-(--d-accent)"
                        : "text-(--d-text-muted) hover:text-(--d-accent)"
                    }`}
                  >
                    {item}
                    <span class="ml-1 text-xs text-(--d-text-subtle) tabular-nums">
                      {tagCounts.get(item)}
                    </span>
                  </a>
                )
              })}
            </div>
          ) : null}

          {pinned.length > 0 ? (
            <section class="mb-12" data-home-section="pinned">
              <SectionHead count={pinned.length}>ปักหมุด</SectionHead>
              {pinned.map((doc) => (
                <DocRow key={doc.id} doc={doc} />
              ))}
            </section>
          ) : null}

          {recent.length > 0 ? (
            <section class="mb-12" data-home-section="recent">
              <SectionHead count={recent.length}>ล่าสุด</SectionHead>
              {recent.map((doc) => (
                <DocRow key={doc.id} doc={doc} />
              ))}
            </section>
          ) : null}

          {folderNodes.map((folder) => {
            const rows = (docsByFolder.get(folder.path) ?? []).sort(folderRowOrder)
            // ตอนกรองแท็ก = โชว์เฉพาะโฟลเดอร์ที่มีผลลัพธ์ · ไม่กรอง = โชว์ทุกโฟลเดอร์
            // (นับ 0 ก็โชว์ header — โฟลเดอร์เปล่า/ที่มีแต่ของซับโฟลเดอร์ยังมีค่าตอนจะเข้าไปดู)
            if (tag && rows.length === 0) return null
            return <FolderSection key={folder.path} folder={folder} docs={rows} />
          })}

          {groups.length > 0 ? (
            <section class="mb-12" data-home-section="flat">
              <SectionHead
                count={rest.length}
                right={<SortControl active={sortKey} hrefFor={sortHref} />}
              >
                ทั้งหมด
              </SectionHead>
              {groups.map((group, index) => (
                <div key={group.key} data-date-group={group.key}>
                  <h3
                    class={`text-xs font-medium text-(--d-text-subtle) ${
                      index === 0 ? "mb-1.5" : "mt-6 mb-1.5 border-t border-(--d-border) pt-1.5"
                    }`}
                  >
                    {group.label} <span class="tabular-nums">{group.docs.length}</span>
                  </h3>
                  {group.docs.map((doc) => (
                    <DocRow key={doc.id} doc={doc} />
                  ))}
                </div>
              ))}
            </section>
          ) : null}

          {filtered.length === 0 ? (
            <p class="text-sm text-(--d-text-subtle)">
              {tag ? `ไม่มีเอกสารที่มีแท็ก #${tag}` : "ยังไม่มีเอกสารใน vault นี้"}
            </p>
          ) : null}
        </main>
      </div>
    </Layout>
  )
}

/* ── trash ───────────────────────────────────────────────────────────── */
