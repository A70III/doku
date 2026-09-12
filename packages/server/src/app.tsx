/**
 * Hono app (docs/01 routes) — ประกอบจาก deps ที่ inject เข้ามาเสมอ
 * (fs adapter / state / cache / hub) เพื่อให้ test ได้โดยไม่แตะ filesystem จริง
 *
 * M1 routes: `/` `/d/*path` `/assets/*path` `/static/*` `/sse` `/health`
 * (REST API /api/* จะมาที่ M3–M4 — docs/07)
 */

import {
  DocNotFoundError,
  docEtag,
  etagHeader,
  normalizeVaultPath,
  PathError,
  type RevisionStore,
  sha256Hex,
  type TrashStore,
  type VaultFs,
} from "@doku/core"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { createApi } from "./api.ts"
import type { DocRenderer } from "./doc.ts"
import { loadKatexCss } from "./katex.ts"
import type { SseHub } from "./sse.ts"
import type { VaultState } from "./tree.ts"
import { CLIENT_JS } from "./web/client.ts"
import { CONTENT_CSS } from "./web/content-css.ts"
import { DocPage, HomePage, NotFoundPage, StyleGuidePage, TrashPage } from "./web/pages.tsx"
import { buildStyleguide } from "./web/styleguide.ts"

/** docs/06 CSP — คลาดเคลื่อนเดียว: `font-src 'self' data:` สำหรับ woff2 ที่ KaTeX ฝัง (docs/08 ข้อ 23) */
export const CSP =
  "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "script-src 'self'; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'"

export interface DokuAppDeps {
  fs: VaultFs
  vaultName: string
  state: VaultState
  renderer: DocRenderer
  hub: SseHub
  /** อ่านไฟล์ใน `public/` ที่ generate ไว้ (app.css / editor.js) — คืน null ถ้ายังไม่มี */
  readPublic?: (name: string) => Promise<string | null>
  /** M3: REST API + trash/revision — ไม่ส่ง = ไม่ mount `/api/*` (test เก่า/โหมดอ่านอย่างเดียว) */
  trash?: TrashStore
  revisions?: RevisionStore
  readOnly?: boolean
}

/** MIME allowlist (docs/06) — ไม่อยู่ในนี้ = ไม่ serve */
const ASSET_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  json: "application/json",
  pdf: "application/pdf",
}

/** path จาก URL → vault path (decode ทีละ segment — path อาจมีตัวไทย/ช่องว่าง) */
function tailPath(url: string, prefix: string): string {
  const pathname = new URL(url).pathname
  return pathname
    .slice(prefix.length)
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment)
      } catch {
        // invalid percent-encoding → คืน raw segment (จะถูก isSafeVaultPath ปฏิเสธทีหลัง)
        return segment
      }
    })
    .join("/")
}

export function createDokuApp(deps: DokuAppDeps): Hono {
  const app = new Hono()

  // จำนวนรายการใน trash สำหรับ badge บน sidebar — cache สั้น ๆ (ทุกหน้าไม่ควรยิง fs ถี่)
  let trashCache: { at: number; count: number } | null = null
  const trashCount = async (): Promise<number> => {
    if (!deps.trash) return 0
    const now = Date.now()
    if (trashCache && now - trashCache.at < 2000) return trashCache.count
    let count = 0
    try {
      count = (await deps.trash.list()).length
    } catch {
      count = 0
    }
    trashCache = { at: now, count }
    return count
  }

  if (deps.trash && deps.revisions) {
    app.route(
      "/api",
      createApi({
        fs: deps.fs,
        vaultName: deps.vaultName,
        state: deps.state,
        renderer: deps.renderer,
        hub: deps.hub,
        trash: deps.trash,
        revisions: deps.revisions,
        readOnly: deps.readOnly,
      }),
    )
  }

  // CSP ใส่ตอน response เป็น HTML เท่านั้น (SSE/asset ไม่ต้อง)
  app.use("*", async (context, next) => {
    await next()
    const type = context.res.headers.get("content-type")
    if (type?.startsWith("text/html")) context.res.headers.set("content-security-policy", CSP)
  })

  app.get("/health", (context) => context.json({ ok: true }))

  app.get("/sse", (context) =>
    streamSSE(context, async (stream) => {
      const pending: string[] = []
      const unsubscribe = deps.hub.subscribe((event) => pending.push(event))
      let sincePing = 0
      stream.onAbort(unsubscribe)
      while (true) {
        const event = pending.shift()
        if (event) {
          await stream.writeSSE({ event, data: "reload" })
          sincePing = 0
          continue
        }
        await stream.sleep(150)
        sincePing += 150
        if (sincePing >= 25_000) {
          await stream.writeSSE({ event: "ping", data: "keepalive" })
          sincePing = 0
        }
      }
    }),
  )

  /** เสิร์ฟไฟล์ใน public/ พร้อม ETag → revalidate เป็น 304 (editor.js ~510KB ไม่ต้องโหลดซ้ำ) */
  const servePublic = async (
    context: import("hono").Context,
    name: string,
    contentType: string,
  ): Promise<Response> => {
    const content = await deps.readPublic?.(name)
    if (content === null || content === undefined) return context.notFound()
    const etag = etagHeader(await sha256Hex(content))
    if (context.req.header("if-none-match") === etag) {
      return context.body(null, 304, { etag, "cache-control": "no-cache" })
    }
    return context.body(content, 200, {
      "content-type": contentType,
      "cache-control": "no-cache",
      etag,
    })
  }

  app.get("/static/:name", async (context) => {
    const name = context.req.param("name")
    if (name === "client.js") {
      return context.body(CLIENT_JS, 200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-cache",
      })
    }
    if (name === "content.css") {
      return context.body(CONTENT_CSS, 200, {
        "content-type": "text/css; charset=utf-8",
        "cache-control": "no-cache",
      })
    }
    if (name === "katex.css") {
      return context.body(await loadKatexCss(), 200, {
        "content-type": "text/css; charset=utf-8",
        // ไฟล์ใหญ่ (~380KB) — เปลี่ยนได้เฉพาะเมื่อแพ็กเกจเปลี่ยน จึง cache ได้
        "cache-control": "public, max-age=86400",
      })
    }
    if (name === "app.css") {
      return servePublic(context, "app.css", "text/css; charset=utf-8")
    }
    if (name === "editor.js") {
      // bundle ของ CodeMirror (bun run build:editor) — ไม่มี = client fallback เป็น textarea
      return servePublic(context, "editor.js", "text/javascript; charset=utf-8")
    }
    return context.notFound()
  })

  app.get("/", async (context) => {
    const { tree, docs } = await deps.state.get()
    const tag = context.req.query("tag") || undefined
    return context.html(
      <HomePage
        tree={tree}
        docs={docs}
        tag={tag}
        vaultName={deps.vaultName}
        trashCount={await trashCount()}
      />,
    )
  })

  app.get("/styleguide", async (context) => {
    const { tree } = await deps.state.get()
    const blocks = await buildStyleguide()
    return context.html(
      <StyleGuidePage
        tree={tree}
        blocks={blocks}
        vaultName={deps.vaultName}
        trashCount={await trashCount()}
      />,
    )
  })

  app.get("/trash", async (context) => {
    if (!deps.trash) return context.notFound()
    const { tree } = await deps.state.get()
    const items = await deps.trash.list()
    return context.html(
      <TrashPage tree={tree} vaultName={deps.vaultName} items={items} trashCount={items.length} />,
    )
  })

  app.get("/d/*", async (context) => {
    const { tree } = await deps.state.get()
    const raw = tailPath(context.req.raw.url, "/d/")
    let docId: string
    try {
      docId = normalizeVaultPath(raw, { vaultName: deps.vaultName })
    } catch (error) {
      if (error instanceof PathError) {
        return context.html(
          <NotFoundPage
            tree={tree}
            kind="doc"
            path={raw}
            vaultName={deps.vaultName}
            trashCount={await trashCount()}
          />,
          404,
        )
      }
      throw error
    }

    try {
      const doc = await deps.renderer.render(docId)
      const markdown = await deps.fs.readText(`${docId}.md`)
      if (markdown !== null) {
        // ทุก GET คืน ETag ของ {md, meta} (docs/05 concurrency)
        context.header("etag", etagHeader(await docEtag(markdown, doc.meta)))
      }
      return context.html(
        <DocPage
          doc={doc}
          path={docId}
          tree={tree}
          vaultName={deps.vaultName}
          trashCount={await trashCount()}
        />,
      )
    } catch (error) {
      if (error instanceof DocNotFoundError) {
        return context.html(
          <NotFoundPage
            tree={tree}
            kind="doc"
            path={docId}
            vaultName={deps.vaultName}
            trashCount={await trashCount()}
          />,
          404,
        )
      }
      throw error
    }
  })

  app.get("/assets/*", async (context) => {
    const raw = tailPath(context.req.raw.url, "/assets/")
    let assetPath: string
    try {
      assetPath = normalizeVaultPath(raw, { stripSuffix: false, vaultName: deps.vaultName })
    } catch (error) {
      if (error instanceof PathError) return context.notFound()
      throw error
    }

    const extension = assetPath.slice(assetPath.lastIndexOf(".") + 1).toLowerCase()
    const mime = ASSET_MIME[extension]
    if (!mime) return context.notFound() // mime allowlist (docs/06)

    const bytes = await deps.fs.readBytes(assetPath)
    if (!bytes) return context.notFound()

    // ?h=<hash> = content address → immutable cache; ไม่มี h = ไม่แคช
    const hasHash = new URL(context.req.raw.url).searchParams.has("h")
    return context.body(bytes as Uint8Array<ArrayBuffer>, 200, {
      "content-type": mime,
      "cache-control": hasHash ? "public, max-age=31536000, immutable" : "no-cache",
      "content-security-policy": "default-src 'none'", // svg/ทุก asset ไม่ทำงาน script
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    })
  })

  app.notFound(async (context) => {
    const { tree } = await deps.state.get()
    return context.html(
      <NotFoundPage
        tree={tree}
        kind="route"
        vaultName={deps.vaultName}
        trashCount={await trashCount()}
      />,
      404,
    )
  })

  return app
}
