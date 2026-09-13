/**
 * เวอร์ชันของ render pipeline — ส่วนหนึ่งของ cache key (docs/01)
 * เพิ่มเมื่อ pipeline เปลี่ยนผลลัพธ์ HTML (ไม่ใช่เวอร์ชันโปรเจกต์)
 * cache เก่าที่ key ต่างกันจะถูกละเลยเอง (pure function ของ input)
 *
 * 2 = M2 (custom block renderer คืน hast แทน fallback code block)
 * 3 = UI pass (leading h1 → title, ไม่ซ้ำกับ header)
 * 4 = M3 (callout ส่ง data-icon → ไอคอน block ผ่าน CSS mask; ไม่ใช้ glyph ใน ::before)
 * 5 = M3.1 (TOC ออกจากบทความ → คอลัมน์ sticky · colophon ท้ายเอกสาร · rhythm/reading scale ใหม่)
 * 6 = M3.1 (header/ชื่อเรื่องออกจาก fragment — ตอนเขียนในที่ชื่อเรื่องต้องไม่หาย)
 * 7 = M3.2 (CachedDoc มี `dedupe` → `data-title-in-body` ตรงกับการตัด h1 ของ renderer)
 */
export const RENDERER_VERSION = "7"
