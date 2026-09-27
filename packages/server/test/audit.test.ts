/**
 * S3 (M4) — audit log: append-only JSONL ที่ `var/audit.log` (docs/06)
 *
 * พิสูจน์: ทุก write op = 1 บรรทัด (field `ts/actor/action/path` ครบ · `etag`/`ip` มีเมื่อมีจริง) ·
 * log เขียนไม่ได้ต้องไม่ fail write (best-effort) · **ไม่มี route/export ที่ตัดหรือล้าง log ได้**
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  memoryRevisionStore,
  memoryVaultFs,
  RENDERER_VERSION,
  type WritableVaultFs,
} from "@doku/core"
import { createDokuApp } from "../src/app.tsx"
import * as audit from "../src/audit.ts"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"

/** var root ชั่วคราว — ชี้ `DOKU_VAR` ให้เหมือน server จริง (`src/index.ts` resolve ตัวนี้) */
let varDir = ""
const savedVar = process.env.DOKU_VAR

beforeEach(() => {
  varDir = mkdtempSync(join(tmpdir(), "doku-audit-"))
  process.env.DOKU_VAR = varDir
})

afterEach(() => {
  if (savedVar === undefined) delete process.env.DOKU_VAR
  else process.env.DOKU_VAR = savedVar
})

function setup(files: Record<string, string | Uint8Array> = {}) {
  const fs = memoryVaultFs(files) as WritableVaultFs & ReturnType<typeof memoryVaultFs>
  const state = new VaultState(fs, "vault")
  const cache = new FragmentCache(null, RENDERER_VERSION)
  const renderer = new DocRenderer(fs, state, cache)
  const hub = new SseHub()
  const app = createDokuApp({
    fs,
    vaultName: "vault",
    state,
    renderer,
    hub,
    trash: fs.trashStore(),
    revisions: memoryRevisionStore(),
  })
  return { app, fs }
}

type App = ReturnType<typeof setup>["app"]

interface AuditLine {
  ts: string
  actor: string
  action: string
  path: string
  etag?: string
  ip?: string
  to?: string
}

function auditFile(): string {
  return join(varDir, "audit.log")
}

function lines(): AuditLine[] {
  if (!existsSync(auditFile())) return []
  return readFileSync(auditFile(), "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as AuditLine)
}

const DOC = "# Audit\n\nเนื้อหา\n"
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

const AGENT = { "content-type": "application/json", "user-agent": "hermes-agent/1.0" }

function postJson(app: App, path: string, body: unknown, headers: Record<string, string> = AGENT) {
  return app.request(path, { method: "POST", headers, body: JSON.stringify(body) })
}

describe("var/audit.log — 1 บรรทัดต่อ write op (docs/06)", () => {
  test("doc create → update → move → delete(soft) → restore = 5 บรรทัดตามลำดับ + field ครบ", async () => {
    const { app } = setup({})

    const created = await postJson(app, "/api/docs/notes/a", { md: DOC })
    expect(created.status).toBe(201)
    const etag = created.headers.get("etag") ?? ""

    const updated = await app.request("/api/docs/notes/a", {
      method: "PUT",
      headers: { ...AGENT, "if-match": etag },
      body: JSON.stringify({ md: "# v2\n" }),
    })
    expect(updated.status).toBe(200)

    const moved = await postJson(app, "/api/docs/notes/a/move", { to: "notes/b" })
    expect(moved.status).toBe(200)

    const deleted = await app.request("/api/docs/notes/b", { method: "DELETE", headers: AGENT })
    expect(deleted.status).toBe(200)
    const trashId = ((await deleted.json()) as { trash: { id: string } }).trash.id

    const restored = await app.request(`/api/trash/${trashId}/restore`, {
      method: "POST",
      headers: AGENT,
    })
    expect(restored.status).toBe(200)

    const entries = lines()
    // หนึ่ง write op = หนึ่งบรรทัด (ไม่มากไม่น้อยกว่าจำนวนคำขอที่สำเร็จ)
    expect(entries).toHaveLength(5)
    expect(entries.map((entry) => entry.action)).toEqual([
      "doc.create",
      "doc.update",
      "doc.move",
      "doc.delete",
      "doc.restore",
    ])
    expect(entries.map((entry) => entry.path)).toEqual([
      "notes/a",
      "notes/a",
      "notes/a",
      "notes/b",
      "notes/b",
    ])
    for (const entry of entries) {
      // field บังคับของ docs/06
      expect(typeof entry.ts).toBe("string")
      expect(Number.isNaN(Date.parse(entry.ts))).toBe(false)
      expect(entry.actor).toBe("hermes-agent")
      expect(typeof entry.action).toBe("string")
      expect(typeof entry.path).toBe("string")
      // ห้ามแต่ง token/identity (LAN ไม่มี auth)
      expect(entry).not.toHaveProperty("token")
    }
    // etag มาจริงเฉพาะ create/update (ค่าหลังเขียน = ที่ response คืน)
    expect(entries[0]?.etag).toBe(etag.replaceAll('"', ""))
    expect(entries[1]?.etag).toBeTruthy()
    expect(entries[2]?.etag).toBeUndefined()
    // move มีปลายทาง
    expect(entries[2]?.to).toBe("notes/b")
  })

  test("folder create/update/move/delete + asset upload/delete — ทุก op 1 บรรทัด", async () => {
    const { app } = setup({ "projects/a.md": DOC })

    expect((await app.request("/api/folders/projects/new", { method: "POST" })).status).toBe(201)
    const patched = await app.request("/api/folders/projects/new", {
      method: "PATCH",
      headers: AGENT,
      body: JSON.stringify({ title: "New folder", icon: "folder-open", color: "#2b5fc4" }),
    })
    expect(patched.status).toBe(200)
    const folderMoved = await postJson(app, "/api/folders/projects/new/move", {
      to: "projects/moved",
    })
    expect(folderMoved.status).toBe(200)
    expect(
      (await app.request("/api/folders/projects/moved?recursive=true", { method: "DELETE" }))
        .status,
    ).toBe(200)

    const form = new FormData()
    form.append("file", new File([PNG], "diagram.png"))
    const upload = await app.request("/api/docs/projects/a/assets", { method: "POST", body: form })
    expect(upload.status).toBe(201)

    const assetDeleted = await app.request("/api/assets/projects/assets/diagram.png", {
      method: "DELETE",
    })
    expect(assetDeleted.status).toBe(200)

    const entries = lines()
    expect(entries.map((entry) => entry.action)).toEqual([
      "folder.create",
      "folder.update",
      "folder.move",
      "folder.delete",
      "asset.upload",
      "asset.delete",
    ])
    expect(entries.map((entry) => entry.path)).toEqual([
      "projects/new",
      "projects/new",
      "projects/new",
      "projects/moved",
      "projects/assets/diagram.png",
      "projects/assets/diagram.png",
    ])
    expect(entries[2]?.to).toBe("projects/moved")
    expect(entries.every((entry) => typeof entry.ts === "string")).toBe(true)
  })

  test("actor/ip ที่มีจริงเท่านั้น — browser = web · agent = หัว UA · ไม่มี header = ไม่เดา", async () => {
    const { app } = setup({})

    const web = await app.request("/api/docs/x", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "x-forwarded-for": "192.168.1.105, 10.0.0.1",
      },
      body: JSON.stringify({ md: DOC }),
    })
    expect(web.status).toBe(201)

    const agent = await app.request("/api/docs/y", {
      method: "POST",
      headers: { ...AGENT, "x-real-ip": "192.168.1.77" },
      body: JSON.stringify({ md: DOC }),
    })
    expect(agent.status).toBe(201)

    const bare = await app.request("/api/docs/z", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ md: DOC }),
    })
    expect(bare.status).toBe(201)

    const entries = lines()
    expect(entries).toHaveLength(3)
    expect(entries[0]?.actor).toBe("web")
    expect(entries[0]?.ip).toBe("192.168.1.105")
    expect(entries[1]?.actor).toBe("hermes-agent")
    expect(entries[1]?.ip).toBe("192.168.1.77")
    expect(entries[2]?.actor).toBe("lan")
    // ip ไม่มี header จริง = ไม่ใส่ field (ไม่เดา address ขึ้นเอง)
    expect(entries[2]?.ip).toBeUndefined()
  })

  test("log เขียนไม่ได้ → write ยัง 201 (best-effort ห้าม throw เข้า request path)", async () => {
    // DOKU_VAR ชี้ผ่านไฟล์ปกติ → mkdir/append ต้องล้ม (ENOTDIR)
    const blocker = join(varDir, "not-a-dir")
    writeFileSync(blocker, "x")
    process.env.DOKU_VAR = join(blocker, "sub")

    const { app } = setup({})
    const doc = await postJson(app, "/api/docs/ok", { md: DOC })
    expect(doc.status).toBe(201)
    expect((await app.request("/api/folders/f", { method: "POST" })).status).toBe(201)

    // ไม่มีไฟล์ audit หลุดออกมา + ตัวเขียนไม่ throw
    expect(existsSync(join(blocker, "sub", "audit.log"))).toBe(false)
  })

  test("var root ตัวเดียวกับ var/revisions — DOKU_VAR เปลี่ยน = ไฟล์ที่อ่านเปลี่ยนตาม", async () => {
    const { app } = setup({})
    expect((await postJson(app, "/api/docs/where", { md: DOC })).status).toBe(201)
    // `auditLogPath()` resolve เหมือน createNodeRevisionStore: varDir/audit.log
    expect(audit.auditLogPath()).toBe(join(varDir, "audit.log"))
    expect(audit.auditLogPath(join(varDir, "x"))).toBe(join(varDir, "x", "audit.log"))
    expect(existsSync(join(varDir, "audit.log"))).toBe(true)
    // ไม่มี revision/audit ไปปนกัน (ไฟล์คนละชื่อใน var เดียวกัน)
    expect(existsSync(join(varDir, "revisions"))).toBe(false)
  })
})

describe("append-only — ไม่มีทาง truncate/ล้าง log ได้จากระบบ", () => {
  test("audit module export ได้แค่เขียน/ถามตำแหน่ง — ไม่มีตัวล้าง", () => {
    const names = Object.keys(audit).sort()
    expect(names).toEqual(["auditLog", "auditLogPath"])
    for (const name of names) {
      expect(name).not.toMatch(/truncate|purge|clear|reset|rotate|wipe|delete|remove|empty/i)
    }
    // audit.ts ห่อ writer ของ fs-node — ตัวมันเองไม่แตะ fs เลย
    const source = readFileSync(new URL("../src/audit.ts", import.meta.url), "utf8")
    expect(source).toMatch(/logAudit\(/)
    expect(source).not.toMatch(
      /(appendFileSync|writeFileSync|unlink|truncate|rmSync|rmdirSync)\s*\(/,
    )
    // writer จริง (fs-node) มีแค่ append — ไม่มี call ที่ลบ/ตัดไฟล์ (append-only ทุก channel)
    const writer = readFileSync(new URL("../../fs-node/src/audit-log.ts", import.meta.url), "utf8")
    expect(writer).toMatch(/appendFileSync\(/)
    expect(writer).not.toMatch(/(unlink|truncate|rmSync|rmdirSync|writeFileSync)\s*\(/)
  })

  test("ไม่มี HTTP route ที่ชื่อมี audit — อ่าน log ไม่ใช่เรื่องของ server", () => {
    const { app } = setup({})
    const routes = (app as unknown as { routes: { path: string; method: string }[] }).routes
    expect(routes.length).toBeGreaterThan(0)
    for (const route of routes) expect(route.path).not.toContain("audit")
    expect(routes.some((route) => route.path.includes("/trash/empty"))).toBe(true)
  })

  test("ครบทุก write op — revision restore กับ trash purge ก็ถูกบันทึก", async () => {
    const { app } = setup({})
    const created = await postJson(app, "/api/docs/audit/x", { md: "# v1\n" })
    expect(created.status).toBe(201)
    const updated = await app.request("/api/docs/audit/x", {
      method: "PUT",
      headers: { ...AGENT, "if-match": created.headers.get("etag") ?? "" },
      body: JSON.stringify({ md: "# v2\n" }),
    })
    expect(updated.status).toBe(200)

    // กู้จาก revision ล่าสุด (revision ของ v1 ถูกเก็บตอน PUT)
    const restored = await postJson(app, "/api/revisions/audit/x", {})
    expect(restored.status).toBe(200)

    const deleted = await app.request("/api/docs/audit/x", { method: "DELETE", headers: AGENT })
    expect(deleted.status).toBe(200)
    const emptied = await app.request("/api/trash/empty", { method: "POST" })
    expect(emptied.status).toBe(200)

    const entries = lines()
    expect(entries.map((entry) => entry.action)).toEqual([
      "doc.create",
      "doc.update",
      "doc.revision_restore",
      "doc.delete",
      "doc.purge",
    ])
    expect(entries[4]?.path).toBe("audit/x")
  })

  test("api.ts แตะ audit เฉพาะผ่าน auditLog(...) — ไม่เขียน/ลบไฟล์เอง", () => {
    const source = readFileSync(new URL("../src/api.ts", import.meta.url), "utf8")
    const touched = source
      .split("\n")
      .map((line, index) => (line.toLowerCase().includes("audit") ? `${index + 1}: ${line}` : null))
      .filter((line): line is string => line !== null)
    // มีทั้ง import + hook call — ทุกบรรที่ต้องเป็น import ของ audit หรือเรียก `auditLog(context` เท่านั้น
    expect(touched.length).toBeGreaterThanOrEqual(12)
    for (const line of touched) {
      const code = line.slice(line.indexOf(":") + 1).trim()
      expect(code).toMatch(/^(import \{ auditLog \} from "\.\/audit\.ts")|auditLog\(context/)
    }
    // ไม่มีชื่อไฟล์/การเขียนไฟล์ audit ตรง ๆ ใน api.ts
    expect(source).not.toContain("audit.log")
    for (const line of source.split("\n")) {
      if (!line.includes("auditLog(")) continue
      expect(line).not.toMatch(
        /(unlink|truncate|writeFileSync|appendFileSync|remove|writeText)\s*\(/,
      )
    }
  })
})
