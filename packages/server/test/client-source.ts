import { readFileSync } from "node:fs"

/**
 * ซอร์สของ browser client รวมทุกโมดูล — ใช้กับการทดสอบเชิงสัญญา (source-level contract)
 *
 * `web/client.ts` ถูกแยกเป็น `web/client/*.ts` + bundle (docs/08 ข้อ 78) →
 * เทสต์ที่ตรวจว่า "โค้ด client ทำอะไร" ต้องอ่าน **ทั้งชุด** ไม่ใช่ไฟล์เดียว
 * (ไม่งั้น refactor ที่ย้ายโค้ดจะทำให้เทสต์พังทั้งที่สัญญายังจริง)
 *
 * เทสต์ที่ทดสอบ *พฤติกรรม* ควร import โมดูลจริงตรง ๆ (เช่น `web/client/pure.ts`)
 * ไฟล์นี้เหลือไว้เฉพาะสัญญาระดับซอร์สที่ยัง import ไม่ได้
 */

function read(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8")
}

/** entry + โมดูลที่แยกออกมาแล้วทั้งหมด (เรียงตามที่ย้าย) */
export const CLIENT_SOURCE = [read("../src/web/client/main.ts")].join("\n")
