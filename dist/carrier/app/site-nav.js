"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SITE_NAV_PAGE_CSS = exports.SITE_NAV_CSS = exports.SITE_NAV_HEIGHT_PROPERTY = exports.SITE_NAV_HEIGHT = void 0;
exports.mountSiteNav = mountSiteNav;
const widgets_js_1 = require("./widgets.js");
/** The bar's height in CSS px (fixed, so a fixed read view can make room for it before it renders). */
exports.SITE_NAV_HEIGHT = 40;
/** The root element's custom property holding the bar's height while it shows. */
exports.SITE_NAV_HEIGHT_PROPERTY = '--orz-site-nav-height';
exports.SITE_NAV_CSS = `
:host { display: block; box-sizing: border-box; height: ${exports.SITE_NAV_HEIGHT}px; position: absolute; top: 0; left: 0; right: 0; margin: 0; z-index: 3;
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
/** The page's side (screen only): the root element's top padding is the bar's room while it shows. */
exports.SITE_NAV_PAGE_CSS = `@media screen { html { padding-top: var(${exports.SITE_NAV_HEIGHT_PROPERTY}, 0px); } }`;
/** Adopt {@link SITE_NAV_PAGE_CSS} into the document once (constructed sheet; a `<style>` where that is missing). */
function installPageCss(doc) {
    const d = doc;
    if (d.__orzSiteNavCss)
        return;
    d.__orzSiteNavCss = true;
    const Sheet = doc.defaultView?.CSSStyleSheet;
    try {
        if (Sheet && Array.isArray(d.adoptedStyleSheets)) {
            const sheet = new Sheet();
            sheet.replaceSync(exports.SITE_NAV_PAGE_CSS);
            d.adoptedStyleSheets = [...d.adoptedStyleSheets, sheet];
            return;
        }
    }
    catch { /* fall back */ }
    const style = doc.createElement('style');
    style.textContent = exports.SITE_NAV_PAGE_CSS;
    doc.head.append(style);
}
/**
 * Draw a file's site navigation: a `<nav>` inserted before `before` (or first
 * in `<body>`), labelled by the title. Texts are set as text, never markup;
 * hrefs are the file's own (already checked by `readSiteNav`).
 */
function mountSiteNav(doc, nav, o = {}) {
    const host = doc.createElement('nav');
    host.className = 'orz-site-nav';
    host.setAttribute('data-orz-chrome', 'site-nav');
    host.setAttribute('aria-label', nav.title);
    const root = (host.attachShadow?.({ mode: 'open' }) ?? host);
    (0, widgets_js_1.installCss)(root, exports.SITE_NAV_CSS);
    // `auto`: a text (the title, a label) takes its own direction, so a right-to-left one cut by the ellipsis shows its start
    const span = (cls, text, o = {}) => {
        const s = doc.createElement('span');
        s.className = cls;
        s.textContent = text;
        if (o.auto)
            s.setAttribute('dir', 'auto');
        if (o.hidden)
            s.setAttribute('aria-hidden', 'true');
        return s;
    };
    const bar = doc.createElement('div');
    bar.className = 'bar';
    const home = doc.createElement('a');
    home.className = 'home';
    home.setAttribute('href', nav.home);
    home.title = nav.title;
    home.append(span('', nav.title, { auto: true }));
    bar.append(home);
    const steps = doc.createElement('span');
    steps.className = 'steps';
    for (const [which, link] of [['prev', nav.previous], ['next', nav.next]]) {
        if (!link)
            continue;
        const a = doc.createElement('a');
        a.className = `step ${which}`;
        a.setAttribute('href', link.href);
        a.setAttribute('rel', which);
        const word = which === 'prev' ? 'Previous' : 'Next';
        a.setAttribute('aria-label', `${word}: ${link.label}`);
        a.title = link.label;
        const hidden = { hidden: true };
        if (which === 'prev')
            a.append(span('arrow', '←', hidden), span('label', link.label, { hidden: true, auto: true }), span('short', word, hidden));
        else
            a.append(span('label', link.label, { hidden: true, auto: true }), span('short', word, hidden), span('arrow', '→', hidden));
        steps.append(a);
    }
    if (steps.firstElementChild)
        bar.append(steps);
    root.append(bar);
    const before = o.before ?? null;
    if (before?.before)
        before.before(host);
    else
        doc.body.prepend(host);
    installPageCss(doc);
    const rootStyle = doc.documentElement.style;
    const setVisible = (visible) => {
        host.hidden = !visible;
        if (visible)
            rootStyle.setProperty(exports.SITE_NAV_HEIGHT_PROPERTY, `${exports.SITE_NAV_HEIGHT}px`);
        else
            rootStyle.removeProperty?.(exports.SITE_NAV_HEIGHT_PROPERTY);
    };
    setVisible(true);
    return {
        element: host,
        setVisible,
        setScheme(scheme) { host.setAttribute('data-scheme', scheme === 'dark' ? 'dark' : 'light'); },
        destroy() { setVisible(false); host.remove(); },
    };
}
//# sourceMappingURL=site-nav.js.map