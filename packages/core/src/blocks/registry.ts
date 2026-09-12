/**
 * Block registry — จุดเดียวที่นิยาม custom block ทั้งหมด (docs/03 syntax reference)
 *
 * เพิ่ม block ใหม่ = เพิ่ม 1 ไฟล์ + register ที่นี่ ไม่ต้องแตะ core
 * `implemented: true` = มี renderer จริง → ไม่ปล่อย warning `block_unimplemented`
 * ลำดับใน array = ลำดับที่แสดงใน `/styleguide` (และ M4 `/api/schema`)
 */

import { badgeDefinition } from "./badge.ts"
import { calloutDefinition } from "./callout.ts"
import { cardDefinition } from "./card.ts"
import { detailsDefinition } from "./details.ts"
import { figureDefinition } from "./figure.ts"
import { galleryDefinition } from "./gallery.ts"
import { colDefinition, gridDefinition } from "./grid.ts"
import { kvDefinition } from "./kv.ts"
import { marginNoteDefinition } from "./margin-note.ts"
import { markDefinition } from "./mark.ts"
import { motionDefinition } from "./motion.ts"
import { progressDefinition } from "./progress.ts"
import { sectionDefinition } from "./section.ts"
import { statDefinition, statsDefinition } from "./stats.ts"
import { stepsDefinition } from "./steps.ts"
import { tabDefinition, tabsDefinition } from "./tabs.ts"
import { timelineDefinition } from "./timeline.ts"
import type { BlockDefinition, DirectiveKind } from "./types.ts"
import { videoDefinition } from "./video.ts"

/** callout ทั้ง 7 type (docs/08 ข้อ 14) — ใช้ renderer เดียวกัน */
export const CALLOUT_TYPES = [
  "note",
  "info",
  "tip",
  "success",
  "warning",
  "danger",
  "quote",
] as const

export const BLOCKS: readonly BlockDefinition[] = [
  ...CALLOUT_TYPES.map((name) => calloutDefinition(name)),
  markDefinition,
  badgeDefinition,
  statDefinition,
  figureDefinition,
  galleryDefinition,
  videoDefinition,
  cardDefinition,
  sectionDefinition,
  gridDefinition,
  colDefinition,
  kvDefinition,
  statsDefinition,
  progressDefinition,
  stepsDefinition,
  timelineDefinition,
  marginNoteDefinition,
  motionDefinition,
  detailsDefinition,
  tabsDefinition,
  tabDefinition,
]

const BLOCK_INDEX = new Map(BLOCKS.map((block) => [block.name, block]))

export function findBlock(name: string): BlockDefinition | undefined {
  return BLOCK_INDEX.get(name)
}

/** ชื่อ block ที่รู้จักทั้งหมด — ให้ agent ตรวจก่อนเขียน (ใช้ที่ /api/schema) */
export function blockNames(): string[] {
  return BLOCKS.map((block) => block.name)
}

export type { BlockDefinition, DirectiveKind }
