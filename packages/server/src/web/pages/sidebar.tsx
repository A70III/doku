/** rail + tree + row menu — แยกจาก pages.tsx (ไม่เปลี่ยนพฤติกรรม) */

import { docUrl, HEX_COLOR_PATTERN, hasIcon, type LucideIconName } from "@doku/core"
import type { FC } from "hono/jsx"
import type { TreeNode } from "../../tree.ts"
import { getSiteName } from "../site.ts"

import { Icon } from "./shared.tsx"

const TreeRowMenu: FC<{
  kind: "doc" | "folder"
  path: string
  label: string
}> = ({ kind, path, label }) => (
  <button
    type="button"
    class="doku-row-menu"
    data-action="row-menu"
    data-kind={kind}
    data-path={path}
    data-label={label}
    aria-label={`ตัวเลือก: ${label}`}
    title="ตัวเลือก"
  >
    <Icon name="more-horizontal" size={14} />
  </button>
)

const TreeDocRow: FC<{ node: { id: string; title: string }; activeId?: string }> = ({
  node,
  activeId,
}) => {
  const active = activeId === node.id
  return (
    <li class="doku-row" data-doc-id={node.id} draggable="true">
      <a
        href={docUrl(node.id)}
        class={`doku-row-link ${active ? "is-active" : ""}`}
        title={node.title}
        aria-current={active ? "page" : undefined}
        data-doc-link={node.id}
      >
        {node.title}
      </a>
      <TreeRowMenu kind="doc" path={node.id} label={node.title} />
    </li>
  )
}

/** จำนวนเอกสารใต้โฟลเดอร์ (นับรวม subfolder) — แสดงท้ายแถวเพื่อบอกขนาด */
const countDocs = (node: { children: TreeNode[] }): number =>
  node.children.reduce((total, child) => total + (child.type === "doc" ? 1 : countDocs(child)), 0)

const TreeFolder: FC<{
  node: {
    path: string
    name: string
    title?: string
    icon?: string
    color?: string
    order?: number
    collapsed?: boolean
    children: TreeNode[]
  }
  activeId?: string
}> = ({ node, activeId }) => {
  const label = node.title ?? node.name
  const icon: LucideIconName = hasIcon(node.icon) ? node.icon : "folder"
  const color = node.color && HEX_COLOR_PATTERN.test(node.color) ? node.color : undefined
  return (
    <li
      class="doku-row doku-row-folder"
      data-folder-path={node.path}
      data-folder-title={node.title}
      data-folder-icon={hasIcon(node.icon) ? node.icon : undefined}
      data-folder-color={color}
      data-folder-order={node.order}
      draggable="true"
    >
      <details class="tree" data-tree={node.path} open={!node.collapsed}>
        <summary
          class="doku-folder-summary"
          data-drop-folder={node.path}
          title={`${label} — ลากเอกสารมาวางเพื่อย้าย`}
        >
          <span class="tree-caret text-(--d-text-subtle)" aria-hidden="true">
            ▸
          </span>
          <span class="doku-folder-icon" {...(color ? { style: { color } as never } : {})}>
            <Icon name={icon} size={14} />
          </span>
          <span class="doku-folder-name truncate">{label}</span>
          <span class="doku-rail-count" aria-hidden="true">
            {countDocs(node)}
          </span>
          <TreeRowMenu kind="folder" path={node.path} label={label} />
        </summary>
        <ul class="doku-tree-children">
          {node.children.map((child) =>
            child.type === "folder" ? (
              <TreeFolder key={child.path} node={child} activeId={activeId} />
            ) : (
              <TreeDocRow key={child.id} node={child} activeId={activeId} />
            ),
          )}
        </ul>
      </details>
    </li>
  )
}

export const Sidebar: FC<{
  tree: TreeNode[]
  activeId?: string
  trashCount?: number
}> = ({ tree, activeId, trashCount = 0 }) => (
  <aside class="doku-rail">
    <div class="doku-rail-head">
      <a href="/" class="block no-underline">
        <span class="block text-sm font-semibold tracking-tight text-(--k-text)">
          {getSiteName()}
        </span>
        <span class="mt-0.5 block truncate font-(family-name:--d-font-mono) text-xs text-(--d-text-subtle)">
          {countDocs({ children: tree })} เอกสาร
        </span>
      </a>
      <div class="doku-rail-actions">
        <button
          type="button"
          class="doku-icon-btn"
          data-action="new-doc"
          data-dir=""
          title="เอกสารใหม่"
          aria-label="เอกสารใหม่"
        >
          <Icon name="file-plus-2" />
        </button>
        <button
          type="button"
          class="doku-icon-btn"
          data-action="new-folder"
          data-dir=""
          title="โฟลเดอร์ใหม่"
          aria-label="โฟลเดอร์ใหม่"
        >
          <Icon name="folder-plus" />
        </button>
      </div>
    </div>

    <button type="button" class="doku-search-trigger" data-action="palette">
      <Icon name="search" size={14} />
      <span>ค้นหา / คำสั่ง</span>
      <kbd data-palette-key>Ctrl K</kbd>
    </button>

    <nav aria-label="แผนผังเอกสาร" class="doku-rail-tree">
      {tree.length === 0 ? (
        <p class="doku-rail-empty">
          vault ว่าง — กด <Icon name="file-plus-2" size={12} /> เพื่อเริ่มเอกสารแรก
        </p>
      ) : (
        <ul class="doku-tree" data-drop-root="true">
          {tree.map((node) =>
            node.type === "folder" ? (
              <TreeFolder key={node.path} node={node} activeId={activeId} />
            ) : (
              <TreeDocRow key={node.id} node={node} activeId={activeId} />
            ),
          )}
        </ul>
      )}
    </nav>

    <div class="doku-rail-foot">
      <a
        href="/styleguide"
        class={`doku-rail-link ${activeId === "__styleguide__" ? "is-active" : ""}`}
        aria-current={activeId === "__styleguide__" ? "page" : undefined}
      >
        <Icon name="list-checks" size={14} /> styleguide
      </a>
      <a
        href="/trash"
        class={`doku-rail-link ${activeId === "__trash__" ? "is-active" : ""}`}
        aria-current={activeId === "__trash__" ? "page" : undefined}
      >
        <Icon name="trash-2" size={14} /> trash
        {trashCount > 0 ? <span class="doku-rail-count">{trashCount}</span> : null}
      </a>
      <button type="button" class="doku-rail-link" data-action="cycle-theme">
        <Icon name="sun" size={14} /> ธีม
      </button>
    </div>
  </aside>
)

/* ── doc page (reading room) ─────────────────────────────────────────── */

/** TOC แบบคอลัมน์ — render จาก `doc.toc` (M3.1: ไม่ได้อยู่ใน fragment อีกต่อไป) */
