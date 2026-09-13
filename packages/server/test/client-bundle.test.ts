import { describe, expect, test } from "bun:test"
import { resolve } from "node:path"

/**
 * client.js ถูก **bundle จริง** ตอน build (docs/08 ข้อ 78) — เทสต์นี้รัน `Bun.build` เอง
 *
 * แทน `new Function(CLIENT_JS)` เดิม (ที่แค่เช็คว่าสตริง parse ได้) ด้วยของจริง:
 * syntax error · import ที่ resolve ไม่ได้ · output ที่รันในเบราว์เซอร์ได้
 * และยืนยันว่าไม่มี `eval`/`Function` (CSP `script-src 'self'` ห้าม — docs/06)
 */
const entry = resolve(import.meta.dir, "../src/web/client/main.ts")

const result = await Bun.build({
  entrypoints: [entry],
  target: "browser",
  format: "iife",
  minify: true,
  banner: '"use strict";',
  define: { "process.env.NODE_ENV": '"production"' },
})

describe("client bundle", () => {
  test("entry ที่ bundle ได้จริง (import/syntax ถูกต้อง)", () => {
    expect(result.success).toBe(true)
    expect(result.outputs.length).toBeGreaterThan(0)
  })

  test("output รันในเบราว์เซอร์ได้: strict + ไม่มี eval (CSP) + ฟีเจอร์ครบ", async () => {
    const out = result.outputs[0]
    if (!out) throw new Error("ไม่มี output จาก Bun.build")
    const js = await out.text()

    // เดิม CLIENT_JS รันเป็น strict (docs/08 ข้อ 78) — output เป็น classic script ต้องคงไว้
    expect(js.startsWith('"use strict";')).toBe(true)
    // CSP `script-src 'self'` ไม่มี unsafe-eval → bundle ห้ามใช้ eval/Function
    expect(js).not.toContain("new Function")
    expect(js).not.toMatch(/\beval\(/)

    for (const marker of [
      "EventSource", // live reload (SSE)
      "doku.tree-state", // sidebar tree state
      "data-dirty", // guard ของ one surface (docs/08 ข้อ 65)
      "doku-inline-textarea", // fallback เมื่อ CM6 ยังไม่มา
    ]) {
      expect(js).toContain(marker)
    }
  })
})
