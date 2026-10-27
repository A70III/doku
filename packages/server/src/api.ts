/**
 * REST API (`/api/*`) — docs/05 · entry point เดียวของ REST
 *
 * `app.tsx` ยัง `import { createApi } from "./api.ts"` เหมือนเดิม — ไฟล์นี้เป็น **barrel บาง ๆ**
 * เท่านั้น (ห้ามใส่ logic ที่นี่) ตัวจริงแยกตามกลุ่ม route อยู่ที่ `./api/`:
 *
 * - `shared.ts`    — error contract · rate limit · helper path/body/meta · `ApiContext`
 * - `docs.ts`      — `/docs*` (+ dispatch upload ไปที่ uploader ของ `assets.ts`)
 * - `folders.ts`   — `/folders*`
 * - `assets.ts`    — uploader + `DELETE /assets/*`
 * - `context.ts`   — `GET /context/*`
 * - `search.ts`    — `GET /search`
 * - `system.ts`    — `/tree` · `POST /render` · `/schema`
 * - `trash.ts`     — `/trash` · `/trash/empty` · `/trash/:id/restore`
 * - `revisions.ts` — `/revisions/*`
 *
 * re-export ครบทุก symbol ที่เคย public — **ห้ามเปลี่ยนชื่อ** (test และ MCP อ้างถึง)
 */

export { createApi } from "./api/index.ts"
export {
  type ApiDeps,
  type ApiErrorCode,
  ASSET_MAX_BYTES,
  ASSET_MAX_FILES,
  apiError,
  RATE_LIMITS,
  RateLimiter,
} from "./api/shared.ts"
