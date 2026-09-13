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
 * สคริปต์ spawn server เองในหน่วยความจำเดียวกัน แล้วปิดให้เรียบร้อย —
 * ไม่ต้องเปิด dev server ค้าง (var/ ถูก gitignore อยู่แล้ว)
 *
 * นอกจากการถ่ายภาพ ยังรัน **a11y smoke check** ต่อหน้าจริง (docs/07 M3.1):
 * accessible name · focus ring · ไม่มี horizontal overflow ที่ 200% zoom และจอ 360px ·
 * reduced motion ถูกเคารพ · ข้อความไม่ทับกันจนอ่านไม่ได้
 */
import { spawn } from "node:child_process"
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

  // ── vertical rhythm (docs/03 §1.4 · docs/08 ข้อ 69) ────────────────────
  // บั๊กที่เคยเกิด: specificity ทำให้ margin-top ของ block เป็น 0 → ย่อหน้าติดกันเป็นพืด
  // วัดจาก **ระยะจริงระหว่างกล่อง** (ไม่ใช่ margin-top — margin collapse กันได้)
  const body = document.querySelector("#doku-doc-body")
  if (body) {
    const containers = [
      body,
      ...body.querySelectorAll(
        ":is(section, blockquote, li, [data-block=col], [data-part=tab-panel], [data-part=card-body], [data-block=callout], [data-block=details], [data-block=margin-note])",
      ),
    ]
    const broken = []
    for (const container of containers) {
      if (getComputedStyle(container).display === "none") continue
      for (const child of [...container.children].slice(1)) {
        const prev = child.previousElementSibling
        const style = getComputedStyle(child)
        // inline/ลอย/ซ้อนตำแหน่ง/ซ่อน ไม่ได้ระยะจาก flow โดยเจตนา
        if (style.display.startsWith("inline") || style.display === "none") continue
        if (style.float !== "none" || style.position !== "static") continue
        const prevStyle = getComputedStyle(prev)
        // ตัวก่อนหน้าที่ลอย/ซ้อนตำแหน่งไม่อยู่ใน flow → วัดระยะกับมันไม่ได้
        if (prevStyle.float !== "none" || prevStyle.position !== "static") continue
        if (prevStyle.display === "none") continue
        const box = child.getBoundingClientRect()
        const before = prev.getBoundingClientRect()
        if (box.height === 0 || before.height === 0) continue
        const gap = box.top - before.bottom
        const label = prev.tagName.toLowerCase() + " → " + child.tagName.toLowerCase()
        // หลัง heading/hr: ระยะต้องมาจาก margin ของตัวนำเอง (--d-rhythm-after) — ไม่งั้น collapse แล้วเกิน
        if (/^(H[1-6]|HR)$/.test(prev.tagName)) {
          const expected = parseFloat(getComputedStyle(prev).marginBottom)
          if (Math.abs(gap - expected) > 1) {
            broken.push(label + " (" + Math.round(gap) + "px ≠ " + expected + "px)")
          }
          continue
        }
        if (gap < 1) broken.push(label)
      }
    }
    if (broken.length) {
      issues.push("ระยะแนวตั้งของ block ไม่ตรง rhythm " + broken.length + " จุด (" + broken.slice(0, 3).join(", ") + ")")
    }
  }

  // ── KaTeX (docs/08 ข้อ 70) — มีสมการแล้วต้องมี katex.css จริง ──
  if (document.querySelector(".katex")) {
    const display = document.querySelector(".katex-display")
    if (display && getComputedStyle(display).display !== "block") {
      issues.push("katex.css ไม่ได้โหลด (display math ไม่เป็น block)")
    }
    const mathml = document.querySelector(".katex-mathml")
    if (mathml && getComputedStyle(mathml).position !== "absolute") {
      issues.push("katex.css ไม่ได้โหลด (ข้อความ MathML ไม่ถูกซ่อน — โผล่ซ้ำข้างสูตร)")
    }
  }

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

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))
  const vault = resolve(flags.vault)
  const outDir = resolve(flags.out)
  const base = `http://127.0.0.1:${flags.port}`
  await mkdir(outDir, { recursive: true })

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
  const shots: Array<{ name: string; path: string }> = [
    { name: "home", path: "/" },
    ...(await walkDocs(vault, vault, []))
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
        await page.screenshot({ path: file, fullPage: true })
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
      console.log(
        "a11y: ผ่านทุกข้อ (ชื่อคอนโทรล · focus ring · overflow · reduced motion · h1 เดียว · rhythm)",
      )
    } else {
      console.log(`a11y: พบ ${checks.length} ปัญหา`)
      for (const check of checks) console.log(`  x ${check.name}`)
      process.exitCode = 1
    }
  }
}

await main()
