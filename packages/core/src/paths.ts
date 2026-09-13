/**
 * Path utilities ของ vault — เขียนเองเป็น POSIX ล้วน ไม่ใช้ node:path
 *
 * เหตุผล: `core` ต้อง isomorphic (รันใน test/CLI/server ได้) และ vault path ใช้ `/`
 * เสมอไม่ว่า OS ไหน → การ normalize ต้อง determinism เท่ากันทุก environment
 * (path safety ของจริงยังต้อง realpath check อีกชั้นที่ fs adapter — ดู docs/06)
 */

export class PathError extends Error {
  readonly code: string
  constructor(message: string, code = "path_invalid") {
    super(message)
    this.name = "PathError"
    this.code = code
  }
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: การกัน control char ใน path คือจุดประสงค์ของ regex นี้ (docs/06)
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
// `#` อยู่ใน forbidden ด้วย: HTTP แยก fragment ให้แล้ว (browser ไม่ส่ง `#` มาให้ server)
// ถ้าเราตัด `#` ทิ้งอีกชั้น ไฟล์ชื่อ `a#b.md` จะถูกเปิดเป็น `a.md` แบบเงียบ ๆ (docs/08 ข้อ 56)
const FORBIDDEN_CHARS = /[<>:"|?*\\#]/

/**
 * path สัมพัทธ์จาก vault รูปแบบเดียวที่ยอมรับ
 * - ไม่ขึ้นต้น `/` ไม่ลงท้าย `/` ไม่มี segment ว่าง
 * - ไม่มี `.` / `..` / ตัวอักษรควบคุม / `<>:"|?*\#`
 * - ไม่มี dotfile/dotfolder (`vault/.trash`, `.git` ต้องไม่ถูกอ้างเป็น path)
 */
export function isSafeVaultPath(rel: string): boolean {
  if (!rel || rel.startsWith("/") || rel.endsWith("/")) return false
  if (CONTROL_CHARS.test(rel) || FORBIDDEN_CHARS.test(rel)) return false
  for (const segment of rel.split("/")) {
    if (!segment || segment === "." || segment === "..") return false
    if (segment.startsWith(".")) return false
  }
  return true
}

export interface NormalizePathOptions {
  /** ชื่อโฟลเดอร์ vault เผื่อผู้ใช้พิมพ์ `vault/projects/x` มา — จะถูกตัดออก */
  vaultName?: string
  /** ตัด `.md` / `.meta.json` ท้าย path (default true = ได้ path id) */
  stripSuffix?: boolean
}

/**
 * แปลง input จากคน/agent เป็น vault path สะอาด
 * รับได้ทั้ง `projects/doku/design`, `/d/projects/doku/design`, `./design.md`, `vault/design.md`
 */
export function normalizeVaultPath(input: string, options: NormalizePathOptions = {}): string {
  const { vaultName, stripSuffix = true } = options
  let path = input.trim()
  if (!path) throw new PathError("path ว่าง")

  // `/d/<path>` (URL) → `<path>`
  if (path.startsWith("/d/")) path = path.slice(3)
  // ตัด query ที่อาจติดมา (`?` อยู่ใน FORBIDDEN_CHARS อยู่แล้ว จึงตัดได้ปลอดภัย)
  // **ไม่ตัด `#`** — path ที่มาจาก URL/API ถือว่า `#` คือชื่อไฟล์จริง (ถ้ามี = ไม่ผ่าน validation)
  path = path.split("?")[0] ?? path

  while (path.startsWith("./")) path = path.slice(2)
  while (path.startsWith("/")) path = path.slice(1)

  if (vaultName) {
    const prefix = `${vaultName.replace(/\/+$/, "")}/`
    while (path.startsWith(prefix)) path = path.slice(prefix.length)
  }

  if (stripSuffix) {
    while (path.endsWith(".md") || path.endsWith(".meta.json")) {
      path = path.endsWith(".meta.json") ? path.slice(0, -10) : path.slice(0, -3)
    }
  }

  path = path
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/")

  if (!isSafeVaultPath(path)) {
    throw new PathError(`path ไม่ปลอดภัยหรือไม่ถูกต้อง: ${input}`, "path_invalid")
  }
  return path
}

export function dirnameOf(path: string): string {
  const index = path.lastIndexOf("/")
  return index === -1 ? "" : path.slice(0, index)
}

export function basenameOf(path: string): string {
  const index = path.lastIndexOf("/")
  return index === -1 ? path : path.slice(index + 1)
}

/**
 * resolve path สัมพัทธ์ (จาก markdown) เทียบกับโฟลเดอร์ของเอกสาร
 * คืน `null` ถ้าหลุด vault / ได้ path ไม่ปลอดภัย → ผู้เรียกออก warning `*_unsafe`
 */
export function resolveRelativePath(baseDir: string, relative: string): string | null {
  const withoutHash = (relative.split("#")[0] ?? relative).split("?")[0] ?? ""
  const decoded = safeDecode(withoutHash)
  if (!decoded) return null

  const stack = decoded.startsWith("/") ? [] : baseDir ? baseDir.split("/") : []
  for (const segment of decoded.split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (stack.length === 0) return null
      stack.pop()
      continue
    }
    stack.push(segment)
  }
  const resolved = stack.join("/")
  return resolved && isSafeVaultPath(resolved) ? resolved : null
}

function safeDecode(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value)
    return CONTROL_CHARS.test(decoded) ? null : decoded
  } catch {
    return null
  }
}

export function encodeVaultUrl(prefix: string, vaultPath: string, suffix = ""): string {
  const encoded = vaultPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  return `${prefix}/${encoded}${suffix}`
}

/** path id → URL ของหน้าเอกสาร (`/d/projects/doku/design`) */
export function docUrl(id: string): string {
  return encodeVaultUrl("/d", id)
}

/** vault path ของ asset → URL ที่ serve จริง (`/assets/<path>?h=<hash>`) */
export function assetUrl(vaultPath: string, hash: string): string {
  return encodeVaultUrl("/assets", vaultPath, `?h=${hash}`)
}

/** `.md` path ใน vault → path id */
export function docIdFromMdPath(mdPath: string): string {
  return mdPath.endsWith(".md") ? mdPath.slice(0, -3) : mdPath
}

/** path id → path ไฟล์ใน vault */
export function mdPathFromDocId(id: string): string {
  return `${id}.md`
}

export function metaPathFromDocId(id: string): string {
  return `${id}.meta.json`
}

/**
 * แปลง "ข้อความอิสระ" ที่คน/agent พิมพ์ (CLI arg, wikilink target) เป็น vault path
 *
 * ต่างจาก `normalizeVaultPath` ตรงที่ **ตัด `#<anchor>` ได้** เพราะข้อความอิสระมี anchor ได้จริง
 * (`[[design#callout]]`, `doku render design#callout`) — ส่วน path จาก URL/API ไม่ควรมี anchor
 * (HTTP แยก fragment ให้แล้ว — docs/08 ข้อ 56)
 */
export function normalizeLinkTarget(input: string, options: NormalizePathOptions = {}): string {
  const withoutAnchor = input.trim().split("#")[0] ?? input
  return normalizeVaultPath(withoutAnchor, options)
}
