/**
 * fs adapter — `core` ห้าม import `node:fs` ตรงๆ (hard invariant)
 * ผู้เรียก (CLI/server/test) เป็นเจ้าของ I/O จริง และต้องทำ path safety ของตัวเอง
 * (safeJoin: resolve + prefix check + realpath — docs/06) ก่อนเรียก adapter
 */

export interface VaultEntry {
  name: string
  type: "file" | "dir"
}

export interface VaultFs {
  /** อ่านไฟล์เป็น text — คืน `null` ถ้าไม่มีไฟล์ */
  readText(rel: string): Promise<string | null>
  /** อ่านไฟล์เป็น bytes — คืน `null` ถ้าไม่มีไฟล์ (ใช้ hash asset) */
  readBytes(rel: string): Promise<Uint8Array | null>
  /** list เนื้อในโฟลเดอร์ (rel = "" คือ root) — ข้าม dotfile/dotfolder ได้เลย */
  list(rel: string): Promise<VaultEntry[]>
}

export function isDotEntry(name: string): boolean {
  return name.startsWith(".")
}

/** adapter ในหน่วยความจำ — ใช้ใน test และตอนรันแบบ stateless (`render --stdin`) */
export function memoryVaultFs(files: Record<string, string | Uint8Array> = {}): VaultFs {
  const entries = new Map<string, Uint8Array>()
  const encoder = new TextEncoder()
  for (const [path, value] of Object.entries(files)) {
    entries.set(path, typeof value === "string" ? encoder.encode(value) : value)
  }

  const directories = new Set<string>([""])
  for (const path of entries.keys()) {
    const segments = path.split("/")
    for (let index = 1; index < segments.length; index += 1) {
      directories.add(segments.slice(0, index).join("/"))
    }
  }

  return {
    async readText(rel) {
      const bytes = entries.get(rel)
      return bytes ? new TextDecoder().decode(bytes) : null
    },
    async readBytes(rel) {
      return entries.get(rel) ?? null
    },
    async list(rel) {
      const prefix = rel ? `${rel}/` : ""
      const files: VaultEntry[] = []
      const dirs = new Set<string>()
      for (const path of entries.keys()) {
        if (!path.startsWith(prefix)) continue
        const rest = path.slice(prefix.length)
        if (!rest) continue
        const slash = rest.indexOf("/")
        const name = slash === -1 ? rest : rest.slice(0, slash)
        if (name.startsWith(".")) continue
        if (slash === -1) files.push({ name, type: "file" })
        else dirs.add(name)
      }
      return [
        ...[...dirs].sort().map((name): VaultEntry => ({ name, type: "dir" })),
        ...files.sort((a, b) => a.name.localeCompare(b.name)),
      ]
    },
  }
}
