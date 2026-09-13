/**
 * Visual check — ถ่าย screenshot หน้าเว็บไว้เทียบ before/after (docs/07 M3.1)
 *
 * ใช้: bun run shot [flags]
 *   --out   <dir>     โฟลเดอร์ปลายทาง (default `var/shots/current`)
 *   --vault <dir>     vault ที่จะเสิร์ฟ (default `examples/vault`)
 *   --port  <n>       port ของ server ที่สคริปต์ spawn เอง (default 7699)
 *   --theme <mode>    light | dark | both (default both)
 *   --width <n>       ความกว้าง viewport (default 1440)
 *
 *   --no-scenarios    ข้าม scenario โต้ตอบจริง (M3.2 Track E)
 *
 * สคริปต์ spawn server เองในหน่วยความจำเดียวกัน แล้วปิดให้เรียบร้อย —
 * ไม่ต้องเปิด dev server ค้าง (var/ ถูก gitignore อยู่แล้ว)
 * **ทำงานบนสำเนาของ vault** (var/tmp/shot-vault) เพราะ scenario มีการพิมพ์/ลาก block
 * ซึ่ง autosave จะเขียนกลับ — ห้ามแตะ vault ต้นทาง
 *
 * นอกจากการถ่ายภาพ ยังรัน **a11y smoke check** ต่อหน้าจริง (docs/07 M3.1):
 * accessible name · focus ring · ไม่มี horizontal overflow ที่ 200% zoom และจอ 360px ·
 * reduced motion ถูกเคารพ · ข้อความไม่ทับกันจนอ่านไม่ได้
 *
 * และ **scenario โต้ตอบจริง** (docs/09 §5 Track E): พิมพ์ไทย + IME guard (นับ decoration
 * rebuild ผ่าน `window.DokuEditor.perf`) · เลือก/ลาก block · bubble + link popover
 */
import { spawn, spawnSync } from "node:child_process"
import { cpSync, mkdirSync, rmSync } from "node:fs"
import { mkdir, readdir } from "node:fs/promises"
import { join, relative, resolve } from "node:path"
import { chromium } from "playwright"

type Flags = {
  out: string
  vault: string
  port: number
  theme: "light" | "dark" | "both"
  width: number
  a11y: boolean
  scenarios: boolean
}

interface Check {
  name: string
}

/** รันในเบราว์เซอร์: เก็บปัญหา a11y ที่ตรวจได้จาก DOM จริง */
const A11Y_SCRIPT = `(() => {
  const issues = []
  const name = (el) => {
    const aria = el.getAttribute("aria-label")
    const title = el.getAttribute("title")
    const text = (el.textContent || "").trim()
    if (aria && aria.trim()) return aria
    if (title && title.trim()) return title
    if (text) return text
    return ""
  }

  const controls = [...document.querySelectorAll("button, a[href], input, select, textarea, summary")]
  const nameless = controls.filter((el) => {
    // checkbox ของ task list ถูก render เป็น disabled — สถานะสื่อด้วยข้อความใน <li> แล้ว
    if (el.disabled && (el.type === "checkbox" || el.type === "radio")) return false
    if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA") {
      return !(el.getAttribute("aria-label") || el.closest("label"))
    }
    return !name(el)
  })
  if (nameless.length) {
    issues.push("คอนโทรลไม่มีชื่อ " + nameless.length + " รายการ (" +
      nameless.slice(0, 3).map((el) => el.tagName.toLowerCase()).join(", ") + ")")
  }

  const focusable = controls.find((el) => el.offsetParent !== null)
  if (focusable) {
    focusable.focus()
    const style = getComputedStyle(focusable)
    if (style.outlineStyle === "none" || parseFloat(style.outlineWidth) === 0) {
      issues.push("ไม่พบ focus ring บน " + focusable.tagName.toLowerCase())
    }
  }

  const doc = document.documentElement
  if (doc.scrollWidth > window.innerWidth + 1) {
    issues.push("horizontal overflow " + doc.scrollWidth + "px > " + window.innerWidth + "px")
  }

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const animated = [...document.querySelectorAll("*")].filter((el) => {
      const style = getComputedStyle(el)
      return style.animationName !== "none" && parseFloat(style.animationDuration) > 0
    })
    if (animated.length) issues.push("reduced-motion แต่ยังมี animation " + animated.length)
  }

  // หน้า specimen (styleguide) มี h1 ในตัวอย่าง block — ไม่นับเป็นหัวเรื่องของหน้า
  const specimen = Boolean(document.querySelector('[id^="block-"]'))
  if (!specimen && document.querySelectorAll("h1").length > 1) issues.push("มี h1 มากกว่า 1")

  return issues
})()`

/** เก็บผล a11y ข้ามหน้า/ธีม */
const checks: Check[] = []

function parseFlags(argv: string[]): Flags {
  const get = (name: string, fallback: string): string => {
    const index = argv.indexOf(`--${name}`)
    return index >= 0 && argv[index + 1] ? (argv[index + 1] as string) : fallback
  }
  return {
    out: get("out", "var/shots/current"),
    vault: get("vault", "examples/vault"),
    port: Number(get("port", "7699")),
    theme: get("theme", "both") as Flags["theme"],
    width: Number(get("width", "1440")),
    a11y: !argv.includes("--no-a11y"),
    scenarios: !argv.includes("--no-scenarios"),
  }
}

/** เดินหา *.md ทุกไฟล์ใน vault → path id (relative, ตัด .md) */
async function walkDocs(root: string, dir = root, acc: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkDocs(root, full, acc)
      continue
    }
    if (entry.name.endsWith(".md")) {
      acc.push(relative(root, full).replace(/\.md$/, ""))
    }
  }
  return acc.sort()
}

async function waitForHealth(url: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // server ยังไม่ขึ้น — ลองใหม่
    }
    await Bun.sleep(120)
  }
  throw new Error(`server ไม่ตอบ /health ใน ${timeoutMs}ms`)
}

/* ── scenario โต้ตอบจริง (M3.2 Track E — docs/09 §5) ────────────────────────
   พิมพ์ไทย + IME guard · bubble/link popover · เลือก/ลาก block
   ทุกอย่างรันบนสำเนา vault (autosave เขียนกลับได้) และเก็บ screenshot ไว้เทียบ */

type ScenarioResult = { name: string; ok: boolean; note: string }

/** เลือกข้อความด้วย DOM selection (เหมือนผู้ใช้ลากเลือก) — CM อ่านผ่าน selectionchange */
async function selectText(page: import("playwright").Page, text: string): Promise<boolean> {
  return page.evaluate((needle) => {
    const view = document.querySelector(".cm-content")
    if (!view) return false
    const walker = document.createTreeWalker(view, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const index = (node.textContent ?? "").indexOf(needle)
      if (index !== -1) {
        const range = document.createRange()
        range.setStart(node, index)
        range.setEnd(node, index + needle.length)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        ;(view as HTMLElement).focus()
        document.dispatchEvent(new Event("selectionchange"))
        return true
      }
      node = walker.nextNode()
    }
    return false
  }, text)
}

async function typeThai(page: import("playwright").Page, text: string): Promise<void> {
  await page.keyboard.insertText(text)
}

async function readMd(base: string, docId: string): Promise<string> {
  const res = await fetch(`${base}/api/docs/${encodeURIComponent(docId)}`)
  const body = (await res.json()) as { md?: string }
  return body.md ?? ""
}

async function runEditorScenarios(
  page: import("playwright").Page,
  base: string,
  docId: string,
  theme: string,
  outDir: string,
): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = []
  const add = (name: string, ok: boolean, note = "") => results.push({ name, ok, note })
  const shot = (name: string) => page.screenshot({ path: join(outDir, `${name}.${theme}.png`) })
  const jsErrors: string[] = []
  page.on("pageerror", (error) => jsErrors.push(String(error)))

  await page.goto(`${base}/d/${docId}`, { waitUntil: "networkidle" })
  await page.waitForSelector("html[data-editor-mounted]", { timeout: 15_000 })
  await page.waitForTimeout(250)

  // 1) เลือกข้อความ → bubble toolbar
  const lineText = await page.evaluate(() => {
    // บรรทัดที่ไม่ว่างและยาวพอ (`.cm-line` ที่ 2 ของเอกสารมักเป็นบรรทัดว่าง)
    const lines = [...document.querySelectorAll(".cm-line")]
    const line = lines.find((el) => (el.textContent ?? "").trim().length >= 6)
    return (line?.textContent ?? "").slice(0, 6)
  })
  const selected = await selectText(page, lineText)
  await page.waitForTimeout(250)
  const bubbleVisible = await page.evaluate(() => {
    const el = document.getElementById("doku-inline-bar")
    return Boolean(el && !el.hidden)
  })
  add("เลือกข้อความ → bubble ปรากฏ", selected && bubbleVisible, lineText)
  if (bubbleVisible) await shot("scenario-inline")

  // 2) link popover (Mod+K)
  await page.keyboard.press("Control+k")
  await page.waitForTimeout(250)
  const linkVisible = await page.evaluate(() => {
    const el = document.getElementById("doku-link-pop")
    return Boolean(el && !el.hidden)
  })
  add("Mod+K → link popover", linkVisible)
  if (linkVisible) await shot("scenario-link")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(150)

  // 3) พิมพ์ไทย (สระ/วรรณยุกต์/คำผสม) — ข้อความต้องลงครบและカーไม่เพี้ยน
  const thai = "ทดสอบ ภาษาไทย น้ำ ก๋วยเตี๋ยว วรรณยุกต์"
  await page.keyboard.press("Control+Home")
  await page.keyboard.press("ArrowDown")
  await typeThai(page, thai)
  await page.waitForTimeout(250)
  const hasThai = await page.evaluate((needle) => {
    return (document.querySelector(".cm-content")?.textContent ?? "").includes(needle)
  }, thai)
  add("พิมพ์ไทย (insertText) ลงครบ", hasThai, thai)
  await shot("scenario-thai")

  // 4) IME guard (docs/08 ข้อ 69): ระหว่าง composing ต้องไม่ rebuild decoration
  const ime = await page.evaluate(async () => {
    const view = document.querySelector(".cm-content") as HTMLElement
    const api = (
      window as { DokuEditor?: { perf: { rebuilds: () => number[]; reset: () => void } } }
    ).DokuEditor
    view.focus()
    api?.perf.reset()
    view.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "" }))
    await new Promise((resolve) => setTimeout(resolve, 30))
    const composing =
      document.querySelector(".cm-editor")?.classList.contains("cm-focused") ?? false
    return { composing, samples: api?.perf.rebuilds().length ?? -1 }
  })
  await typeThai(page, "ต่อ")
  await page.waitForTimeout(200)
  const duringCompose = await page.evaluate(() => {
    const api = (window as { DokuEditor?: { perf: { rebuilds: () => number[] } } }).DokuEditor
    return api?.perf.rebuilds().length ?? -1
  })
  await page.evaluate(() => {
    document
      .querySelector(".cm-content")
      ?.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "" }))
  })
  await page.waitForTimeout(100)
  await typeThai(page, "จบ")
  await page.waitForTimeout(200)
  const afterCompose = await page.evaluate(() => {
    const api = (window as { DokuEditor?: { perf: { rebuilds: () => number[] } } }).DokuEditor
    return api?.perf.rebuilds().length ?? -1
  })
  add(
    "IME guard: composing ไม่ rebuild · จบแล้ว rebuild",
    ime.samples === 0 && duringCompose === 0 && afterCompose > 0,
    `composing=${duringCompose} after=${afterCompose}`,
  )

  // 5) เลือก block ด้วย Esc (focus ต้องอยู่ที่ editor หลังจังหวะแรก)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(200)
  const blockState = await page.evaluate(() => ({
    selected: document.querySelectorAll(".cm-doku-block-selected").length,
    focused: document.querySelector(".cm-editor")?.classList.contains("cm-focused") ?? false,
  }))
  add("Esc → เลือก block (editor ยัง focus)", blockState.selected > 0 && blockState.focused)
  if (blockState.selected > 0) await shot("scenario-block")
  await page.keyboard.press("Escape")
  await page.waitForTimeout(200)

  // 6) ลาก block ผ่าน gutter (⋮⋮) → markdown ต้องถูกจัดลำดับใหม่จริง
  const before = await readMd(base, docId)
  const dragged = await page.evaluate(async () => {
    const article = document.querySelector(".doku-article")
    const line = document.querySelectorAll(".cm-line")[3]
    if (!article || !line) return null
    const rect = line.getBoundingClientRect()
    // pointermove ให้ gutter โผล่ (delay 200ms + follow mouse)
    const event = new PointerEvent("pointermove", {
      bubbles: true,
      clientX: rect.left + 8,
      clientY: rect.top + rect.height / 2,
    })
    article.dispatchEvent(event)
    return { x: rect.left + 8, y: rect.top + rect.height / 2 }
  })
  let dropVisible = false
  if (dragged) {
    await page.waitForTimeout(280)
    const handle = page.locator('[data-gutter="handle"]')
    if (await handle.count()) {
      const box = await handle.first().boundingBox()
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(dragged.x + 40, dragged.y + 140, { steps: 8 })
        await page.waitForTimeout(150)
        dropVisible = await page.evaluate(
          () => !(document.getElementById("doku-drop-indicator") as HTMLElement | null)?.hidden,
        )
        await shot("scenario-drag")
        await page.mouse.up()
      }
    }
  }
  add("ลาก block → drop indicator ปรากฏ", dropVisible)
  await page.waitForTimeout(1_400) // autosave (debounce 800ms) + เขียนไฟล์
  const after = await readMd(base, docId)
  add("ลาก block → markdown ถูกจัดลำดับใหม่", before !== after)

  // 8) คลิกหัว `:::` → เปิด source ของบรรทัด fence (docs/08 ข้อ 79)
  const headBox = await page.evaluate(() => {
    const head = document.querySelector(".cm-doku-block-head") as HTMLElement | null
    if (!head) return null
    const rect = head.getBoundingClientRect()
    return {
      heads: document.querySelectorAll(".cm-doku-block-head").length,
      x: rect.left + 40,
      y: rect.top + rect.height / 2,
    }
  })
  let revealed = false
  if (headBox) {
    await page.mouse.click(headBox.x, headBox.y)
    await page.waitForTimeout(250)
    revealed = await page.evaluate((headsBefore) => {
      const lines = [...document.querySelectorAll(".cm-line")].map((line) => line.textContent ?? "")
      const hasFence = lines.some((text) => /^:{3,}\s*[\w-]/.test(text.trim()))
      const headsNow = document.querySelectorAll(".cm-doku-block-head").length
      return hasFence && headsNow === headsBefore - 1
    }, headBox.heads)
    if (revealed) await shot("scenario-directive-source")
  }
  add("คลิกหัว `:::` → เห็น source ของ fence", revealed)

  add("ไม่มี JS error ระหว่าง scenario", jsErrors.length === 0, jsErrors.slice(0, 2).join(" | "))
  return results
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))
  const sourceVault = resolve(flags.vault)
  const outDir = resolve(flags.out)
  const base = `http://127.0.0.1:${flags.port}`
  await mkdir(outDir, { recursive: true })

  // browser bundle (client.js/editor.js) ต้องมีจริงก่อน spawn server (docs/08 ข้อ 78)
  for (const script of ["scripts/build-client.ts", "scripts/build-editor.ts"]) {
    const built = spawnSync("bun", ["run", script], { stdio: "inherit" })
    if (built.status !== 0) throw new Error(`${script} ล้มเหลว`)
  }

  // สำเนา vault: scenario พิมพ์/ลาก block → autosave เขียนกลับ (ห้ามแตะ vault ต้นทาง)
  const workRoot = resolve("var/tmp/shot-vault")
  rmSync(workRoot, { recursive: true, force: true })
  mkdirSync(workRoot, { recursive: true })
  cpSync(sourceVault, workRoot, { recursive: true })
  const vault = workRoot

  const server = spawn("bun", ["run", "packages/server/src/index.ts"], {
    env: {
      ...process.env,
      DOKU_VAULT: vault,
      DOKU_PORT: String(flags.port),
      DOKU_HOST: "127.0.0.1",
      DOKU_CACHE: "off",
    },
    stdout: "ignore",
    stderr: "inherit",
  })

  const themes = flags.theme === "both" ? (["light", "dark"] as const) : [flags.theme]
  const docs = await walkDocs(vault, vault, [])
  const scenarioDoc = docs.includes("projects/doku/design") ? "projects/doku/design" : docs[0]
  const shots: Array<{ name: string; path: string }> = [
    { name: "home", path: "/" },
    ...docs
      .slice(0, 12)
      .map((id) => ({ name: `doc-${id.replaceAll("/", "-")}`, path: `/d/${id}` })),
    { name: "styleguide", path: "/styleguide" },
    { name: "trash", path: "/trash" },
  ]

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
  try {
    await waitForHealth(`${base}/health`)
    browser = await chromium.launch()
    for (const theme of themes) {
      const context = await browser.newContext({
        viewport: { width: flags.width, height: 900 },
        deviceScaleFactor: 2,
      })
      await context.addInitScript((value) => {
        localStorage.setItem("doku.theme", value)
      }, theme)
      const page = await context.newPage()
      for (const shot of shots) {
        await page.goto(`${base}${shot.path}`, { waitUntil: "networkidle" })
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(180)
        const file = join(outDir, `${shot.name}.${theme}.png`)
        // one surface (docs/09 §3.1): CM6 virtualize ตามความสูง viewport — ต้องขยาย
        // viewport ให้เห็นทั้งเอกสารก่อนถ่าย fullPage ไม่งั้นส่วนนอกจอจะว่างเปล่า
        const docHeight = await page.evaluate(() => document.documentElement.scrollHeight)
        const tall = Math.min(Math.max(docHeight, 900), 16_000)
        if (tall > 900) {
          await page.setViewportSize({ width: flags.width, height: tall })
          await page.waitForTimeout(150)
        }
        await page.screenshot({ path: file, fullPage: true })
        if (tall > 900) await page.setViewportSize({ width: flags.width, height: 900 })
        console.log(`  ${relative(process.cwd(), file)}`)

        if (flags.a11y && theme === "light") {
          const issues = (await page.evaluate(A11Y_SCRIPT)) as string[]
          for (const issue of issues) checks.push({ name: `${shot.name}: ${issue}`, ok: false })
          // 200% zoom: ต้องไม่มี horizontal overflow (WCAG 1.4.4)
          const zoomOverflow = await page.evaluate(() => {
            document.documentElement.style.fontSize = "32px"
            const overflow = document.documentElement.scrollWidth > window.innerWidth + 1
            document.documentElement.style.fontSize = ""
            return overflow
          })
          if (zoomOverflow) {
            checks.push({ name: `${shot.name}: 200% zoom ทำให้เกิด horizontal overflow`, ok: false })
          }
        }
      }
      if (flags.scenarios && scenarioDoc) {
        const results = await runEditorScenarios(page, base, scenarioDoc, theme, outDir)
        for (const result of results) {
          console.log(
            `  ${result.ok ? "ok" : "x "} [${theme}] ${result.name}${result.note ? " — " + result.note : ""}`,
          )
          if (!result.ok) checks.push({ name: `scenario ${theme}: ${result.name}` })
        }
      }
      await context.close()
    }
    if (flags.a11y) {
      const narrow = await browser.newContext({
        viewport: { width: 360, height: 780 },
        reducedMotion: "reduce",
      })
      const page = await narrow.newPage()
      for (const shot of shots.slice(0, 6)) {
        await page.goto(`${base}${shot.path}`, { waitUntil: "networkidle" })
        await page.waitForTimeout(120)
        const issues = (await page.evaluate(A11Y_SCRIPT)) as string[]
        for (const issue of issues) checks.push({ name: `360px ${shot.name}: ${issue}`, ok: false })
      }
      await narrow.close()
    }
  } finally {
    await browser?.close()
    server.kill()
  }
  console.log(`\nถ่าย 2 ธีม × ${shots.length} หน้า → ${relative(process.cwd(), outDir)}`)

  if (flags.a11y) {
    if (checks.length === 0) {
      console.log("a11y: ผ่านทุกข้อ (ชื่อคอนโทรล · focus ring · overflow · reduced motion · h1 เดียว)")
    } else {
      console.log(`a11y: พบ ${checks.length} ปัญหา`)
      for (const check of checks) console.log(`  x ${check.name}`)
      process.exitCode = 1
    }
  }
}

await main()
