/**
 * เวอร์ชันของ render pipeline — ส่วนหนึ่งของ cache key (docs/01)
 * เพิ่มเมื่อ pipeline เปลี่ยนผลลัพธ์ HTML (ไม่ใช่เวอร์ชันโปรเจกต์)
 * cache เก่าที่ key ต่างกันจะถูกละเลยเอง (pure function ของ input)
 */
export const RENDERER_VERSION = "1"
