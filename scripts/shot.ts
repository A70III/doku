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
}

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
      }
      await context.close()
    }
  } finally {
    await browser?.close()
    server.kill()
  }
  console.log(`\nถ่าย 2 ธีม × ${shots.length} หน้า → ${relative(process.cwd(), outDir)}`)
}

await main()
