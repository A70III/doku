/**
 * CSS ของหน้า preview (`doku render` → ไฟล์ HTML เดียว)
 *
 * ส่วน tokens + prose + blocks ย้ายไป `@doku/core` แล้ว (docs/08 ข้อ 28)
 * ไฟล์นี้เก็บเฉพาะ **chrome ของหน้า preview** (การ์ด/หน้า/ฟุตเตอร์/print)
 * ที่เว็บแอปไม่ใช้ (เว็บใช้ Tailwind สำหรับ chrome)
 */

export const PREVIEW_CHROME_CSS = `
body {
  margin: 0;
  background: var(--k-app-bg);
  color: var(--k-text);
  font-family: var(--d-font-sans);
  font-size: var(--d-text-base);
  line-height: var(--k-leading-body);
  -webkit-font-smoothing: antialiased;
}

.doku-page { padding: var(--d-space-8) var(--d-space-4); }

.doku-card {
  max-width: var(--k-measure);
  margin: 0 auto;
  background: var(--k-bg);
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-lg);
  box-shadow: var(--k-shadow-md);
  padding: clamp(1.25rem, 4vw, 3rem);
}

.doku-footer {
  max-width: var(--k-measure);
  margin: var(--d-space-6) auto 0;
  color: var(--d-text-subtle);
  font-size: 0.75rem;
  text-align: center;
  font-family: var(--d-font-mono);
}
`
