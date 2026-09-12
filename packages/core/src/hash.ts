/** hash แบบ Web Crypto — ใช้ได้ทั้ง Bun/Node/browser (core ไม่ผูก runtime) */

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

export async function shortHash(input: string | Uint8Array, length = 12): Promise<string> {
  return (await sha256Hex(input)).slice(0, length)
}
