/**
 * Zod = single source of truth ของ schema ทั้งโปรเจกต์
 * - TS type มาจาก `z.infer` (ไม่ประกาศ type ซ้ำ — ตาม AGENTS.md)
 * - runtime validate ที่นี่
 * - `bun run gen:schema` ใช้ `z.toJSONSchema()` → `schema/` (ไม่ commit)
 *   (docs/08 ข้อ 12)
 */

import { z } from "zod"

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
/** tags: lowercase-kebab เท่านั้น (docs/02) */
export const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const AccentSchema = z.string().regex(HEX_COLOR_PATTERN, "ต้องเป็น hex สีแบบ #rrggbb")

export const AuthorSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["human", "ai"]).default("human"),
})

export const ThemeSchema = z.object({
  accent: AccentSchema.optional(),
  mode: z.enum(["auto", "light", "dark"]).default("auto"),
})

export const RenderSchema = z.object({
  toc: z.boolean().default(true),
  math: z.boolean().default(true),
  motion: z.boolean().default(true),
  diagram: z.boolean().default(true),
})

export const RelationsSchema = z.object({
  related: z.array(z.string()).default([]),
  moved_from: z.array(z.string()).default([]),
})

export const AgentSchema = z.object({
  last_editor: z.string().optional(),
  generated: z.boolean().default(false),
})

/**
 * `*.meta.json` sidecar (optional) — docs/02 field reference
 * ไม่มี `id` / `category` / `visibility` / `published` โดยเจตนา (path = id)
 */
export const MetaSchema = z.object({
  $schema: z.string().optional(),
  title: z.string().min(1).optional(),
  summary: z.string().max(280).optional(),
  tags: z.array(z.string().regex(TAG_PATTERN, "tag ต้องเป็น lowercase-kebab")).max(8).default([]),
  status: z.enum(["active", "draft", "archived"]).default("active"),
  created: z.iso.datetime({ offset: true }).optional(),
  authors: z.array(AuthorSchema).default([]),
  theme: ThemeSchema.default(() => ({ mode: "auto" as const })),
  render: RenderSchema.default(() => ({ toc: true, math: true, motion: true, diagram: true })),
  relations: RelationsSchema.default(() => ({ related: [], moved_from: [] })),
  agent: AgentSchema.optional(),
  pinned: z.boolean().default(false),
  order: z.number().optional(),
})

export type Meta = z.infer<typeof MetaSchema>

/** `_folder.meta.json` — object เดียวกันในไฟล์นี้ ไม่แยก schema ไฟล์ (docs/08 ข้อ 13) */
export const FolderMetaSchema = z.object({
  title: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
  color: AccentSchema.optional(),
  order: z.number().optional(),
  collapsed: z.boolean().optional(),
})

export type FolderMeta = z.infer<typeof FolderMetaSchema>

/** key ที่รู้จัก — ใช้ตรวจ unknown field (ค่าที่ไม่รู้จัก = ignore + เตือน) */
export const META_KNOWN_KEYS = new Set<string>([
  "$schema",
  "title",
  "summary",
  "tags",
  "status",
  "created",
  "authors",
  "theme",
  "render",
  "relations",
  "agent",
  "pinned",
  "order",
])

/** meta default ล้วน — ใช้เมื่อไม่มี sidecar (title เดาจากชื่อไฟล์) */
export function defaultMeta(docId: string): Meta {
  const name = docId.slice(docId.lastIndexOf("/") + 1)
  return MetaSchema.parse({ title: name })
}
