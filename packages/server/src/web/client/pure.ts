/**
 * pure helpers ของ browser client — แยกจาก `main.ts` (seam S1, docs/08 ข้อ 78)
 *
 * ทุกตัวที่นี่ **closure-free**: ไม่แตะ state ร่วมหรือ DOM ref ของ `main.ts`
 * → import ตรงได้ในเทสต์ (เดิมต้องงัดโค้ดออกจาก template literal ด้วย brace matcher + `new Function`)
 *
 * ย้ายมาแบบกลไก ไม่แก้ logic — พฤติกรรมเดิมทุกบรรทัด
 */

/** codepoint ของ backtick — ใช้สร้าง regex fence โดยไม่ต้องเขียน backtick ตรง ๆ */
const TICK = String.fromCharCode(96)

/** fence marker ของ CommonMark: `char` + `len` ต้องตรงกันตอนปิด */
export interface FenceMarker {
  char: string
  len: number
  rest: string
}

/** หัวข้อ h2/h3 ที่เจอใน markdown พร้อม offset จากต้นเอกสาร */
export interface MarkdownHeading {
  depth: number
  text: string
  pos: number
}

/** ควร reload ตาม SSE ไหม — pure function ให้เทสต์ได้ตรง ๆ (docs/09 §8) */
export function shouldReloadOnChange(dirty: boolean, suppressUntil: number, now: number): boolean {
  if (dirty) return false
  return !(suppressUntil > 0 && now < suppressUntil)
}

/* ── path ─────────────────────────────────────────────────────────────── */

/** encode ทีละ segment — path ใน vault มีอักขระไทย/ช่องว่างได้ แต่ `/` ต้องไม่ถูก encode */
export function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

export function basename(path: string): string {
  const index = path.lastIndexOf("/")
  return index === -1 ? path : path.slice(index + 1)
}

export function dirname(path: string): string {
  const index = path.lastIndexOf("/")
  return index === -1 ? "" : path.slice(0, index)
}

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

/* ── heading pipeline (TOC ↔ markdown) ────────────────────────────────── */

/** เทียบข้อความหัวข้อแบบหลวม ๆ — ตัด marker ที่ render ออกแล้ว
 *  หมายเหตุ: normalize ถูกใช้ทั้งกับข้อความจาก markdown และ text ของ TOC (server)
 *  การตัดอักขระจึงสมมาตร · ยกเว้นลิงก์/รูปที่เป็นโครงสร้างของ markdown เท่านั้น */
export function normalizeHeading(text: string | null | undefined): string {
  const linked = String(text).replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
  let out = ""
  for (const ch of linked) {
    if ("*_~[](){}=".indexOf(ch) !== -1 || ch === TICK) continue
    out += ch
  }
  return out.replace(/ +/g, " ").trim().toLowerCase()
}

/** fence marker ของ CommonMark: {char,len,rest} หรือ null — ปิดต้องเทียบ char+len
 *  (fence backtick 4 ตัวครอบ fence 3 ตัว ไม่ควร toggle กลางบล็อก) */
export function fenceMarker(line: string): FenceMarker | null {
  const match = new RegExp(`^ {0,3}([${TICK}]{3,}|~{3,})(.*)$`).exec(line)
  if (!match) return null
  const marker = match[1] ?? ""
  const rest = match[2] ?? ""
  // info string ของ backtick fence ห้ามมี backtick (CommonMark)
  if (marker.charAt(0) === TICK && rest.indexOf(TICK) !== -1) return null
  return { char: marker.charAt(0), len: marker.length, rest }
}

/** ความยาว frontmatter ของ markdown ดิบ — offset ของ heading ต้องนับจากเอกสาร
 *  ที่ editor เห็น (มี frontmatter) · ใช้สูตร md.length − body.length เท่านั้น
 *  (body ตัด newline หลัง block ออกหนึ่งตัว เหมือน core/frontmatter.ts) */
export function frontmatterLength(md: string): number {
  const match = /^(?:\ufeff)?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(md)
  if (!match) return 0
  return md.length - md.slice(match[0].length).replace(/^\r?\n/, "").length
}

/** หัวข้อระดับ h2/h3 ตามลำดับในเอกสาร + offset (ข้าม code fence · รู้จัก setext)
 *  renderer (mdast) นับ setext (Title ตามด้วยขีด) เป็น h2 ด้วย — ถ้าไม่นับ จำนวน heading
 *  จะไม่ตรงกับ TOC แล้วการจับคู่ด้วย index จะ drift ทั้งชุด */
export function headingsInMarkdown(md: string): MarkdownHeading[] {
  const found: MarkdownHeading[] = []
  const start = frontmatterLength(md)
  let fence: FenceMarker | null = null
  let offset = 0
  let prevText: string | null = null
  let prevOffset = 0
  let prevIsParagraph = false
  for (const line of md.slice(start).split("\n")) {
    const marker = fenceMarker(line)
    if (fence) {
      if (
        marker &&
        marker.char === fence.char &&
        marker.len >= fence.len &&
        marker.rest.trim() === ""
      ) {
        fence = null
      }
      prevIsParagraph = false
    } else if (marker) {
      fence = marker
      prevIsParagraph = false
    } else {
      const atx = /^(#{1,6}) +(.*)$/.exec(line)
      if (atx) {
        const depth = (atx[1] ?? "").length
        if (depth === 2 || depth === 3) {
          found.push({ depth, text: normalizeHeading(atx[2]), pos: start + offset })
        }
        prevIsParagraph = false
      } else {
        // setext underline: ขีด = h2 · เท่ากับ = h1 · ต้องตามหลังย่อหน้าจริง (ไม่ใช่บรรทัดว่าง)
        const setext = /^ {0,3}(-+|=+)[ \t]*$/.exec(line)
        if (setext && prevIsParagraph) {
          const depth = (setext[1] ?? "").charAt(0) === "=" ? 1 : 2
          if (depth === 2) {
            found.push({ depth, text: normalizeHeading(prevText), pos: start + prevOffset })
          }
          prevIsParagraph = false
        } else {
          prevIsParagraph = line.trim() !== ""
        }
      }
    }
    prevText = line
    prevOffset = offset
    offset += line.length + 1
  }
  return found
}

/* ── geometry ─────────────────────────────────────────────────────────── */

/** พิกัดของ event อยู่ในกรอบ element ไหม — วัดด้วย rect ไม่ใช่ contains อย่างเดียว
 *  (กันเคส element ถูกแทนที่ระหว่างคลิก → target หลุดจาก DOM) */
export function inRect(
  el: HTMLElement | null,
  event: { clientX: number; clientY: number },
  pad?: number,
): boolean {
  if (!el || el.hidden) return false
  const r = el.getBoundingClientRect()
  const p = pad || 0
  return (
    event.clientX >= r.left - p &&
    event.clientX <= r.right + p &&
    event.clientY >= r.top - p &&
    event.clientY <= r.bottom + p
  )
}
