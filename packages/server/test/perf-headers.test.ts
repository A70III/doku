import { describe, expect, test } from "bun:test"
import { memoryRevisionStore, memoryVaultFs, RENDERER_VERSION } from "@doku/core"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"

/**
 * Regression — การนำทางระหว่างเอกสารต้องไม่โหลดซ้ำทั้งก้อน
 *
 * วัดก่อนแก้ (browser จริง): HTML 188KB + content.css 86KB + client.js 122KB
 * = ~396KB ต่อการคลิก 1 ครั้ง และ CSS/JS ถูกส่งใหม่ทุกครั้ง (no ETag)
 * หลังแก้: gzip ~26KB + 304 (0 byte) → ~20KB ต่อการคลิก
 */

function setup(files: Record<string, string>) {
  const fs = memoryVaultFs(files)
  const state = new VaultState(fs, "vault")
  const cache = new FragmentCache(null, RENDERER_VERSION)
  const renderer = new DocRenderer(fs, state, cache)
  const hub = new SseHub()
  const app = createDokuApp({ fs, vaultName: "vault", state, renderer, hub })
  return { app }
}

const DOC = "# หัวเรื่อง\n\nเนื้อหายาว ๆ ที่นี่\n"

describe("perf — ส่งหน้าแบบบีบอัดและ cache ได้", () => {
  test("HTML ถูก gzip เมื่อ client ส่ง Accept-Encoding", async () => {
    const { app } = setup({ "a.md": DOC })
    const res = await app.request("/d/a", { headers: { "accept-encoding": "gzip" } })
    expect(res.headers.get("content-encoding")).toBe("gzip")
    expect(res.headers.get("vary")).toContain("Accept-Encoding")
  })

  test("ไม่บีบอัดเมื่อ client ไม่รับ gzip", async () => {
    const { app } = setup({ "a.md": DOC })
    const res = await app.request("/d/a")
    expect(res.headers.get("content-encoding")).toBeNull()
  })

  test("client.js มี ETag และตอบ 304 เมื่อ ETag ตรง", async () => {
    const { app } = setup({ "a.md": DOC })
    const first = await app.request("/static/client.js")
    const etag = first.headers.get("etag")
    expect(etag).toBeTruthy()
    const second = await app.request("/static/client.js", {
      headers: { "if-none-match": etag as string },
    })
    expect(second.status).toBe(304)
    expect(second.headers.get("etag")).toBe(etag)
  })

  test("content.css มี ETag และตอบ 304", async () => {
    const { app } = setup({ "a.md": DOC })
    const first = await app.request("/static/content.css")
    const etag = first.headers.get("etag")
    expect(etag).toBeTruthy()
    const second = await app.request("/static/content.css", {
      headers: { "if-none-match": etag as string },
    })
    expect(second.status).toBe(304)
  })

  test("SSE ต้องไม่ถูกบีบอัด (ไม่งั้น event จะค้างใน buffer)", async () => {
    const { app } = setup({ "a.md": DOC })
    const res = await app.request("/sse", { headers: { "accept-encoding": "gzip" } })
    expect(res.headers.get("content-type")).toContain("text/event-stream")
    expect(res.headers.get("content-encoding")).toBeNull()
    await res.body?.cancel()
  })
})
