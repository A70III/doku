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
export {
  createDokuHandlers,
  type DokuDirectiveOptions,
  remarkDokuDirectives,
} from "./blocks/directive.ts"
export {
  BLOCKS,
  type BlockDefinition,
  blockNames,
  CALLOUT_TYPES,
  type DirectiveKind,
  findBlock,
} from "./blocks/registry.ts"
export {
  BLOCK_COLORS,
  type BlockContext,
  blockElement,
  type DokuDirectiveNode,
  h,
} from "./blocks/types.ts"
export {
  type CheckOptions,
  type CheckReport,
  checkVault,
  type DocCheck,
} from "./check.ts"
export { INTERACTIONS_JS } from "./client.ts"
export { docEtag, etagHeader, matchesIfMatch } from "./etag.ts"
export { type FrontmatterSplit, splitFrontmatter } from "./frontmatter.ts"
export {
  isDotEntry,
  isWritableVaultFs,
  memoryVaultFs,
  type VaultEntry,
  type VaultFs,
  type VaultStat,
  type VaultWriter,
  type WritableVaultFs,
} from "./fs.ts"
export { sha256Hex, shortHash } from "./hash.ts"
export {
  hasIcon,
  ICON_MASK_CSS,
  ICON_NAMES,
  type IconOptions,
  iconMaskDataUri,
  iconSvg,
  LUCIDE_ICONS,
  LUCIDE_VERSION,
  type LucideIconName,
} from "./icons/index.ts"
export {
  isEmptyPlan,
  type MovePlan,
  planMove,
  relativeVaultLink,
  rewriteMarkdownLinks,
} from "./links.ts"
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
export { type MarkOptions, remarkMark } from "./plugins/mark.ts"
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
export {
  isRevisionTs,
  memoryRevisionStore,
  parseRevisionTs,
  REVISION_KEEP,
  type RevisionEntry,
  type RevisionSnapshot,
  type RevisionStore,
  revisionTs,
} from "./revision.ts"
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
  FOLDER_META_KEYS,
  type FolderMeta,
  FolderMetaSchema,
  HEX_COLOR_PATTERN,
  META_KNOWN_KEYS,
  type Meta,
  type MetaPatch,
  MetaPatchSchema,
  MetaSchema,
  RelationsSchema,
  RenderSchema,
  TAG_PATTERN,
  ThemeSchema,
} from "./schema.ts"
export { BLOCKS_CSS, CONTENT_CSS, PROSE_CSS, TOKENS_CSS } from "./styles/index.ts"
export {
  isTrashId,
  memoryTrashStoreOver,
  parseTrashManifest,
  TRASH_DIR,
  TRASH_MANIFEST,
  TRASH_RETENTION_DAYS,
  type TrashItem,
  type TrashKind,
  type TrashStore,
  trashId,
  trashManifestPath,
} from "./trash.ts"
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
  type VaultListing,
  walkVault,
} from "./vault-walk.ts"
export { RENDERER_VERSION } from "./version.ts"
