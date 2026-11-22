/**
 * The site-navigation bar (spec/carrier-app.md §4.5b; FC-18 §8.2 `siteNav`,
 * 2.10.0): a file that is one page of a set of pages shows the set's title
 * (a link to its home page) and links to the page before and after it, in a
 * slim bar above the read view — outside the document text, drawn at run
 * time (the assembled bytes hold only the setting in `#orz-shell`).
 *
 * - A `<nav>` landmark named by the set's title, first in the page's order
 *   (the keyboard reaches it before the chrome and the document); plain
 *   links (they work without the editor); its look in a shadow root, so the
 *   page's CSS does not reach it and its CSS does not reach the page.
 * - One fixed height (`SITE_NAV_HEIGHT`), published on the root element as
 *   `--orz-site-nav-height` while the bar shows, so a read view drawn fixed
 *   over the viewport (slides) can start below it.
 * - The page's colour scheme (light / dark, the read view's `present`).
 * - Narrow screens (≤ 600 px): the neighbours read "Previous" / "Next" (their
 *   accessible names keep the labels); the title is cut with an ellipsis.
 * - The title and each label take their own direction (`dir="auto"`), so a
 *   right-to-left one cut by the ellipsis shows its start.
 * - Edge to edge at the top of the page whatever the page's CSS: drawn
 *   `position: absolute` at the top of the document, the room for it made by
 *   the root element's top padding on screen (`PAGE_CSS`, a constructed
 *   sheet adopted by the document: no inline style, nothing in print). A
 *   kind whose view is fixed over the viewport sets that padding back to 0
 *   and starts its view at `--orz-site-nav-height` instead (slides).
 * - Never printed (`@media print`).
 */
import type { SiteNav } from '../read.js';
import type { AppDocument, AppElement } from './types.js';
/** The bar's height in CSS px (fixed, so a fixed read view can make room for it before it renders). */
export declare const SITE_NAV_HEIGHT = 40;
/** The root element's custom property holding the bar's height while it shows. */
export declare const SITE_NAV_HEIGHT_PROPERTY = "--orz-site-nav-height";
export declare const SITE_NAV_CSS = "\n:host { display: block; box-sizing: border-box; height: 40px; position: absolute; top: 0; left: 0; right: 0; margin: 0; z-index: 3;\n  font: 14px/1.4 system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif;\n  --nav-bg: rgba(255,255,255,.96); --nav-fg: #1f2328; --nav-muted: #59606b; --nav-line: rgba(0,0,0,.12); --nav-hover: rgba(0,0,0,.06); --nav-focus: #2f6fde;\n  background: var(--nav-bg); color: var(--nav-fg); border-bottom: 1px solid var(--nav-line); }\n:host([data-scheme=\"dark\"]) { --nav-bg: rgba(24,26,30,.96); --nav-fg: #e8eaee; --nav-muted: #a9afba; --nav-line: rgba(255,255,255,.14); --nav-hover: rgba(255,255,255,.08); --nav-focus: #8ab4ff; }\n:host([hidden]) { display: none !important; }\n@media print { :host { display: none !important; } }\n.bar { box-sizing: border-box; height: 100%; display: flex; align-items: center; gap: 8px; padding: 0 max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left)); max-width: 72rem; margin: 0 auto; }\na { color: inherit; text-decoration: none; border-radius: 6px; display: inline-flex; align-items: center; min-height: 32px; padding: 0 8px; box-sizing: border-box; min-width: 0; }\na:hover { background: var(--nav-hover); text-decoration: underline; text-underline-offset: 2px; }\na:focus-visible { outline: 2px solid var(--nav-focus); outline-offset: 1px; }\n.home { font-weight: 600; flex: 1 1 auto; min-width: 0; }\n.home span, .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.steps { display: flex; gap: 4px; flex: 0 1 auto; min-width: 0; max-width: 60%; }\n.step { color: var(--nav-muted); max-width: 18rem; }\n.step:hover { color: var(--nav-fg); }\n.arrow { flex: none; }\n.prev .arrow { margin-right: 6px; }\n.next .arrow { margin-left: 6px; }\n.short { display: none; white-space: nowrap; }\n@media (max-width: 600px) {\n  .label { display: none; }\n  .short { display: inline; }\n  .steps { max-width: none; flex: none; }\n}\n";
/** The page's side (screen only): the root element's top padding is the bar's room while it shows. */
export declare const SITE_NAV_PAGE_CSS = "@media screen { html { padding-top: var(--orz-site-nav-height, 0px); } }";
/** The bar on the page. */
export interface SiteNavBar {
    readonly element: AppElement;
    /** Show or hide it (edit mode hides it with the read view). */
    setVisible(visible: boolean): void;
    /** Follow the page's colour scheme. */
    setScheme(scheme: 'light' | 'dark'): void;
    /** Remove it and its height property. */
    destroy(): void;
}
/**
 * Draw a file's site navigation: a `<nav>` inserted before `before` (or first
 * in `<body>`), labelled by the title. Texts are set as text, never markup;
 * hrefs are the file's own (already checked by `readSiteNav`).
 */
export declare function mountSiteNav(doc: AppDocument, nav: SiteNav, o?: {
    before?: AppElement | null;
}): SiteNavBar;
//# sourceMappingURL=site-nav.d.ts.map