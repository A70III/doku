/**
 * `@doku/core` — resolve · render · blocks · validate · vault
 *
 * Isomorphic: ไม่ import HTTP และไม่ผูก `node:fs` ตรงๆ
 * ผู้ใช้ (CLI / server / mcp / test) ส่ง `VaultFs` adapter เข้ามาเอง
 */

export {
  type AssetResolver,
  createAssetResolver,
  type ResolvedAsset,
} from "./assets.ts"
export { type DokuDirectiveOptions, remarkDokuDirectives } from "./blocks/directive.ts"
export {
  BLOCKS,
  type BlockDefinition,
  blockNames,
  type DirectiveKind,
  findBlock,
} from "./blocks/registry.ts"
export {
  type CheckOptions,
  type CheckReport,
  checkVault,
  type DocCheck,
} from "./check.ts"
export { type FrontmatterSplit, splitFrontmatter } from "./frontmatter.ts"
export {
  isDotEntry,
  memoryVaultFs,
  type VaultEntry,
  type VaultFs,
  type VaultStat,
} from "./fs.ts"
export { sha256Hex, shortHash } from "./hash.ts"
export { loadMeta, type MetaLoadResult, type MetaSource } from "./meta.ts"
export {
  assetUrl,
  basenameOf,
  dirnameOf,
  docIdFromMdPath,
  docUrl,
  encodeVaultUrl,
  isSafeVaultPath,
  mdPathFromDocId,
  metaPathFromDocId,
  normalizeVaultPath,
  PathError,
  resolveRelativePath,
} from "./paths.ts"
export { rehypeCollectToc, type TocEntry } from "./plugins/toc.ts"
export { remarkWikilinks, type WikiLinkOptions } from "./plugins/wikilink.ts"
export {
  type RenderOptions,
  type RenderResult,
  type RenderVault,
  renderMarkdown,
} from "./render.ts"
export {
  DocNotFoundError,
  MAX_MD_BYTES,
  type ResolvedDoc,
  type ResolveOptions,
  resolveDoc,
  resolveInline,
} from "./resolve.ts"
export { type RewriteOptions, rehypeRewrite } from "./rewrite.ts"
export { dokuSanitizeSchema } from "./sanitize.ts"
export {
  type DocScan,
  type LinkKind,
  type ScannedBlock,
  type ScannedLink,
  scanMarkdown,
} from "./scan.ts"
export {
  AccentSchema,
  AgentSchema,
  AuthorSchema,
  defaultMeta,
  type FolderMeta,
  FolderMetaSchema,
  HEX_COLOR_PATTERN,
  META_KNOWN_KEYS,
  type Meta,
  MetaSchema,
  RelationsSchema,
  RenderSchema,
  TAG_PATTERN,
  ThemeSchema,
} from "./schema.ts"
export {
  countByLevel,
  type Warning,
  type WarningCode,
  type WarningLevel,
  warning,
} from "./types.ts"
export {
  buildDocIndex,
  isDocPath,
  isMetaSidecar,
  resolveWikiTarget,
  TRASH_DIR,
  type VaultListing,
  walkVault,
} from "./vault-walk.ts"
export { RENDERER_VERSION } from "./version.ts"
