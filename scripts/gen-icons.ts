#!/usr/bin/env bun
/**
 * gen-icons.ts — สร้าง `packages/core/src/icons/lucide.ts` จาก `lucide-static`
 *
 * docs/08 ข้อ 34: vendor subset เข้า repo (ห้าม CDN / ห้ามโหลดทั้งชุด / ห้าม icon font)
 * - lucide-static เป็น devDependency เท่านั้น (ไม่มี runtime dep)
 * - รัน: `bun add -d lucide-static && bun run gen:icons && bun remove lucide-static`
 *   (หรือ `bun run gen:icons` ถ้ามี node_modules/lucide-static อยู่แล้ว)
 *
 * เพิ่มไอคอน = เติมชื่อใน ICON_NAMES แล้วรันใหม่ (ชื่อต้องตรงกับไฟล์ใน lucide-static/icons)
 */

import { resolve } from "node:path"

/** ไอคอนที่ใช้จริงในโปรเจกต์ — เติมได้ตามต้องการ (ชื่อไฟล์ใน lucide-static) */
const ICON_NAMES = [
  // chrome / navigation
  "file-text",
  "folder",
  "folder-open",
  "folder-plus",
  "folder-tree",
  "file-plus-2",
  "folder-pen",
  "chevron-right",
  "chevron-down",
  "arrow-left",
  "arrow-right",
  "external-link",
  "house",
  "list",
  "search",
  "command",
  "corner-down-left",
  "panel-left",
  "panel-left-close",
  "panel-left-open",
  "maximize-2",
  "minimize-2",
  "type",
  "link",
  "image",
  "upload",
  // actions
  "plus",
  "pencil",
  "save",
  "trash-2",
  "undo-2",
  "rotate-ccw",
  "x",
  "check",
  "move",
  "grip-vertical",
  "more-horizontal",
  "eraser",
  "zoom-in",
  // meta / state
  "tag",
  "pin",
  "pin-off",
  "clock",
  "calendar",
  "history",
  "ban",
  "sparkles",
  "palette",
  // theme
  "sun",
  "moon",
  "monitor",
  "settings-2",
  // blocks
  "info",
  "circle-check",
  "circle-help",
  "triangle-alert",
  "octagon-alert",
  "lightbulb",
  "quote",
  "list-checks",
  "chart-column",
] as const

const root = resolve(import.meta.dir, "..")
const iconsDir = resolve(root, "node_modules/lucide-static/icons")
const outFile = resolve(root, "packages/core/src/icons/lucide.ts")

const packageFile = Bun.file(resolve(root, "node_modules/lucide-static/package.json"))
if (!(await packageFile.exists())) {
  process.stderr.write("ไม่พบ node_modules/lucide-static — รัน `bun add -d lucide-static` ก่อน\n")
  process.exit(2)
}
const version = (JSON.parse(await packageFile.text()) as { version: string }).version

const warning = await Bun.file(resolve(root, "node_modules/lucide-static/LICENSE")).text()

const entries: string[] = []
for (const name of ICON_NAMES) {
  const file = Bun.file(resolve(iconsDir, `${name}.svg`))
  if (!(await file.exists())) {
    process.stderr.write(`ไม่พบไอคอน: ${name}\n`)
    process.exit(1)
  }
  const raw = await file.text()
  const inner = raw
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*\/>\s*/g, "/>")
    .replace(/\s*>\s*/g, ">")
    .trim()
  entries.push(`  ${JSON.stringify(name)}: ${JSON.stringify(inner)},`)
}

const output = `/**
 * Lucide icon subset (vendored) — docs/08 ข้อ 34
 *
 * ⚠️ ไฟล์นี้ generate จาก \`lucide-static@${version}\` ด้วย \`bun run gen:icons\`
 *    อย่าแก้ด้วยมือ — เติมชื่อไอคอนใน \`scripts/gen-icons.ts\` แล้วรันใหม่
 *
 * ความเป็นเจ้าของ/สิทธิ์: Lucide — ISC License
 *
 * ${warning
   .trim()
   .split("\n")
   .map((line) => (line.trim() ? ` * ${line.trimEnd()}` : " *"))
   .join("\n")}
 */

export const LUCIDE_VERSION = ${JSON.stringify(version)}

/** ชื่อไอคอน → inner markup ของ <svg viewBox="0 0 24 24"> (ไม่มี wrapper) */
export const LUCIDE_ICONS = {
${entries.join("\n")}
} as const

export type LucideIconName = keyof typeof LUCIDE_ICONS
`

await Bun.write(outFile, output)
process.stdout.write(`เขียน ${outFile} (${ICON_NAMES.length} icons, lucide-static@${version})\n`)
