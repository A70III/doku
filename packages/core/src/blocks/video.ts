/**
 * `:::video{src poster loop muted}` — native `<video>` / `<audio>` (docs/03)
 * ไม่มี player library และไม่รับ iframe/embed ภายนอก (allowlist ปิด)
 */

import { type BlockDefinition, blockElement, flag } from "./types.ts"

const AUDIO = /\.(mp3|m4a|wav|ogg|opus|flac)$/i

export const videoDefinition: BlockDefinition = {
  name: "video",
  kind: "container",
  implemented: true,
  attributes: ["src", "poster", "loop", "muted", "controls"],
  values: {},
  example: ':::video{src="/assets/demo.mp4" poster="/assets/cover.png" loop muted}\n:::',
  render(ctx) {
    const src = ctx.attrs.src
    if (!src) {
      ctx.warn("block_attribute_unknown", "video ต้องมี src")
      return blockElement("figure", "figure", { dataMissing: "true" }, [])
    }

    const isAudio = AUDIO.test(src)
    const properties: Record<string, unknown> = { src, controls: true, preload: "metadata" }
    if (flag(ctx.attrs, "loop")) properties.loop = true
    if (flag(ctx.attrs, "muted")) properties.muted = true
    if (!isAudio && ctx.attrs.poster) properties.poster = ctx.attrs.poster

    return blockElement(isAudio ? "audio" : "video", "video", properties, [])
  },
}
