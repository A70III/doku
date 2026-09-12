/**
 * เวอร์ชันของ render pipeline — ส่วนหนึ่งของ cache key (docs/01)
 * เพิ่มเมื่อ pipeline เปลี่ยนผลลัพธ์ HTML (ไม่ใช่เวอร์ชันโปรเจกต์)
 * cache เก่าที่ key ต่างกันจะถูกละเลยเอง (pure function ของ input)
 *
 * 2 = M2 (custom block renderer คืน hast แทน fallback code block)
 * 3 = UI pass (leading h1 → title, ไม่ซ้ำกับ header)
 */
export const RENDERER_VERSION = "3"
