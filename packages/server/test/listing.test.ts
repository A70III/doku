/**
 * M3.5 S1 — listing helpers (plan 3.5.3 date grouping · 3.5.4 sort)
 * ครอบคลุม: dateGroupKey boundary · parseSort whitelist · sortDocs ×3 · groupDocsByDate order + group ว่าง
 */

import { describe, expect, test } from "bun:test"
import {
  DATE_GROUP_LABELS,
  dateGroupKey,
  groupDocsByDate,
  parseSort,
  sortDocs,
} from "../src/web/listing.ts"

const DAY_MS = 24 * 60 * 60 * 1000
/** "now" คงที่ = เที่ยงวัน 24 ก.ย. 2026 (เวลาท้องถิ่น) — boundary นิ่ง ไม่พึ่งเวลาจริง */
const NOW = new Date(2026, 8, 24, 12, 0, 0).getTime()

interface Item {
  title: string
  mtimeMs: number
  bytes: number
}

describe("parseSort", () => {
  test("whitelist เท่านั้น — นอกตาราง/ไม่ส่ง = mtime", () => {
    expect(parseSort(undefined)).toBe("mtime")
    expect(parseSort(null)).toBe("mtime")
    expect(parseSort("")).toBe("mtime")
    expect(parseSort("SIZE")).toBe("mtime") // case-sensitive whitelist
    expect(parseSort("bogus")).toBe("mtime")
    expect(parseSort("mtime")).toBe("mtime")
    expect(parseSort("name")).toBe("name")
    expect(parseSort("size")).toBe("size")
  })
})

describe("dateGroupKey", () => {
  test("boundary: today · yesterday · 6d/7d = week · 8d/30d = month · 31d = older", () => {
    expect(dateGroupKey(NOW, NOW)).toBe("today")
    expect(dateGroupKey(NOW - 1 * DAY_MS, NOW)).toBe("yesterday")
    expect(dateGroupKey(NOW - 6 * DAY_MS, NOW)).toBe("week")
    expect(dateGroupKey(NOW - 7 * DAY_MS, NOW)).toBe("week")
    expect(dateGroupKey(NOW - 8 * DAY_MS, NOW)).toBe("month")
    expect(dateGroupKey(NOW - 30 * DAY_MS, NOW)).toBe("month")
    expect(dateGroupKey(NOW - 31 * DAY_MS, NOW)).toBe("older")
  })

  test("today = ปฏิทินวันเดียวกัน (เวลาท้องถิ่น) ไม่ใช่หน้าต่าง 24 ชม.", () => {
    // ก่อนเที่ยงคืนของวันเดียวกัน = today
    expect(dateGroupKey(new Date(2026, 8, 24, 0, 15).getTime(), NOW)).toBe("today")
    // 23:59 ของเมื่อวาน (ย้อนแค่ ~12 ชม.) = yesterday — หน้าต่าง 24 ชม. จะเข้าใจผิดเป็น today
    expect(dateGroupKey(new Date(2026, 8, 23, 23, 59).getTime(), NOW)).toBe("yesterday")
  })

  test("nowMs ไม่ส่งมา = Date.now() (เอกสารที่เพิ่งแก้ = today)", () => {
    expect(dateGroupKey(Date.now())).toBe("today")
  })
})

describe("sortDocs", () => {
  const docs: Item[] = [
    { title: "gamma", mtimeMs: NOW - 2 * DAY_MS, bytes: 500 },
    { title: "alpha", mtimeMs: NOW - 5 * DAY_MS, bytes: 10 },
    { title: "beta", mtimeMs: NOW - 1 * DAY_MS, bytes: 100 },
  ]

  test("mtime = ใหม่ก่อน (desc)", () => {
    expect(sortDocs(docs, "mtime").map((doc) => doc.title)).toEqual(["beta", "gamma", "alpha"])
  })

  test("name = localeCompare('th')", () => {
    expect(sortDocs(docs, "name").map((doc) => doc.title)).toEqual(["alpha", "beta", "gamma"])
    // ลำดับพยัญชนะไทย: ก < ข
    const thai: Item[] = [
      { title: "ข้าว", mtimeMs: NOW, bytes: 1 },
      { title: "กาแฟ", mtimeMs: NOW, bytes: 1 },
    ]
    expect(sortDocs(thai, "name").map((doc) => doc.title)).toEqual(["กาแฟ", "ข้าว"])
  })

  test("size = มากก่อน (bytes desc)", () => {
    expect(sortDocs(docs, "size").map((doc) => doc.title)).toEqual(["gamma", "beta", "alpha"])
  })

  test("คืน array ใหม่ — ไม่ mutate input", () => {
    const input = [...docs]
    const sorted = sortDocs(input, "size")
    expect(sorted).not.toBe(input)
    expect(input.map((doc) => doc.title)).toEqual(["gamma", "alpha", "beta"])
  })
})

describe("groupDocsByDate", () => {
  test("DATE_GROUP_LABELS = ภาษาไทยครบ 5 group", () => {
    expect(DATE_GROUP_LABELS).toEqual({
      today: "วันนี้",
      yesterday: "เมื่อวานนี้",
      week: "สัปดาห์ที่ผ่านมา",
      month: "เดือนที่ผ่านมา",
      older: "เก่ากว่า",
    })
  })

  test("เรียง today → older แม้ input สับสน · label ตรง key · ในกลุ่มคงลำดับ input", () => {
    const docs = [
      { id: "older", mtimeMs: NOW - 40 * DAY_MS },
      { id: "yesterday", mtimeMs: NOW - 1 * DAY_MS },
      { id: "today-b", mtimeMs: NOW - 60_000 },
      { id: "today-a", mtimeMs: NOW - 5 * 60_000 },
      { id: "month", mtimeMs: NOW - 10 * DAY_MS },
      { id: "week", mtimeMs: NOW - 3 * DAY_MS },
    ]
    const groups = groupDocsByDate(docs, NOW)
    expect(groups.map((group) => group.key)).toEqual([
      "today",
      "yesterday",
      "week",
      "month",
      "older",
    ])
    expect(groups.map((group) => group.label)).toEqual([
      DATE_GROUP_LABELS.today,
      DATE_GROUP_LABELS.yesterday,
      DATE_GROUP_LABELS.week,
      DATE_GROUP_LABELS.month,
      DATE_GROUP_LABELS.older,
    ])
    expect(groups.map((group) => group.docs.map((doc) => doc.id))).toEqual([
      ["today-b", "today-a"],
      ["yesterday"],
      ["week"],
      ["month"],
      ["older"],
    ])
  })

  test("group ว่างถูกตัดออก · input ว่าง = []", () => {
    const docs = [
      { id: "old", mtimeMs: NOW - 40 * DAY_MS }, // older
      { id: "new", mtimeMs: NOW }, // today
      { id: "mid", mtimeMs: NOW - 4 * DAY_MS }, // week — ไม่มี yesterday/month
    ]
    expect(groupDocsByDate(docs, NOW).map((group) => group.key)).toEqual(["today", "week", "older"])
    expect(groupDocsByDate([], NOW)).toEqual([])
  })
})
