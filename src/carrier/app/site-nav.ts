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
 * - Never printed (`@media print`).
 */
import type { SiteNav } from '../read.js';
import { installCss } from './widgets.js';
import type { AppDocument, AppElement } from './types.js';

/** The bar's height in CSS px (fixed, so a fixed read view can make room for it before it renders). */
export const SITE_NAV_HEIGHT = 40;

/** The root element's custom property holding the bar's height while it shows. */
export const SITE_NAV_HEIGHT_PROPERTY = '--orz-site-nav-height';

export const SITE_NAV_CSS = `
:host { display: block; box-sizing: border-box; height: ${SITE_NAV_HEIGHT}px; position: relative; z-index: 3;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --nav-bg: rgba(255,255,255,.96); --nav-fg: #1f2328; --nav-muted: #59606b; --nav-line: rgba(0,0,0,.12); --nav-hover: rgba(0,0,0,.06); --nav-focus: #2f6fde;
  background: var(--nav-bg); color: var(--nav-fg); border-bottom: 1px solid var(--nav-line); }
:host([data-scheme="dark"]) { --nav-bg: rgba(24,26,30,.96); --nav-fg: #e8eaee; --nav-muted: #a9afba; --nav-line: rgba(255,255,255,.14); --nav-hover: rgba(255,255,255,.08); --nav-focus: #8ab4ff; }
:host([hidden]) { display: none !important; }
@media print { :host { display: none !important; } }
.bar { box-sizing: border-box; height: 100%; display: flex; align-items: center; gap: 8px; padding: 0 max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left)); max-width: 72rem; margin: 0 auto; }
a { color: inherit; text-decoration: none; border-radius: 6px; display: inline-flex; align-items: center; min-height: 32px; padding: 0 8px; box-sizing: border-box; min-width: 0; }
a:hover { background: var(--nav-hover); text-decoration: underline; text-underline-offset: 2px; }
a:focus-visible { outline: 2px solid var(--nav-focus); outline-offset: 1px; }
.home { font-weight: 600; flex: 1 1 auto; min-width: 0; }
.home span, .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.steps { display: flex; gap: 4px; flex: 0 1 auto; min-width: 0; max-width: 60%; }
.step { color: var(--nav-muted); max-width: 18rem; }
.step:hover { color: var(--nav-fg); }
.arrow { flex: none; }
.prev .arrow { margin-right: 6px; }
.next .arrow { margin-left: 6px; }
.short { display: none; white-space: nowrap; }
@media (max-width: 600px) {
  .label { display: none; }
  .short { display: inline; }
  .steps { max-width: none; flex: none; }
}
`;

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
export function mountSiteNav(doc: AppDocument, nav: SiteNav, o: { before?: AppElement | null } = {}): SiteNavBar {
  const host = doc.createElement('nav');
  host.className = 'orz-site-nav';
  host.setAttribute('data-orz-chrome', 'site-nav');
  host.setAttribute('aria-label', nav.title);
  const root = (host.attachShadow?.({ mode: 'open' }) ?? host) as unknown as AppElement & { ownerDocument: AppDocument; adoptedStyleSheets?: unknown[] };
  installCss(root as never, SITE_NAV_CSS);
  const span = (cls: string, text: string, hidden = false): AppElement => {
    const s = doc.createElement('span');
    s.className = cls;
    s.textContent = text;
    if (hidden) s.setAttribute('aria-hidden', 'true');
    return s;
  };
  const bar = doc.createElement('div');
  bar.className = 'bar';
  const home = doc.createElement('a');
  home.className = 'home';
  home.setAttribute('href', nav.home);
  home.title = nav.title;
  home.append(span('', nav.title));
  bar.append(home);
  const steps = doc.createElement('span');
  steps.className = 'steps';
  for (const [which, link] of [['prev', nav.previous], ['next', nav.next]] as const) {
    if (!link) continue;
    const a = doc.createElement('a');
    a.className = `step ${which}`;
    a.setAttribute('href', link.href);
    a.setAttribute('rel', which);
    const word = which === 'prev' ? 'Previous' : 'Next';
    a.setAttribute('aria-label', `${word}: ${link.label}`);
    a.title = link.label;
    if (which === 'prev') a.append(span('arrow', '←', true), span('label', link.label, true), span('short', word, true));
    else a.append(span('label', link.label, true), span('short', word, true), span('arrow', '→', true));
    steps.append(a);
  }
  if (steps.firstElementChild) bar.append(steps);
  root.append(bar);
  const before = o.before ?? null;
  if (before?.before) before.before(host);
  else doc.body.prepend(host);
  const rootStyle = doc.documentElement.style as AppElement['style'] & { removeProperty?(name: string): void };
  const setVisible = (visible: boolean): void => {
    host.hidden = !visible;
    if (visible) rootStyle.setProperty(SITE_NAV_HEIGHT_PROPERTY, `${SITE_NAV_HEIGHT}px`);
    else rootStyle.removeProperty?.(SITE_NAV_HEIGHT_PROPERTY);
  };
  setVisible(true);
  return {
    element: host,
    setVisible,
    setScheme(scheme) { host.setAttribute('data-scheme', scheme === 'dark' ? 'dark' : 'light'); },
    destroy() { setVisible(false); host.remove(); },
  };
}
