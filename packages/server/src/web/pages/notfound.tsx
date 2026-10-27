/** หน้า 404 — แยกจาก pages.tsx (ไม่เปลี่ยนพฤติกรรม) */

import type { FC } from "hono/jsx"
import type { TreeNode } from "../../tree.ts"

import { Layout } from "./layout.tsx"
import { Sidebar } from "./sidebar.tsx"

export const NotFoundPage: FC<{
  tree: TreeNode[]
  kind: "doc" | "asset" | "route"
  path?: string
  trashCount?: number
}> = ({ tree, kind, path, trashCount }) => {
  const message =
    kind === "doc"
      ? `ไม่พบเอกสาร${path ? `: ${path}` : ""}`
      : kind === "asset"
        ? `ไม่พบ asset${path ? `: ${path}` : ""}`
        : "ไม่พบหน้าที่ขอ"
  return (
    <Layout title="404 — doku">
      <div class="doku-shell">
        <Sidebar tree={tree} trashCount={trashCount} />
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
