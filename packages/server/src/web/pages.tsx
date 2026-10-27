/**
 * Hono JSX pages — entry ที่แอป import (แยกโค้ดอยู่ที่ `./pages/`)
 *
 * คงชื่อ export เดิมทุกตัว (`app.tsx` / `pages/folder.tsx` / `styleguide.ts` import ที่นี่)
 */

export { DocPage, TocList } from "./pages/doc.tsx"
export { HomePage } from "./pages/home.tsx"
export { Layout } from "./pages/layout.tsx"
export { NotFoundPage } from "./pages/notfound.tsx"
export { Icon } from "./pages/shared.tsx"
export { Sidebar } from "./pages/sidebar.tsx"
export {
  StyleGuidePage,
  type StyleGuideSection,
  type StyleGuideThemeReport,
} from "./pages/styleguide.tsx"
export { TrashPage } from "./pages/trash.tsx"
