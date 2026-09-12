/**
 * Asset resolution — vault path → URL พร้อม cache-bust hash (docs/01 data flow ขั้น 5)
 * `?h=<hash>` = sha256 ของ bytes (ตัด 12 ตัว)
 */

import type { VaultFs } from "./fs.ts"
import { shortHash } from "./hash.ts"
import { assetUrl } from "./paths.ts"

export interface ResolvedAsset {
  url: string
  exists: boolean
}

export interface AssetResolver {
  resolve(vaultPath: string): Promise<ResolvedAsset>
}

export function createAssetResolver(
  fs: VaultFs,
  cache: Map<string, ResolvedAsset> = new Map(),
): AssetResolver {
  return {
    async resolve(vaultPath: string): Promise<ResolvedAsset> {
      const cached = cache.get(vaultPath)
      if (cached) return cached

      const bytes = await fs.readBytes(vaultPath)
      const resolved: ResolvedAsset = bytes
        ? { url: assetUrl(vaultPath, await shortHash(bytes)), exists: true }
        : { url: assetUrl(vaultPath, "missing"), exists: false }
      cache.set(vaultPath, resolved)
      return resolved
    },
  }
}
