#!/usr/bin/env bun
/**
 * `bun run gen:schema` — Zod → JSON Schema (docs/08 ข้อ 12)
 * ผลลัพธ์อยู่ใน `schema/` ซึ่ง **ไม่ commit** (แก้ไขใหม่ได้เสมอจาก Zod)
 * `GET /api/schema` (M4) จะเสิร์ฟไฟล์จาก Zod ตรง ๆ แบบเดียวกันนี้
 */

import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { BLOCKS, FolderMetaSchema, MetaSchema } from "@kairn/core"
import { z } from "zod"

const OUT_DIR = resolve(import.meta.dir, "../schema")

const metaSchema = z.toJSONSchema(MetaSchema, {
  target: "draft-2020-12",
  io: "input",
  $id: "https://kairn.local/schema/meta.schema.json",
})

const folderSchema = z.toJSONSchema(FolderMetaSchema, {
  target: "draft-2020-12",
  io: "input",
  $id: "https://kairn.local/schema/folder-meta.schema.json",
})

/** block manifest — generate จาก registry (ไม่ใช่ Zod: เป็นข้อมูล ไม่ใช่ schema) */
const blocksManifest = {
  $comment: "generate จาก packages/core/src/blocks/registry.ts — ห้ามแก้มือ",
  blocks: BLOCKS.map((block) => ({
    name: block.name,
    kind: block.kind,
    implemented: block.implemented,
    syntax: block.syntax,
  })),
}

await mkdir(OUT_DIR, { recursive: true })
await Promise.all([
  Bun.write(resolve(OUT_DIR, "meta.schema.json"), `${JSON.stringify(metaSchema, null, 2)}\n`),
  Bun.write(
    resolve(OUT_DIR, "folder-meta.schema.json"),
    `${JSON.stringify(folderSchema, null, 2)}\n`,
  ),
  Bun.write(resolve(OUT_DIR, "blocks.json"), `${JSON.stringify(blocksManifest, null, 2)}\n`),
])

process.stdout.write(`schema/ → meta.schema.json · folder-meta.schema.json · blocks.json\n`)
