/**
 * ชนิดข้อมูลกลางของ custom block (docs/03 Part A + Extension registry)
 *
 * หลักการที่ผูกไว้ (hard invariant ของโปรเจกต์):
 * - **block renderer คืน hast element ไม่ใช่ HTML string** → ทุก node ที่เราสร้างยังต้องผ่าน
 *   rehype-sanitize เหมือนเนื้อหาที่ AI เขียน (docs/06 "sanitize เสมอ")
 * - สไตล์อิง **data attribute** (`data-block` / `data-variant` / `data-*`) ไม่ใช้ inline `style`
 *   → CSS ยิงด้วย `[data-block="…"][data-variant="…"]` (docs/03 §3)
 */

import type { Element, ElementContent } from "hast"
import type { WarningCode, WarningLevel } from "../types.ts"

export type DirectiveKind = "container" | "leaf" | "text"

/** node ที่ `remarkDokuDirectives` สร้าง แล้ว `remark-rehype` แปลงต่อผ่าน handler */
export interface DokuDirectiveNode {
  type: "dokuBlock" | "dokuInline"
  name: string
  attributes: Record<string, string>
  children: unknown[]
}

export interface BlockContext {
  /** attribute ที่ผ่านการ trim + validate ค่าแล้ว */
  attrs: Record<string, string>
  /** เนื้อในที่แปลงเป็น hast แล้ว (block-level สำหรับ container, phrasing สำหรับ inline) */
  children: ElementContent[]
  /** mdast node ดิบ — block ที่อ่านโครงสร้างเอง (kv / timeline / stats) ใช้ */
  node: DokuDirectiveNode
  /** path id ของเอกสาร (ว่าง = inline/stdin) */
  docId: string
  warn(code: WarningCode, message: string, level?: WarningLevel): void
}

export interface BlockDefinition {
  name: string
  kind: DirectiveKind
  /** true = มี renderer จริง → ไม่ปล่อย warning `block_unimplemented` อีก */
  implemented: boolean
  /** ชื่อ attribute ที่รู้จัก — นอกเหนือจากนี้ = `block_attribute_unknown` (info, ignore) */
  attributes: readonly string[]
  /** ค่าที่อนุญาตต่อ attribute (allowlist) — ค่าอื่น = เตือน + ไม่ใช้ */
  values: Record<string, readonly string[]>
  render(ctx: BlockContext): Element | null
  /** ตัวอย่าง md ของ block นี้ — ใช้ที่ `/styleguide` และ (M4) `/api/schema` */
  example: string
}

/** สี allowlist ของ mark/badge/callout (docs/03) */
export const BLOCK_COLORS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
] as const

/** สร้าง hast element แบบสั้น — properties ใช้ camelCase ตาม hast (`dataBlock` → `data-block`) */
export function h(
  tagName: string,
  properties: Record<string, unknown> = {},
  children: ElementContent[] = [],
): Element {
  return { type: "element", tagName, properties: properties as Element["properties"], children }
}

/** ข้อความล้วน (escape ตอน stringify ให้เอง — ไม่ต้อง escape ที่นี่) */
export function t(value: string): ElementContent {
  return { type: "text", value }
}

/** element ของ block พร้อม `data-block` ให้ CSS อ้างได้เสมอ */
export function blockElement(
  tagName: string,
  name: string,
  properties: Record<string, unknown>,
  children: ElementContent[],
): Element {
  return h(tagName, { ...properties, dataBlock: name }, children)
}

/** boolean attribute (`{zoom}` / `{zoom=true}`) — ค่าที่ไม่ใช่ true = false */
export function flag(attrs: Record<string, string>, key: string): boolean {
  if (!(key in attrs)) return false
  const value = attrs[key]
  return value === "" || value === "true" || value === "1" || value === "yes"
}

/**
 * เนื้อในของ block ที่ **ไม่ได้ใช้ children** (figure · video · progress · section divider · tabs)
 * — ห้ามทิ้ง: เตือน `block_stray_child` แล้วให้ผู้เรียกเอา children ไปแสดงต่อท้าย
 * หลักการเดียวกับ "ปิด/ผิดไม่ทำข้อมูลหาย" (docs/08 ข้อ 60/61 · ข้อ 68)
 */
export function warnStrayChildren(
  ctx: BlockContext,
  count = ctx.children.length,
  message = `เนื้อหาใน :::${ctx.node.name} ไม่ได้เป็นส่วนของ block นี้ — แสดงต่อท้ายให้ (ไม่ทิ้ง)`,
): void {
  if (count === 0) return
  ctx.warn("block_stray_child", message, "warning")
}

/** เตือน (ถ้ามีเนื้อใน) แล้วคืน children ให้ผู้เรียกต่อท้าย */
export function strayChildren(ctx: BlockContext): ElementContent[] {
  warnStrayChildren(ctx)
  return ctx.children
}

/** สีที่อยู่ใน allowlist — ค่าอื่นคืน undefined */
export function colorAttr(value: string | undefined): string | undefined {
  return value && (BLOCK_COLORS as readonly string[]).includes(value) ? value : undefined
}

/** ตัวเลข 0–100 จาก attribute — ค่าไม่ถูกต้อง = null (ผู้เรียกเป็นคนเตือน) */
export function intAttr(value: string | undefined, min: number, max: number): number | null {
  if (value === undefined) return null
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return parsed >= min && parsed <= max ? parsed : null
}

/** อ่านข้อความล้วนจาก mdast node (kv/steps/timeline ต้องใช้ก่อน remark-rehype) */
export function mdastText(node: unknown): string {
  const candidate = node as { value?: string; children?: unknown[]; type?: string }
  // `break` (soft line break ที่ `remarkBreaks` แยกออกมา) ไม่มี value — ต้องคืน "\n"
  // ไม่งั้นข้อความจาก block ที่อ่านเป็นบรรทัด (kv · steps · tabs) จะยุบติดกัน
  if (candidate?.type === "break") return "\n"
  if (typeof candidate?.value === "string") return candidate.value
  if (!Array.isArray(candidate?.children)) return ""
  const separator = candidate.type === "paragraph" || candidate.type === "heading" ? "" : "\n"
  return candidate.children.map((child) => mdastText(child)).join(separator)
}
