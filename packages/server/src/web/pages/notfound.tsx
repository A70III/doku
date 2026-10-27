/** หน้า 404 — แยกจาก pages.tsx (ไม่เปลี่ยนพฤติกรรม) */

import {
  docUrl,
  encodeVaultUrl,
  HEX_COLOR_PATTERN,
  hasIcon,
  ICON_NAMES,
  iconSvg,
  type LucideIconName,
  type Meta,
  type TocEntry,
  type TrashItem,
} from "@doku/core"
import type { Child, FC } from "hono/jsx"
import type { CachedDoc } from "../../cache.ts"
import type { DocSummary, TreeNode } from "../../tree.ts"
import { groupDocsByDate, parseSort, type SortKey, sortDocs } from "../listing.ts"

import { Layout } from "./layout.tsx"
import { Sidebar } from "./sidebar.tsx"

export const NotFoundPage: FC<{
  tree: TreeNode[]
  vaultName: string
  kind: "doc" | "asset" | "route"
  path?: string
  trashCount?: number
}> = ({ tree, vaultName, kind, path, trashCount }) => {
  const message =
    kind === "doc"
      ? `ไม่พบเอกสาร${path ? `: ${path}` : ""}`
      : kind === "asset"
        ? `ไม่พบ asset${path ? `: ${path}` : ""}`
        : "ไม่พบหน้าที่ขอ"
  return (
    <Layout title="404 — doku">
      <div class="doku-shell">
        <Sidebar tree={tree} vaultName={vaultName} trashCount={trashCount} />
        <main class="doku-main">
          <div class="max-w-[var(--k-measure)]">
            <p class="font-(family-name:--d-font-mono) text-sm text-(--d-text-subtle)">404</p>
            <p class="mt-1 text-(--d-text-muted)">{message}</p>
            <a href="/" class="mt-4 inline-block text-sm text-(--d-accent) underline">
              กลับหน้าแรก
            </a>
          </div>
        </main>
      </div>
    </Layout>
  )
}

/* ── styleguide (docs/03 §9) — render ทุก block ให้คน + AI ดู ────────────── */
