/**
 * Vault watcher (docs/01 indexer)
 * - chokidar ตาม docs/04 · event → invalidate VaultState + schedule SSE broadcast
 * - ignore: dotfile/dotfolder ทุกตัว รวม `vault/.trash/**` (hard invariant ข้อ 9)
 * - debounce ฝั่ง VaultState invalidate เองเพื่อไม่ rescan ถี่เกิน (200ms)
 */

import chokidar, { type FSWatcher } from "chokidar"

export interface VaultWatcher {
  close(): Promise<void>
}

/** มี dot segment ใน path (สัมพัทธ์จาก root) = ตัดทิ้ง — root เอง (relative ว่าง) ต้องไม่นับ */
function hasDotSegment(relative: string): boolean {
  return relative.split("/").some((segment) => segment.startsWith("."))
}

export function createVaultWatcher(
  root: string,
  hooks: { onChange: (relativePath: string) => void },
): VaultWatcher {
  let lastChangeAt = 0

  const watcher: FSWatcher = chokidar.watch(root, {
    ignoreInitial: true,
    ignorePermissionErrors: true,
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
    // ตัด dotfile/dotfolder ทั้งระบบ (รวม .trash, .git ใน vault)
    ignored: (path: string) => {
      const relative = path
        .slice(root.length)
        .replace(/^[/\\]/, "")
        .replaceAll("\\", "/")
      return hasDotSegment(relative)
    },
  })

  const fire = (path: string): void => {
    const relative = path
      .slice(root.length)
      .replace(/^[/\\]/, "")
      .replaceAll("\\", "/")
    if (hasDotSegment(relative)) return
    // debounce: watcher มักยิงหลาย event ต่อการ save หนึ่งครั้ง
    const now = Date.now()
    if (now - lastChangeAt < 200) return
    lastChangeAt = now
    hooks.onChange(relative)
  }

  watcher.on("add", fire)
  watcher.on("change", fire)
  watcher.on("unlink", fire)
  watcher.on("addDir", fire)
  watcher.on("unlinkDir", fire)

  return {
    async close() {
      await watcher.close()
    },
  }
}
