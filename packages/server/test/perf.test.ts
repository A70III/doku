import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { memoryVaultFs, RENDERER_VERSION } from "@doku/core"
import { chromium } from "playwright"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"

/**
 * M3.2 Track E — perf budget ของ decoration (docs/09 §5 Track E · docs/08 ข้อ 64/69)
 *
 * "decoration rebuild ≤ 8ms/keystroke บนเอกสาร 3,000 บรรทัด (visible-only + incremental)"
 * วัดในเบราว์เซอร์จริง: `window.DokuEditor.perf` เก็บต้นทุนต่อ update = plugin
 * `buildDecorations` (visible-only) + state field block math (incremental)
 *
 * ข้ามอัตโนมัติถ้าไม่มี Chromium ในเครื่อง (เช่น CI ที่ยังไม่ `playwright install`)
 */

interface PerfApi {
  perf: { rebuilds: () => number[]; reset: () => void }
}

const BUDGET_MS = 8
const KEYSTROKES = 40

function bigDoc(): string {
  const lines: string[] = ["# เอกสารยาว", ""]
  for (let i = 0; i < 400; i += 1) {
    lines.push(`## หัวข้อ ${i}`, "", `ย่อหน้าที่ ${i} — ข้อความไทย English ผสมกันพอประมาณ`, "")
  }
  for (let i = 0; i < 800; i += 1) {
    lines.push(`- รายการที่ ${i}`, "")
  }
  // block math 2 ก้อน — พิสูจน์ว่า state field ที่ cache ไว้ทำงานกับเอกสารยาว
  lines.push("$$", "E = mc^2", "$$", "", "$$", "a^2 + b^2 = c^2", "$$", "")
  return lines.join("\n")
}

/** ไฟล์ที่ generate (app.css/editor.js) อยู่ที่ packages/server/public — เทสต์อื่นใช้ memory เท่านั้น
 *  แต่เคสนี้ต้องโหลด bundle จริงเพื่อวัด perf */
const publicDir = new URL("../public/", import.meta.url)
const readPublic = async (name: string): Promise<string | null> => {
  if (!/^[a-z0-9._-]+$/i.test(name)) return null
  try {
    return await Bun.file(new URL(name, publicDir)).text()
  } catch {
    return null
  }
}

function setup(files: Record<string, string>) {
  const fs = memoryVaultFs(files)
  const state = new VaultState(fs, "vault")
  const cache = new FragmentCache(null, RENDERER_VERSION)
  const renderer = new DocRenderer(fs, state, cache)
  const hub = new SseHub()
  return createDokuApp({ fs, vaultName: "vault", state, renderer, hub, readPublic })
}

const hasChromium = (() => {
  try {
    return existsSync(chromium.executablePath())
  } catch {
    return false
  }
})()

describe("Track E — perf budget ของ decoration rebuild", () => {
  test.skipIf(!hasChromium)(
    `≤ ${BUDGET_MS}ms/keystroke บนเอกสาร 3,000 บรรทัด`,
    async () => {
      const md = bigDoc()
      expect(md.split("\n").length).toBeGreaterThanOrEqual(3_000)

      const app = setup({ "long.md": md })
      const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.fetch })
      const base = `http://127.0.0.1:${server.port}`
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
        const errors: string[] = []
        page.on("pageerror", (error) => errors.push(String(error)))
        await page.goto(`${base}/d/long`, { waitUntil: "networkidle" })
        await page.waitForSelector("html[data-editor-mounted]", { timeout: 15_000 })
        await page.waitForTimeout(300)

        // เริ่มวัดหลัง mount (แยกต้นทุนครั้งแรกออก) แล้วพิมพ์จริงในหน้าเอกสาร
        await page.evaluate(() => {
          const view = document.querySelector(".cm-content") as HTMLElement
          view.focus()
          const api = (window as unknown as { DokuEditor?: PerfApi }).DokuEditor
          api?.perf.reset()
        })
        await page.keyboard.press("Control+Home")
        await page.keyboard.press("ArrowDown")
        await page.keyboard.type("ทดสอบ perf วัดในเบราว์เซอร์จริง ", { delay: 0 })
        await page.waitForTimeout(200)

        const samples = await page.evaluate(() => {
          const api = (window as unknown as { DokuEditor?: PerfApi }).DokuEditor
          return api?.perf.rebuilds() ?? []
        })
        expect(errors).toEqual([])
        // อย่างน้อย 1 sample ต่อ update ที่เกี่ยวกับカー/ข้อความ
        expect(samples.length).toBeGreaterThanOrEqual(KEYSTROKES / 2)

        const max = Math.max(...samples)
        const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length
        // budget: ไม่มี keystroke ใดเกินงบ และค่าเฉลี่ยต้องต่ำกว่างบมาก
        expect(max).toBeLessThanOrEqual(BUDGET_MS)
        expect(mean).toBeLessThanOrEqual(BUDGET_MS / 2)
      } finally {
        await browser.close()
        server.stop(true)
      }
    },
    60_000,
  )
})
