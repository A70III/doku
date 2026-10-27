import type { FC } from "hono/jsx"
import type { TreeNode } from "../../tree.ts"
import { Layout } from "./layout.tsx"
import { Sidebar } from "./sidebar.tsx"

export interface StyleGuideSection {
  name: string
  kind: string
  syntax: string
  html: string
}

export interface StyleGuideThemeReport {
  mode: "light" | "dark"
  swatches: Array<{ token: string; name: string; color: string; ink: string }>
  pairs: Array<{ label: string; fg: string; bg: string; ratio: number; need: number }>
}

/** palette + คู่สีที่ lock ไว้ — ตัวเลขคำนวณจาก token จริง (docs/08 ข้อ 47) */
const PaletteReport: FC<{ reports: StyleGuideThemeReport[] }> = ({ reports }) => (
  <section id="palette" class="mb-12 scroll-mt-6">
    <div class="mb-4 border-b border-(--d-border) pb-2">
      <h2 class="text-sm font-medium text-(--k-text)">Palette + คู่สีที่ lock ไว้</h2>
      <p class="mt-1 text-xs text-(--d-text-subtle)">
        คำนวณจาก <code>tokens.ts</code> ด้วยสูตรเดียวกับ <code>contrast.test.ts</code> — ไม่ใช่ค่าที่คัดลอกมา
      </p>
    </div>

    <div class="mb-8 grid gap-8 lg:grid-cols-2">
      {reports.map((report) => (
        <div key={report.mode} data-theme={report.mode} class="doku-theme-sample">
          <p class="mb-2 text-xs font-medium text-(--d-text-muted)">
            {report.mode === "light" ? "โหมดสว่าง" : "โหมดมืด"}
          </p>
          <ul class="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
            {report.swatches.map((swatch) => (
              <li key={swatch.token} class="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  class="inline-block size-4 rounded-(--d-radius-sm)"
                  style={{ background: swatch.color } as never}
                />
                <span class="font-(family-name:--d-font-mono) text-(--d-text-muted)">
                  {swatch.token.replace("--k-", "")}
                </span>
                <span class="px-1" style={{ background: swatch.color, color: swatch.ink } as never}>
                  Aa
                </span>
              </li>
            ))}
          </ul>
          <table class="w-full text-xs">
            <thead>
              <tr class="text-(--d-text-subtle)">
                <th class="border-b border-(--d-border) pb-1 text-left font-normal">คู่สี</th>
                <th class="border-b border-(--d-border) pb-1 text-right font-normal">ratio</th>
                <th class="border-b border-(--d-border) pb-1 text-right font-normal">เกณฑ์</th>
              </tr>
            </thead>
            <tbody>
              {report.pairs.map((pair) => (
                <tr key={`${report.mode}-${pair.label}`}>
                  <td class="border-b border-(--d-border) py-1 pr-3 text-(--d-text-muted)">
                    {pair.label}
                  </td>
                  <td class="border-b border-(--d-border) py-1 text-right tabular-nums">
                    {pair.ratio.toFixed(2)}
                  </td>
                  <td class="border-b border-(--d-border) py-1 pl-3 text-right tabular-nums">
                    {pair.ratio >= pair.need ? (
                      <span class="text-(--k-success-ink)">ผ่าน {pair.need}</span>
                    ) : (
                      <span class="text-(--k-danger-ink)">ไม่ผ่าน {pair.need}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  </section>
)

export const StyleGuidePage: FC<{
  tree: TreeNode[]
  blocks: StyleGuideSection[]
  palette?: StyleGuideThemeReport[]
  trashCount?: number
}> = ({ tree, blocks, palette, trashCount }) => (
  <Layout title="styleguide — doku">
    <div class="doku-shell">
      <Sidebar tree={tree} activeId="__styleguide__" trashCount={trashCount} />
      <main class="doku-main">
        <header class="mb-6 border-b border-(--d-border) pb-5">
          <h1 class="text-2xl font-semibold tracking-tight text-(--k-text)">Styleguide</h1>
          <p class="mt-1 text-sm text-(--d-text-muted)">
            {blocks.length} blocks — ทุก directive พร้อม syntax และตัวอย่างจริง (docs/03 §9)
          </p>
          <nav aria-label="รายการ block" class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {blocks.map((block) => (
              <a
                key={block.name}
                href={`#block-${block.name}`}
                class="font-(family-name:--d-font-mono) text-(--d-text-muted) no-underline transition-colors hover:text-(--d-accent)"
              >
                {block.name}
              </a>
            ))}
          </nav>
        </header>

        <div class="max-w-[var(--k-measure)]">
          {palette ? <PaletteReport reports={palette} /> : null}
          {blocks.map((block) => (
            <section key={block.name} id={`block-${block.name}`} class="mb-10 scroll-mt-6">
              <div class="mb-3 flex items-baseline justify-between gap-3 border-b border-(--d-border) pb-2">
                <h2 class="font-(family-name:--d-font-mono) text-sm font-medium text-(--k-text)">
                  <a href={`#block-${block.name}`} class="no-underline text-(--k-text)">
                    {block.name}
                  </a>
                </h2>
                <span class="text-xs text-(--d-text-subtle)">{block.kind}</span>
              </div>
              <pre class="mb-4 overflow-auto rounded-(--d-radius-sm) border border-(--d-border) bg-(--d-bg-subtle) p-3 text-xs text-(--d-text-muted)">
                {block.syntax}
              </pre>
              <div class="doku-prose" dangerouslySetInnerHTML={{ __html: block.html }} />
            </section>
          ))}
        </div>
      </main>
    </div>
  </Layout>
)
