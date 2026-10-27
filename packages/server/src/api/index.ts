/**
 * REST API (`/api/*`) — docs/05
 *
 * M3: docs CRUD + move (+auto-update links) · folders CRUD/move · trash (soft-delete)
 *     · revisions list/restore · ETag + `If-Match` → 409 · rate limit (docs/06)
 * M4: assets upload/delete · context · hook บันทึก log (docs/06)
 * M5: search (FTS) · tree/render/schema
 *
 * หลักการ: route ทุกตัวต้องผ่าน path safety (`normalizeVaultPath`) และ "ไฟล์คือความจริง"
 * ไม่มี state ใน DB — mutate แล้ว `state.invalidate()` + broadcast SSE
 *
 * โครงไฟล์ (แยกตามกลุ่ม route · แต่ละ module export `register*` รับ `Hono` + `ApiContext`):
 * - `shared.ts`   — error contract · rate limit · helper path/body/meta · `ApiContext` (write guard, ETag, revision)
 * - `docs.ts`     — `/docs*` (+ dispatch ของ `POST /docs/*path/assets` ไปที่ uploader ของ `assets.ts`)
 * - `folders.ts`  — `/folders*`
 * - `assets.ts`   — uploader (ให้ docs dispatch) + `DELETE /assets/*`
 * - `context.ts`  — `GET /context/*`
 * - `search.ts`   — `GET /search`
 * - `system.ts`   — `/tree` · `POST /render` · `/schema`
 * - `trash.ts`    — `/trash` · `/trash/empty` · `/trash/:id/restore`
 * - `revisions.ts`— `/revisions/*`
 *
 * **ลำดับ `register*` ด้านล่าง = ลำดับ route จริงของ Hono — ห้ามสลับ**
 * (`app.route("/api", createApi(...))` ใน `app.tsx` ยังเรียกผ่าน `./api.ts` ที่ re-export ไฟล์นี้)
 */

import { Hono } from "hono"
import { createAssetUploader, registerAssets } from "./assets.ts"
import { registerContext } from "./context.ts"
import { registerDocs } from "./docs.ts"
import { registerFolders } from "./folders.ts"
import { registerRevisions } from "./revisions.ts"
import { registerSearch } from "./search.ts"
import { type ApiDeps, apiError, createApiContext, RateLimiter } from "./shared.ts"
import { registerSystem } from "./system.ts"
import { registerTrash } from "./trash.ts"

export function createApi(deps: ApiDeps, limiter = new RateLimiter()): Hono {
  const api = new Hono()
  const ctx = createApiContext(deps, limiter)
  const uploadAssets = createAssetUploader(ctx)

  registerDocs(api, ctx, uploadAssets)
  registerFolders(api, ctx)
  registerAssets(api, ctx)
  registerContext(api, ctx)
  registerSearch(api, ctx)
  registerSystem(api, ctx)
  registerTrash(api, ctx)
  registerRevisions(api, ctx)

  // error ที่ยังไม่ถูกจับ → ตอบ JSON เสมอ (และ map path-safety error เป็น 400)
  api.onError((error, context) => {
    const message = error instanceof Error ? error.message : String(error)
    if (/symlink|ออกนอก vault|ไม่ปลอดภัย|path escapes/i.test(message)) {
      return apiError(context, 400, "path_invalid", message)
    }
    return apiError(context, 500, "internal_error", "เกิดข้อผิดพลาดภายใน")
  })

  return api
}
