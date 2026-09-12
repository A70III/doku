/**
 * SseHub — broadcast event ให้ client ที่เปิด `/sse` ไว้ (live-reload, docs/01)
 * ทางเดียวพอ (SSE) ตาม docs/04 · client ตอบด้วยการ reload หน้า
 */

export type SseEvent = "change"

export class SseHub {
  #subscribers = new Set<(event: SseEvent) => void>()
  #timer: ReturnType<typeof setTimeout> | null = null

  subscribe(handler: (event: SseEvent) => void): () => void {
    this.#subscribers.add(handler)
    return () => {
      this.#subscribers.delete(handler)
    }
  }

  get count(): number {
    return this.#subscribers.size
  }

  /**
   * ตั้งเวลา broadcast แบบ debounce (watcher ยิงถี่) — เรียกซ้ำได้ จะยิงจริงรอบเดียว
   */
  scheduleBroadcast(event: SseEvent = "change", delayMs = 250): void {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      this.#timer = null
      this.broadcast(event)
    }, delayMs)
  }

  broadcast(event: SseEvent): void {
    for (const handler of this.#subscribers) {
      try {
        handler(event)
      } catch {
        // client ตัวเดียว error ไม่ทำให้ตัวอื่นล้ม
      }
    }
  }
}
