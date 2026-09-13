/**
 * ชนิดข้อมูลที่ใช้ร่วมทั้งโปรเจกต์ (warning, ผลลัพธ์) — isomorphism-friendly
 * ไม่มี dep กับ fs/HTTP ที่นี่
 */

/** รหัส warning/error ที่ระบบปล่อยได้ — ใช้ทั้ง render, check และ (ทีหลัง) REST */
export type WarningCode =
  // path / doc
  | "doc_not_found"
  | "path_invalid"
  | "md_too_large"
  // meta
  | "meta_invalid"
  | "meta_unknown_field"
  // blocks (M2 จะลดจำนวนลงเมื่อ registry มีของจริง)
  | "block_unimplemented"
  | "block_unknown"
  | "block_unclosed"
  | "block_stray_fence"
  | "block_nesting_ambiguous"
  | "block_attribute_unknown"
  | "icon_unknown"
  // math
  | "math_disabled"
  // assets / links
  | "asset_missing"
  | "asset_path_unsafe"
  | "asset_name_invalid"
  | "asset_unresolved"
  | "link_broken"
  | "link_unsafe"
  | "wikilink_missing"
  | "wikilink_ambiguous"
  // code
  | "code_language_unsupported"
  // vault level (doku check)
  | "orphan_asset"
  | "missing_title"

export type WarningLevel = "error" | "warning" | "info"

export interface Warning {
  code: WarningCode
  /** ข้อความไทยที่คนอ่านรู้เรื่อง */
  message: string
  level: WarningLevel
  /** path id ของเอกสารที่เกี่ยวข้อง (ถ้ามี) */
  path?: string
  /** field หรือ directive ที่ทำให้เกิด warning */
  field?: string
}

export function warning(
  code: WarningCode,
  message: string,
  level: WarningLevel = "warning",
  extra: { path?: string; field?: string } = {},
): Warning {
  return { code, message, level, ...extra }
}

/** สรุป warning ตามระดับ — ใช้ตัดสิน exit code */
export function countByLevel(warnings: readonly Warning[]): Record<WarningLevel, number> {
  const counts: Record<WarningLevel, number> = { error: 0, warning: 0, info: 0 }
  for (const w of warnings) counts[w.level] += 1
  return counts
}
