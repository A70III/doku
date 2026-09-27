/**
 * M4 REST — assets upload/delete + GET /api/context/*path
 * (docs/05 §3 "Assets / อื่นๆ" · docs/06 path safety + charset · Q7 → docs/08 ข้อ 74)
 */

import { describe, expect, test } from "bun:test"
import {
  assetMimeOf,
  isSafeAssetName,
  memoryRevisionStore,
  memoryVaultFs,
  RENDERER_VERSION,
  type WritableVaultFs,
} from "@doku/core"
import { ASSET_MAX_BYTES, ASSET_MAX_FILES } from "../src/api.ts"
import { createDokuApp } from "../src/app.tsx"
import { FragmentCache } from "../src/cache.ts"
import { DocRenderer } from "../src/doc.ts"
import { SseHub } from "../src/sse.ts"
import { VaultState } from "../src/tree.ts"

function setup(
  files: Record<string, string | Uint8Array> = {},
  options: { readOnly?: boolean } = {},
) {
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
    readOnly: options.readOnly,
  })
  return { app, fs }
}

type App = ReturnType<typeof setup>["app"]

const DOC = "# Design\n\nเนื้อหาหลัก\n"
const META = JSON.stringify({
  title: "Doku Design",
  tags: ["design"],
  status: "draft",
  theme: { mode: "dark" },
  render: { toc: false, math: false, motion: false, diagram: false },
})
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

/** ชื่อ CJK — สร้างจาก code point ให้ repo file มีแต่ ASCII (CJK scan gate ห้ามอักขระจริงในไฟล์) */
const CJK_NAME = `${String.fromCharCode(0x4e2d, 0x6587)}.png`
/** ชื่อที่ละเมิด charset ของ docs/06 (Q7) — `../evil.png` · `a<b>.png` · `a!b.png` */
const BAD_NAMES = ["../evil.png", "a<b>.png", "a!b.png"]

function formOf(names: string | string[], bytes: Uint8Array<ArrayBuffer> = PNG): FormData {
  const form = new FormData()
  for (const name of typeof names === "string" ? [names] : names) {
    form.append("file", new File([bytes], name))
  }
  return form
}

async function upload(app: App, docPath: string, form: FormData): Promise<Response> {
  return app.request(`/api/docs/${docPath}/assets`, { method: "POST", body: form })
}

describe("charset + mime helpers (docs/06 · Q7 → docs/08 ข้อ 74)", () => {
  test("isSafeAssetName — latin/digits/._-/space/ไทย ผ่าน · นอก charset ถูกปฏิเสธ", () => {
    expect(isSafeAssetName("diagram.png")).toBe(true)
    expect(isSafeAssetName("my file 1.PNG")).toBe(true)
    expect(isSafeAssetName("ภาพประกอบ.png")).toBe(true)
    expect(isSafeAssetName("")).toBe(false)
    expect(isSafeAssetName("../evil.png")).toBe(false)
    expect(isSafeAssetName("a<b>.png")).toBe(false)
    expect(isSafeAssetName("a!b.png")).toBe(false)
    expect(isSafeAssetName(CJK_NAME)).toBe(false)
    expect(isSafeAssetName("a#b.png")).toBe(false)
  })

  test("assetMimeOf — allowlist ชุดเดียวกับ route serve · extension ต้องมี . จริง (ข้อ 46)", () => {
    expect(assetMimeOf("x.png")).toBe("image/png")
    expect(assetMimeOf("x.PNG")).toBe("image/png")
    expect(assetMimeOf("x.webm")).toBe("video/webm")
    expect(assetMimeOf("x.pdf")).toBe("application/pdf")
    expect(assetMimeOf("x.html")).toBe(null)
    expect(assetMimeOf("x.exe")).toBe(null)
    expect(assetMimeOf(".png")).toBe(null)
    expect(assetMimeOf("png")).toBe(null)
  })
})

describe("POST /api/docs/*path/assets — multipart upload", () => {
  test("ไฟล์ผ่าน charset → 201 แล้ว GET /assets/ เสิร์ฟ bytes เดิมเป๊ะ", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    const res = await upload(app, "projects/doku/design", formOf("diagram.png"))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.path).toBe("projects/doku/design")
    expect(body.assets).toHaveLength(1)
    // ตำแหน่งเขียน = <โฟลเดอร์ของเอกสาร>/assets/<filename> (docs/05 §1)
    expect(body.assets[0].path).toBe("projects/doku/assets/diagram.png")
    expect(body.assets[0].url).toContain("/assets/projects/doku/assets/diagram.png")
    // `?h=` ต้องเป็น sha256 เต็ม 64 hex (ไม่ใช่ shortHash 12 ตัว) — serve เทียบค่านี้กับ hash จริงก่อนให้ immutable (docs/08 ข้อ 58)
    const claimed = new URL(body.assets[0].url, "http://doku.local").searchParams.get("h") ?? ""
    expect(claimed).toHaveLength(64)
    expect(claimed).toMatch(/^[0-9a-f]{64}$/)
    expect(body.assets[0].content_type).toBe("image/png")

    // bytes บน "disk" = ที่อัปโหลดมา
    expect(await fs.readBytes("projects/doku/assets/diagram.png")).toEqual(PNG)

    // serve กลับ = bytes เดิม + mime allowlist
    const served = await app.request("/assets/projects/doku/assets/diagram.png")
    expect(served.status).toBe(200)
    expect(served.headers.get("content-type")).toBe("image/png")
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG)

    // URL ที่คืนมาใช้ได้จริง: ?h= ตรง hash จริง → serve ให้ immutable (ไม่ใช่ no-cache)
    const cached = await app.request(body.assets[0].url)
    expect(cached.status).toBe(200)
    expect(cached.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
  })

  test("ชื่อไทย (อยู่ใน charset) ผ่าน · เอกสารระดับ root → เขียนที่ assets/", async () => {
    const { app, fs } = setup({ "design.md": DOC })
    const res = await upload(app, "design", formOf("ภาพประกอบ.png"))
    expect(res.status).toBe(201)
    expect((await res.json()).assets[0].path).toBe("assets/ภาพประกอบ.png")
    expect(await fs.exists("assets/ภาพประกอบ.png")).toBe(true)
    expect((await app.request("/assets/assets/ภาพประกอบ.png")).status).toBe(200)
  })

  test("ชื่อละเมิด charset (../evil · a<b> · a!b) → 400 path_invalid + ไม่มีไฟล์หลุดลง disk", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    const before = Object.keys(fs.snapshot()).sort()
    for (const name of BAD_NAMES) {
      const res = await upload(app, "projects/doku/design", formOf(name))
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe("path_invalid")
    }
    // พิสูจน์ว่าไม่มีไฟล์ไหนถูกเขียน (รวม path ที่ `..` ถูก normalize ไป)
    expect(Object.keys(fs.snapshot()).sort()).toEqual(before)
    expect(await fs.exists("projects/doku/assets/evil.png")).toBe(false)
    expect(await fs.exists("projects/doku/evil.png")).toBe(false)
  })

  test("ชื่อ CJK (นอก charset ไทย) → 400 path_invalid + ไม่มีไฟล์บน disk", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    const before = Object.keys(fs.snapshot()).sort()
    const res = await upload(app, "projects/doku/design", formOf(CJK_NAME))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("path_invalid")
    expect(Object.keys(fs.snapshot()).sort()).toEqual(before)
  })

  test("คำขอเดียวมีทั้งไฟล์ดีและไฟล์ไม่ดี = all-or-nothing (ไม่มีไฟล์ดีหลุดลง disk)", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    const before = Object.keys(fs.snapshot()).sort()
    const res = await upload(app, "projects/doku/design", formOf(["good.png", "bad!.png"]))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("path_invalid")
    expect(Object.keys(fs.snapshot()).sort()).toEqual(before)
  })

  test("ชื่อ dotfile (.hidden.png — ผ่าน charset แต่ isSafeVaultPath ปฏิเสธ) ปนกับไฟล์ดี = ไม่มีไฟล์หลุดลง disk", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    const before = Object.keys(fs.snapshot()).sort()
    const res = await upload(app, "projects/doku/design", formOf(["zz-good.png", ".hidden.png"]))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("path_invalid")
    expect(Object.keys(fs.snapshot()).sort()).toEqual(before)
    expect(await fs.exists("projects/doku/assets/zz-good.png")).toBe(false)
    expect(await fs.exists("projects/doku/assets/.hidden.png")).toBe(false)
  })

  test("ชื่อไฟล์ยาวเกิน 255 bytes (NAME_MAX ของ filesystem) → 400 path_invalid + ไม่มีไฟล์หลุดลง disk", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    const before = Object.keys(fs.snapshot()).sort()
    const res = await upload(app, "projects/doku/design", formOf(`${"a".repeat(300)}.png`))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("path_invalid")
    expect(Object.keys(fs.snapshot()).sort()).toEqual(before)
  })

  test("นามสกุลนอก allowlist → 400 asset_type_rejected (ไม่กว้างกว่า route serve)", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    const res = await upload(app, "projects/doku/design", formOf("page.html"))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("asset_type_rejected")
    expect(await fs.exists("projects/doku/assets/page.html")).toBe(false)

    // allowlist ของ upload ต้องตรง serve — เขียน .html ตรง ๆ แล้ว GET /assets/ ก็ 404 เหมือนกัน
    await fs.writeBytes("projects/doku/assets/direct.html", PNG)
    expect((await app.request("/assets/projects/doku/assets/direct.html")).status).toBe(404)
  })

  test("ไฟล์ใหญ่กว่า 25 MB → 413 too_large + ไม่เขียน", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    const before = Object.keys(fs.snapshot()).sort()
    const big = new Uint8Array(ASSET_MAX_BYTES + 1)
    const res = await upload(app, "projects/doku/design", formOf("huge.png", big))
    expect(res.status).toBe(413)
    expect((await res.json()).error.code).toBe("too_large")
    expect(Object.keys(fs.snapshot()).sort()).toEqual(before)
  })

  test("เกิน 20 ไฟล์/คำขอ → 400 invalid_body + ไม่เขียน", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    const before = Object.keys(fs.snapshot()).sort()
    const names: string[] = []
    for (let index = 0; index <= ASSET_MAX_FILES; index += 1) names.push(`f${index}.png`)
    const res = await upload(app, "projects/doku/design", formOf(names))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("invalid_body")
    expect(Object.keys(fs.snapshot()).sort()).toEqual(before)
  })

  test("หลายไฟล์ในคำขอเดียว → เขียนครบทุกไฟล์", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    const res = await upload(app, "projects/doku/design", formOf(["a.png", "b.jpg"]))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.assets.map((item: { path: string }) => item.path)).toEqual([
      "projects/doku/assets/a.png",
      "projects/doku/assets/b.jpg",
    ])
    expect(await fs.exists("projects/doku/assets/a.png")).toBe(true)
    expect(await fs.exists("projects/doku/assets/b.jpg")).toBe(true)
  })

  test("ไม่ใช่ multipart → 400 invalid_body · multipart ไม่มีไฟล์ → 400 invalid_body", async () => {
    const { app } = setup({ "projects/doku/design.md": DOC })
    const json = await app.request("/api/docs/projects/doku/design/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ md: "x" }),
    })
    expect(json.status).toBe(400)
    expect((await json.json()).error.code).toBe("invalid_body")

    const noFile = new FormData()
    noFile.set("note", "hi")
    const res = await upload(app, "projects/doku/design", noFile)
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("invalid_body")
  })

  test("path traversal ผ่าน URL → 400 path_invalid · readOnly → 503 read_only", async () => {
    const { app } = setup({})
    const traversal = await upload(app, "..%2F..%2Fetc%2Fx", formOf("x.png"))
    expect(traversal.status).toBe(400)
    expect((await traversal.json()).error.code).toBe("path_invalid")

    const readOnly = setup({}, { readOnly: true })
    const blocked = await upload(readOnly.app, "design", formOf("x.png"))
    expect(blocked.status).toBe(503)
    expect((await blocked.json()).error.code).toBe("read_only")
  })
})

describe("DELETE /api/assets/*path", () => {
  test("ลบ → 200 soft-delete (kind: asset) แล้ว GET /assets/ → 404", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    await upload(app, "projects/doku/design", formOf("diagram.png"))
    expect(await fs.exists("projects/doku/assets/diagram.png")).toBe(true)

    const del = await app.request("/api/assets/projects/doku/assets/diagram.png", {
      method: "DELETE",
    })
    expect(del.status).toBe(200)
    const body = await del.json()
    expect(body.path).toBe("projects/doku/assets/diagram.png")
    expect(body.trash.kind).toBe("asset")

    // หายจาก vault → serve 404 · อยู่ใน trash (soft-delete — invariant 7)
    expect(await fs.exists("projects/doku/assets/diagram.png")).toBe(false)
    expect((await app.request("/assets/projects/doku/assets/diagram.png")).status).toBe(404)
    const trash = await (await app.request("/api/trash")).json()
    expect(trash.items).toHaveLength(1)
    expect(trash.items[0].kind).toBe("asset")
  })

  test("ไม่มีไฟล์ → 404 · path traversal → 400 · โฟลเดอร์ (ไม่มี extension) → 404", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    expect(
      (await app.request("/api/assets/projects/doku/assets/nope.png", { method: "DELETE" })).status,
    ).toBe(404)

    const traversal = await app.request("/api/assets/..%2F..%2Fetc%2Fpasswd.png", {
      method: "DELETE",
    })
    expect(traversal.status).toBe(400)
    expect((await traversal.json()).error.code).toBe("path_invalid")

    expect((await app.request("/api/assets/projects", { method: "DELETE" })).status).toBe(404)
    // โฟลเดอร์ต้องยังอยู่ครบ (ไม่ถูกลบทางอ้อม)
    expect(await fs.exists("projects")).toBe(true)
  })

  test("ไฟล์ชื่อละเมิด charset บน disk → ลบไม่ได้ (400) + ไฟล์ยังอยู่", async () => {
    const { app, fs } = setup({})
    await fs.writeBytes(`projects/doku/assets/${CJK_NAME}`, PNG)
    const res = await app.request(`/api/assets/projects/doku/assets/${CJK_NAME}`, {
      method: "DELETE",
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe("path_invalid")
    expect(await fs.exists(`projects/doku/assets/${CJK_NAME}`)).toBe(true)
  })

  test("sidecar (design.meta.json / _folder.meta.json) ไม่ใช่ asset-store path → 404 + ไฟล์อยู่ครบ", async () => {
    const { app, fs } = setup({
      "projects/doku/design.md": DOC,
      "projects/doku/design.meta.json": META,
    })
    await fs.writeBytes(
      "projects/_folder.meta.json",
      new TextEncoder().encode(JSON.stringify({ color: "blue" })),
    )

    // ทั้งสองไฟล์มีนามสกุลใน allowlist (json) และชื่อผ่าน charset — ต้องถูก gate `assets` segment กันไว้
    for (const sidecar of ["projects/doku/design.meta.json", "projects/_folder.meta.json"]) {
      const res = await app.request(`/api/assets/${sidecar}`, { method: "DELETE" })
      expect(res.status).toBe(404)
      expect((await res.json()).error.code).toBe("not_found")
      expect(await fs.exists(sidecar)).toBe(true)
    }

    // meta ของเอกสารยังอ่านได้ — GET /api/context ยังคืน title เดิม
    const context = await (await app.request("/api/context/projects/doku/design")).json()
    expect(context.meta.title).toBe("Doku Design")
  })
})

describe("GET /api/context/*path — md + meta สรุปสั้นสำหรับ prompt", () => {
  test("คืน md + meta summary (ตัด config ที่ไม่เกี่ยวกับเนื้อหา) + words/bytes", async () => {
    const { app } = setup({
      "projects/doku/design.md": DOC,
      "projects/doku/design.meta.json": META,
    })
    const res = await app.request("/api/context/projects/doku/design")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.path).toBe("projects/doku/design")
    expect(body.md).toBe(DOC)
    expect(body.meta.title).toBe("Doku Design")
    expect(body.meta.tags).toEqual(["design"])
    expect(body.meta.status).toBe("draft")
    expect(body.meta.pinned).toBe(false)
    expect(body.meta.relations).toEqual({ related: [], moved_from: [] })
    // summary ต้องไม่พกค่า config ของ render/theme ไปด้วย
    expect(body.meta.theme).toBeUndefined()
    expect(body.meta.render).toBeUndefined()
    expect(body.words).toBe(3)
    expect(body.bytes).toBe(new TextEncoder().encode(DOC).byteLength)
  })

  test("ไม่พบ → 404 · path traversal → 400 · โฟลเดอร์ (ไม่ใช่ doc) → 404", async () => {
    const { app } = setup({ "projects/doku/design.md": DOC })
    expect((await app.request("/api/context/missing")).status).toBe(404)

    const traversal = await app.request("/api/context/..%2F..%2Fetc%2Fpasswd")
    expect(traversal.status).toBe(400)
    expect((await traversal.json()).error.code).toBe("path_invalid")

    expect((await app.request("/api/context/projects")).status).toBe(404)
  })

  test("ไม่มี sidecar → ใช้ meta default (title เดาจากชื่อไฟล์)", async () => {
    const { app } = setup({ "projects/doku/design.md": DOC })
    const body = await (await app.request("/api/context/projects/doku/design")).json()
    expect(body.meta.title).toBe("design")
    expect(body.meta.status).toBe("active")
    expect(body.meta.tags).toEqual([])
  })
})

describe("mime allowlist — observable parity ระหว่าง upload และ serve (app.tsx ASSET_MIME)", () => {
  // ทั้ง 11 นามสกุลที่ serve ยอมรับ: upload ต้อง 201 และ GET /assets/ ต้อง 200 ทุกตัว
  const ALLOWED_EXTENSIONS = [
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "svg",
    "mp4",
    "webm",
    "mp3",
    "json",
    "pdf",
  ]

  test("นามสกุลใน allowlist (11 ตัว): upload → 201 + GET /assets/ → 200", async () => {
    const { app } = setup({ "projects/doku/design.md": DOC })
    for (const ext of ALLOWED_EXTENSIONS) {
      const res = await upload(app, "projects/doku/design", formOf(`x.${ext}`))
      expect(res.status).toBe(201)
      expect((await res.json()).assets[0].path).toBe(`projects/doku/assets/x.${ext}`)
      const served = await app.request(`/assets/projects/doku/assets/x.${ext}`)
      expect(served.status).toBe(200)
    }
  })

  test("นามสกุลนอก allowlist: upload → 400 asset_type_rejected · เขียนตรง ๆ แล้ว GET /assets/ → 404", async () => {
    const { app, fs } = setup({ "projects/doku/design.md": DOC })
    for (const ext of ["html", "txt", "exe", "md"]) {
      const res = await upload(app, "projects/doku/design", formOf(`x.${ext}`))
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe("asset_type_rejected")
      expect(await fs.exists(`projects/doku/assets/x.${ext}`)).toBe(false)

      // serve ต้องปฏิเสธไฟล์ชนิดเดียวกันที่เขียนลง disk ตรง ๆ — allowlist สองฝั่งเท่ากัน observable
      await fs.writeBytes(`projects/doku/assets/direct.${ext}`, PNG)
      expect((await app.request(`/assets/projects/doku/assets/direct.${ext}`)).status).toBe(404)
    }
  })
})
