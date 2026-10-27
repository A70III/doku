#!/usr/bin/env bun
/**
 * sync-docs.ts — สำเนาเอกสาร `docs/*.md` ของ repo ไปไว้ใน vault เพื่ออ่านผ่าน doku
 *
 * ทำไม: เอกสารต้องอยู่รอดแม้ไม่มี repo/ไม่มี AI — อ่านได้ทั้งใน git และในหน้าเว็บ doku
 * - dry-run เป็นค่าเริ่มต้น · เขียนจริงเมื่อ `--apply`
 * - สร้าง `<vault>/projects/doku/manual/<ชื่อไฟล์เดิม>` + `<ชื่อ>.meta.json`
 * - เขียนทับเฉพาะไฟล์ที่เนื้อหาเปลี่ยน (idempotent) และไม่ลบไฟล์แปลกปลอมในโฟลเดอร์
 * - เนื้อหาที่ mirror จะถูกเติมบรรทัดกำกับว่า "แก้ที่ repo" และ rewrite ลิงก์ที่ชี้ข้ามโฟลเดอร์
 *
 * ใช้: bun run scripts/sync-docs.ts --vault <dir> [--folder <relative>] [--apply]
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, join, resolve as resolvePath } from "node:path"

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const flag = (name: string, fallback: string): string => {
  const index = args.indexOf(name)
  return index === -1 ? fallback : (args[index + 1] ?? fallback)
}

const repoRoot = resolvePath(import.meta.dir, "..")
const docsDir = join(repoRoot, "docs")
const defaultVault = join(repoRoot, "vault")
const vaultRoot = resolvePath(flag("--vault", defaultVault))
const folder = flag("--folder", "projects/doku/manual").replace(/^\/+|\/+$/g, "")

if (!existsSync(docsDir)) {
  console.error(`ไม่พบโฟลเดอร์ docs: ${docsDir}`)
  process.exit(2)
}
if (!existsSync(vaultRoot)) {
  console.error(`ไม่พบ vault: ${vaultRoot} (ตั้งด้วย --vault <dir>)`)
  process.exit(2)
}

/** ลิงก์ที่ชี้ไปนอกโฟลเดอร์ docs — แปลงให้ชี้เอกสารที่มีอยู่จริงในโฟลเดอร์ manual */
const LINK_REWRITES: Array<[RegExp, string]> = [
  [/\]\(\.\.\/README\.md\)/g, "](00-start-here.md)"],
  [/\]\(\.\.\/AGENTS\.md\)/g, "](11-handoff.md)"],
  [/\]\(\.\.\/docs\//g, "]("],
  [/\]\(docs\//g, "]("],
]

const NOTE =
  "> เอกสารนี้เป็นสำเนาจาก repo (`docs/`) — แก้ที่ repo แล้วรัน `bun run docs:sync --vault <dir> --apply`\n\n"

interface DocFile {
  name: string
  title: string
  summary: string
  order: number
  body: string
}

function firstHeading(text: string): string | null {
  const match = text.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim() ?? null
}

/** ย่อหน้าธรรมชาติแรก (ไม่ใช่หัวข้อ/ตาราง/รายการ/โค้ด) → summary สั้น ๆ */
function firstParagraph(text: string): string {
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    if (/^(#|>|\||```|[-*+]\s|\d+\.\s|:::)/.test(line)) continue
    const clean = line
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`]/g, "")
      .trim()
    if (clean.length >= 12) return clean.slice(0, 160)
  }
  return ""
}

const files: DocFile[] = readdirSync(docsDir)
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => {
    const raw = readFileSync(join(docsDir, name), "utf8")
    const title = firstHeading(raw) ?? name.replace(/\.md$/, "")
    const order = Number.parseInt(name.slice(0, 2), 10)
    return {
      name,
      title: title.replace(/^\d+\s*[—-]\s*/, "").trim(),
      summary: firstParagraph(raw),
      order: Number.isFinite(order) ? order : 999,
      body: raw,
    }
  })

if (files.length === 0) {
  console.error("ไม่พบเอกสารใน docs/")
  process.exit(2)
}

const targetDir = join(vaultRoot, folder)
if (apply && !existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

let written = 0
let unchanged = 0

for (const file of files) {
  let body = NOTE + file.body
  for (const [pattern, replacement] of LINK_REWRITES) body = body.replace(pattern, replacement)
  // ลิงก์ที่ชี้ขึ้นไปนอกโฟลเดอร์ (เช่น ../scripts/dev.sh) ไม่มีอยู่ใน vault
  // → เก็บชื่อไว้เป็น code span แทนลิงก์ที่พัง
  body = body.replace(
    /\[([^\]]+)\]\((?:\.\.\/|\/)[^)]+\)/g,
    (_match, label: string) => `\`${label.replace(/`/g, "")}\``,
  )

  const mdPath = join(targetDir, file.name)
  const metaPath = join(targetDir, `${basename(file.name, ".md")}.meta.json`)
  const meta = {
    title: file.title,
    ...(file.summary ? { summary: file.summary } : {}),
    tags: ["doku", "manual", "docs"],
    order: file.order,
  }
  const metaText = `${JSON.stringify(meta, null, 2)}\n`

  const mdChanged = !existsSync(mdPath) || readFileSync(mdPath, "utf8") !== body
  const metaChanged = !existsSync(metaPath) || readFileSync(metaPath, "utf8") !== metaText

  if (!mdChanged && !metaChanged) {
    unchanged += 1
    continue
  }

  written += 1
  console.log(
    `${apply ? "เขียน" : "จะเขียน"}: ${folder}/${file.name}${metaChanged ? " (+meta)" : ""}`,
  )
  if (apply) {
    writeFileSync(mdPath, body, "utf8")
    writeFileSync(metaPath, metaText, "utf8")
  }
}

console.log(
  `\n${files.length} เอกสาร · ${apply ? "เขียน" : "ต้องเขียน"} ${written} · ไม่เปลี่ยน ${unchanged}`,
)
if (!apply && written > 0) console.log("ยังไม่เขียนจริง — เพิ่ม --apply")
console.log(`ปลายทาง: ${join(vaultRoot, folder)}`)
