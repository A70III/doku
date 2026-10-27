/** หน้า trash — แยกจาก pages.tsx (ไม่เปลี่ยนพฤติกรรม) */

import { type TrashItem } from "@doku/core"
import type { FC } from "hono/jsx"
import type { TreeNode } from "../../tree.ts"
import { Layout } from "./layout.tsx"
import { formatBytes, formatDateTime, Icon } from "./shared.tsx"
import { Sidebar } from "./sidebar.tsx"

export const TrashPage: FC<{
  tree: TreeNode[]
  items: TrashItem[]
  trashCount?: number
}> = ({ tree, items, trashCount }) => (
  <Layout title="trash — doku">
    <div class="doku-shell">
      <Sidebar tree={tree} activeId="__trash__" trashCount={trashCount} />
      <main class="doku-main">
        <header class="mb-6 border-b border-(--d-border) pb-5">
          <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <div>
              <h1 class="text-2xl font-semibold tracking-tight text-(--k-text)">Trash</h1>
              <p class="mt-1 text-sm text-(--d-text-muted)">
                ลบ = ย้ายมาไว้ที่นี่ (กู้ได้เสมอ) · ล้างอัตโนมัติหลัง 30 วัน
              </p>
            </div>
            {items.length > 0 ? (
              <button
                type="button"
                class="doku-btn doku-btn-danger"
                data-action="empty-trash"
                data-count={items.length}
              >
                <Icon name="octagon-alert" size={14} /> ล้างถาวรทั้งหมด
              </button>
            ) : null}
          </div>
        </header>

        {items.length === 0 ? (
          <p class="text-sm text-(--d-text-subtle)">ว่าง — ไม่มีอะไรถูกลบ</p>
        ) : (
          <ul class="doku-trash-list">
            {items.map((item) => (
              <li class="doku-trash-row" data-trash-id={item.id}>
                <span class="doku-trash-icon">
                  <Icon
                    name={
                      item.kind === "folder"
                        ? "folder"
                        : item.kind === "asset"
                          ? "image"
                          : "file-text"
                    }
                    size={15}
                  />
                </span>
                <span class="doku-trash-main">
                  <span class="doku-trash-label">{item.label}</span>
                  <span class="doku-trash-meta">
                    {item.kind} · {formatDateTime(item.deletedAt)} · {formatBytes(item.bytes)}
                  </span>
                </span>
                <button
                  type="button"
                  class="doku-btn"
                  data-action="restore"
                  data-trash-id={item.id}
                >
                  <Icon name="undo-2" size={14} /> กู้คืน
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  </Layout>
)

/* ── not found ───────────────────────────────────────────────────────── */
