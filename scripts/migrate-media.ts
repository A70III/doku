#!/usr/bin/env bun
/**
 * migrate-media.ts — ย้าย `<โฟลเดอร์>/assets/*` เข้า media store `.media/<sha256>.<ext>`
 * แล้วเขียนลิงก์ในเอกสาร/meta ให้ชี้ `/media/<sha256>.<ext>` (docs/08 ข้อ 88)
 *
 * - dry-run เป็นค่าเริ่มต้น · เขียนจริงเมื่อ `--apply`
 * - idempotent: รันซ้ำ = ไม่มีอะไรให้ย้าย (ลิงก์เป็น /media แล้ว)
 * - ไฟล์เนื้อหาเดียวกัน (แม้ชื่อต่างกัน) → เก็บครั้งเดียว; เอกสารทุกที่ชี้ URL เดียวกัน
 * - ลบโฟลเดอร์ `assets/` ที่ว่างแล้วเท่านั้น (ถ้ามีไฟล์ตกค้าง = เก็บไว้ + เตือน)
 *
 * ใช้: bun run scripts/migrate-media.ts [--vault <dir>] [--apply]
 */

import { createHash } from "node:crypto"
import { existsSync, readdirSync, rmdirSync, rmSync } from "node:fs"
import { join, resolve as resolvePath, sep } from "node:path"
import { MEDIA_NAME } from "@doku/core"

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const vaultFlag = args.indexOf("--vault")
const vaultRoot = resolvePath(vaultFlag === -1 ? "vault" : (args[vaultFlag + 1] ?? "vault"))

if (!existsSync(vaultRoot)) {
  console.error(`ไม่พบ vault: ${vaultRoot}`)
  process.exit(2)
}

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex")
const toPosix = (path: string): string => path.split(sep).join("/")
const dirnameOf = (path: string): string => {
  const index = path.lastIndexOf("/")
  return index === -1 ? "" : path.slice(0, index)
}

/** เดิน vault: เก็บ md/meta + ไฟล์ใน assets/ (ข้าม dotfolder ทุกตัว รวม .media/.trash) */
interface Scan {
  texts: string[]
  assets: string[]
  assetDirs: Set<string>
}

function scan(dir: string, acc: Scan): void {
  for (const entry of readdirSync(join(vaultRoot, dir), { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue
    const rel = toPosix(join(dir, entry.name))
    if (entry.isDirectory()) {
      if (entry.name === "assets") {
        for (const file of readdirSync(join(vaultRoot, rel), { withFileTypes: true })) {
          if (file.isFile() && !file.name.startsWith(".")) acc.assets.push(`${rel}/${file.name}`)
        }
        acc.assetDirs.add(rel)
        continue
      }
      scan(rel, acc)
      continue
    }
    if (entry.name.endsWith(".md") || entry.name.endsWith(".meta.json")) acc.texts.push(rel)
  }
}

const scanResult: Scan = { texts: [], assets: [], assetDirs: new Set() }
scan("", scanResult)

// 1) ย้ายไฟล์ → media store
const urlByAsset = new Map<string, string>()
let copied = 0
let deduped = 0

for (const asset of scanResult.assets) {
  const ext = asset.slice(asset.lastIndexOf(".") + 1).toLowerCase()
  const name = `${sha256(new Uint8Array(await Bun.file(join(vaultRoot, asset)).arrayBuffer()))}.${ext}`
  if (!MEDIA_NAME.test(name)) {
    console.warn(`ข้าม (นามสกุลไม่รับ): ${asset}`)
    continue
  }
  urlByAsset.set(asset, `/media/${name}`)
  const target = join(vaultRoot, ".media", name)
  const already = existsSync(target)
  if (!already) {
    copied += 1
    if (apply) await Bun.write(target, Bun.file(join(vaultRoot, asset)))
  } else {
    deduped += 1
  }
  // ย้ายจริง = ลบต้นฉบับเสมอ (ทั้งไฟล์ใหม่และไฟล์ที่ dedupe เข้ากับของเดิม)
  if (apply) rmSync(join(vaultRoot, asset), { force: true })
}

// 2) เขียนลิงก์ใหม่ใน md/meta
const REFERENCE = /(?:\.\.\/)*(?:[^\s"'()[\]{}]*?\/)?assets\/[^\s"'()[\]{}]+/g
let rewrittenFiles = 0
let rewrittenRefs = 0

for (const textPath of scanResult.texts) {
  const absolute = join(vaultRoot, textPath)
  const original = await Bun.file(absolute).text()
  const baseDir = dirnameOf(textPath)

  const next = original.replace(REFERENCE, (raw: string, offset: number) => {
    const clean = raw.split("?")[0] ?? raw
    const normalized = clean.replace(/^(?:\.\/)+/, "")
    // `/assets/<vault path>` = absolute จาก root (regex จับเริ่มที่ `assets/` — ดูตัวอักษรก่อนหน้า)
    // · `assets/…` = relative จากโฟลเดอร์ของไฟล์ที่อ้าง
    const absolute = original[offset - 1] === "/"
    const resolved = absolute ? toPosix(join("", normalized)) : toPosix(join(baseDir, normalized))
    const url = urlByAsset.get(resolved)
    if (!url) {
      console.warn(`  อ้าง asset ที่ไม่พบ: ${raw} (ใน ${textPath})`)
      return raw
    }
    rewrittenRefs += 1
    return url
  })

  if (next !== original) {
    rewrittenFiles += 1
    if (apply) await Bun.write(absolute, next)
  }
}

// 3) ลบโฟลเดอร์ assets ที่ว่างแล้ว
let removedDirs = 0
for (const dir of scanResult.assetDirs) {
  const absolute = join(vaultRoot, dir)
  const left = readdirSync(absolute)
  if (left.length > 0) {
    console.warn(`เก็บโฟลเดอร์ไว้ (ยังมีไฟล์): ${dir} — ${left.length} ไฟล์`)
    continue
  }
  removedDirs += 1
  if (apply) rmdirSync(absolute)
}

console.log(
  [
    `${apply ? "APPLY" : "DRY-RUN"} · vault: ${vaultRoot}`,
    `asset files: ${scanResult.assets.length} → copied ${copied}, deduped ${deduped}`,
    `references rewritten: ${rewrittenRefs} (${rewrittenFiles} ไฟล์)`,
    `asset dirs ${apply ? "removed" : "to remove"}: ${removedDirs}`,
    apply ? "" : "ยังไม่เขียนอะไร — เติม --apply เพื่อทำจริง",
  ]
    .filter(Boolean)
    .join("\n"),
)
