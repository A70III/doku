/**
 * REST API — asset: upload (multipart) + delete (soft-delete) (M4 · docs/05 §3 · docs/06)
 *
 * upload เป็น **handler ที่ docs.ts dispatch** มาจาก `POST /docs/*path/assets` — ไม่ได้ register route
 * เอง (ลำดับ route ต้องอยู่ก่อน `POST /docs/*` ทั่วไป) · delete register ที่นี่หลังโฟลเดอร์
 *
 * invariant 7: ไม่มี route ลบถาวร — delete = ย้ายเข้า `.trash/` (`kind: "asset"`)
 */

import {
  assetMimeOf,
  assetUrl,
  basenameOf,
  dirnameOf,
  isSafeAssetName,
  isSafeVaultPath,
  MEDIA_DIR,
  mediaName,
  mediaUrl,
  sha256Hex,
} from "@doku/core"
import type { Context, Hono } from "hono"
import { auditLog } from "../audit.ts"
import {
  type ApiContext,
  ASSET_MAX_BYTES,
  ASSET_MAX_FILES,
  ASSET_NAME_MAX_BYTES,
  apiError,
  parseVaultPath,
  tailAfter,
} from "./shared.ts"

const ASSETS_PREFIX = "/api/assets/"

/** อัปโหลด asset (multipart) ที่ dispatch มาจาก `POST /docs/*path/assets`
 *
 * - filename ทุกไฟล์ต้องผ่าน charset ของ docs/06 (Q7 → docs/08 ข้อ 74) + ความยาวชื่อ ≤ 255 bytes (NAME_MAX)
 *   + path safety ของ path เต็ม (จับ dotfile อย่าง `.hidden.png`) + mime allowlist ชุดเดียวกับ route serve
 *   `/assets/*` — validate **ครบก่อน**เขียนไฟล์แรก (พลาด = ไม่มีไฟล์หลุดลง disk) · fs error ตอนเขียน = 400 ไม่ใช่ 500
 * - ตำแหน่งเขียน: `.media/<sha256>.<ext>` (content-addressed — docs/08 ข้อ 88) · ชื่อไฟล์เดิมใช้แค่นามสกุล
 *   ไม่ได้เก็บ (ไม่มีทาง collide/ทับกัน) · ไฟล์เนื้อหาเดิม = ใช้ของเดิม (dedupe)
 * - ผ่าน media store ของ adapter (`.media` เป็น dotfolder ที่ safeJoin ปฏิเสธ) — เขียน atomic
 * - ไม่เช็คว่าเอกสารปลายทางมีอยู่ — upload ได้ก่อนเขียนเอกสาร */
export function createAssetUploader(ctx: ApiContext) {
  const { guardWrite, touch, media } = ctx

  return async function uploadAssets(context: Context, id: string): Promise<Response> {
    const blocked = guardWrite(context)
    if (blocked) return blocked

    let form: FormData
    try {
      form = await context.req.formData()
    } catch {
      return apiError(context, 400, "invalid_body", "body ต้องเป็น multipart/form-data")
    }

    const files: File[] = []
    // type ของ `FormData.values()` ในโปรเจกต์นี้ประกาศเป็น `string` อย่างเดียว — ค่าจริงเป็น `string | File` (web standard)
    for (const value of form.values() as Iterable<string | File>) {
      if (typeof value !== "string") files.push(value)
    }
    if (files.length === 0) {
      return apiError(context, 400, "invalid_body", "ไม่มีไฟล์ในคำขอ — ส่งไฟล์ผ่าน multipart field ใดก็ได้")
    }
    if (files.length > ASSET_MAX_FILES) {
      return apiError(context, 400, "invalid_body", `เกินลิมิต ${ASSET_MAX_FILES} ไฟล์/คำขอ (docs/05)`)
    }

    const encoder = new TextEncoder()
    const planned: { file: File; extension: string; mime: string }[] = []
    for (const file of files) {
      const name = file.name
      if (!isSafeAssetName(name)) {
        return apiError(
          context,
          400,
          "path_invalid",
          `ชื่อไฟล์ไม่ผ่าน charset ของ asset (docs/06): ${name}`,
        )
      }
      // NAME_MAX ของ filesystem = 255 bytes/ชื่อไฟล์ — ยาวกว่านี้ validate ผ่านได้แต่ตอนเขียนจะโยน ENAMETOOLONG
      if (encoder.encode(name).byteLength > ASSET_NAME_MAX_BYTES) {
        return apiError(
          context,
          400,
          "path_invalid",
          `ชื่อไฟล์ยาวเกิน ${ASSET_NAME_MAX_BYTES} bytes (NAME_MAX ของ filesystem): ${name}`,
        )
      }
      const mime = assetMimeOf(name)
      if (!mime) {
        return apiError(context, 400, "asset_type_rejected", `นามสกุลไม่อยู่ใน allowlist: ${name}`)
      }
      if (file.size > ASSET_MAX_BYTES) {
        return apiError(context, 413, "too_large", `ไฟล์ใหญ่กว่า limit ${ASSET_MAX_BYTES} bytes`)
      }
      const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase()
      planned.push({ file, extension, mime })
    }

    if (!media) {
      return apiError(context, 503, "read_only", "adapter นี้ไม่รองรับ media store")
    }

    const assets: {
      path: string
      url: string
      bytes: number
      content_type: string
      deduped: boolean
    }[] = []
    try {
      for (const item of planned) {
        const bytes = new Uint8Array(await item.file.arrayBuffer())
        const name = mediaName(await sha256Hex(bytes), item.extension)
        const exists = await media.has(name)
        if (!exists) await media.write(name, bytes)
        const target = `${MEDIA_DIR}/${name}`
        auditLog(context, "asset.upload", target)
        assets.push({
          path: target,
          // ชื่อไฟล์ = sha256 ของเนื้อหา → cache ได้ตลอดกาล (ไม่ต้องมี `?h=`)
          url: mediaUrl(name),
          bytes: bytes.byteLength,
          content_type: item.mime,
          deduped: exists,
        })
      }
    } catch {
      // fs error ที่ validation ไม่ครอบคลุม — route นี้ห้ามยิง 500 → map เป็น 400 ให้ client เห็นสาเหตุ
      return apiError(
        context,
        400,
        "path_invalid",
        "เขียนไฟล์ไม่สำเร็จ — path/ชื่อไฟล์ไม่ถูกต้องบน filesystem",
      )
    }
    touch()
    return context.json({ ok: true, path: id, assets }, 201)
  }
}

export function registerAssets(api: Hono, ctx: ApiContext): void {
  const { deps, exists, guardWrite, touch } = ctx
  const vaultName = deps.vaultName

  /** ลบ asset — soft-delete เข้า `.trash/` (`kind: "asset"`) เหมือน doc/folder — invariant 7 ไม่มี route ลบถาวร */
  api.delete("/assets/*", async (context) => {
    const blocked = guardWrite(context)
    if (blocked) return blocked
    const raw = tailAfter(context.req.url, ASSETS_PREFIX) ?? ""
    const path = parseVaultPath(raw, vaultName, false)
    if (!path) return apiError(context, 400, "path_invalid", `path ไม่ปลอดภัย: ${raw}`)
    // เฉพาะ path ที่มี segment `assets` ตรง ๆ = asset store (`<โฟลเดอร์>/assets/<file>` รวม `assets/<file>` ระดับ root —
    // ตรงกับตำแหน่งที่ upload เขียน) · อื่น ๆ (sidecar `*.meta.json` / `_folder.meta.json`) ไม่ใช่ asset
    // → เทียบเท่า GET /assets/* = 404 **ก่อนแตะ fs** (ห้ามลบ meta ของเอกสาร/โฟลเดอร์ผ่าน route นี้)
    if (!path.split("/").includes("assets")) {
      return apiError(context, 404, "not_found", `ไม่พบ asset: ${path}`)
    }
    const name = basenameOf(path)
    if (!isSafeAssetName(name)) {
      return apiError(
        context,
        400,
        "path_invalid",
        `ชื่อไฟล์ไม่ผ่าน charset ของ asset (docs/06): ${name}`,
      )
    }
    // ไม่ใช่ชนิดที่ serve ได้ = ไม่ใช่ asset (รวมโฟลเดอร์/path ที่ไม่มี extension) — เทียบเท่า GET /assets/* → 404
    if (!assetMimeOf(name)) return apiError(context, 404, "not_found", `ไม่พบ asset: ${path}`)
    if (!(await exists(path))) return apiError(context, 404, "not_found", `ไม่พบ asset: ${path}`)

    const item = await deps.trash.put([path], { label: path, kind: "asset" })
    touch()
    auditLog(context, "asset.delete", path)
    return context.json({ ok: true, path, trash: item })
  })
}
