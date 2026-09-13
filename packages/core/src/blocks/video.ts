/**
 * `:::video{src}` — native `<video>` / `<audio>` หรือ YouTube embed (docs/03 · docs/08 ข้อ 65)
 *
 * - `src` เป็น path ของ asset ใน vault (relative จากโฟลเดอร์เอกสาร หรือ `/assets/…`)
 *   หรือ URL ของ YouTube (`youtube.com/watch?v=…` · `youtu.be/…` · `youtube.com/shorts/…`)
 * - ไม่มี player library · ไม่รับ iframe/embed อื่นนอกจาก YouTube (allowlist ปิด)
 * - `poster` ไม่ใช่ attribute แล้ว — มาจากไฟล์ข้าง `src` (basename เดียวกัน + นามสกุลรูป)
 *   ผ่าน `rehypeRewrite` เพราะ block renderer ไม่รู้จัก filesystem (core เป็น isomorphic)
 * - `loop` / `muted` / `controls` ถอดออกทั้งหมด · controls เปิดเสมอ (ตั้งใน renderer)
 */

import { type BlockDefinition, blockElement, h } from "./types.ts"

const AUDIO = /\.(mp3|m4a|wav|ogg|opus|flac)$/i
/** src ที่มี scheme = ลิงก์ภายนอก (ต้องเป็น provider ที่รองรับเท่านั้น) */
const EXTERNAL = /^[a-z][a-z0-9+.-]*:\/\//i
const YOUTUBE_HOST = /^(?:www\.|m\.|music\.)?youtube(?:-nocookie)?\.com$/i
const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/

/** ดึง video id จาก URL ของ YouTube — คืน null ถ้าไม่ใช่/รูปแบบไม่ถูก */
export function youtubeId(raw: string): string | null {
  const value = String(raw || "").trim()
  if (!value) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  const id = (candidate: string | undefined | null): string | null =>
    candidate && YOUTUBE_ID.test(candidate) ? candidate : null

  if (host === "youtu.be") return id(url.pathname.split("/")[1])
  if (!YOUTUBE_HOST.test(host)) return null
  if (url.pathname === "/watch" || url.pathname === "/watch/") return id(url.searchParams.get("v"))
  const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/)
  return id(match ? match[1] : null)
}

export const videoDefinition: BlockDefinition = {
  name: "video",
  kind: "container",
  implemented: true,
  attributes: ["src"],
  values: {},
  example: ":::video{src=/assets/demo.mp4}\n:::\n\n:::video{src=https://youtu.be/dQw4w9WgXcQ}\n:::",
  render(ctx) {
    const src = (ctx.attrs.src ?? "").trim()
    if (!src) {
      ctx.warn("block_attribute_unknown", "video ต้องมี src")
      return blockElement("figure", "figure", { dataMissing: "true" }, [])
    }

    const youtube = youtubeId(src)
    if (youtube) {
      return blockElement("figure", "video", { dataProvider: "youtube", dataId: youtube }, [
        h("iframe", {
          className: ["doku-embed"],
          src: `https://www.youtube-nocookie.com/embed/${youtube}?rel=0`,
          title: "วิดีโอจาก YouTube",
          loading: "lazy",
          allow: "accelerometer; clipboard-write; encrypted-media; picture-in-picture",
          allowFullScreen: true,
          referrerPolicy: "strict-origin-when-cross-origin",
          frameBorder: "0",
        }),
      ])
    }

    // ลิงก์ภายนอกที่ไม่ใช่ YouTube: ยังไม่รองรับ (CSP `media-src 'self'` — docs/08 ข้อ 65)
    if (EXTERNAL.test(src)) {
      ctx.warn(
        "block_attribute_unknown",
        `video: ยังไม่รองรับ src ภายนอกที่ไม่ใช่ YouTube (${src}) — แสดง placeholder`,
      )
      return blockElement("figure", "figure", { dataMissing: "true" }, [])
    }

    const isAudio = AUDIO.test(src)
    return blockElement(
      isAudio ? "audio" : "video",
      "video",
      { src, controls: true, preload: "metadata" },
      [],
    )
  },
}
