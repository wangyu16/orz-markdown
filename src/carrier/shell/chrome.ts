/**
 * The shell chrome (spec/shell-runtime.md §8): design tokens, icons, toasts
 * and the shadow-root helper every carrier's shell UI shares. Decoration for
 * the shell only — it never styles the document, and the document's theme
 * never styles it: everything renders in a shadow root whose host resets
 * inherited properties (`all: initial`).
 *
 * Vocabulary: the family's chrome (orz-mdhtml's `--c-*` light/dark tokens,
 * the dark editor bar, orz-poster's floating launcher and toast), modernised:
 * OKLCH palette, system UI fonts, one spacing and type scale, visible focus
 * rings, motion that respects `prefers-reduced-motion`.
 *
 * No DOM at module load: these are constants and functions of an element the
 * caller passes in. The chrome only writes into its own shadow root; it never
 * reads the page.
 */
import type { ShadowRootLike, TextLike, UiDocument, UiElement, UiView } from './types.js';

/** Light tokens (the default). */
const LIGHT = `
  --orz-chrome-bg: oklch(98.6% 0.003 255);
  --orz-chrome-surface: oklch(100% 0 0);
  --orz-chrome-surface-2: oklch(96.4% 0.005 255);
  --orz-chrome-hover: oklch(93.8% 0.008 255);
  --orz-chrome-border: oklch(88.5% 0.008 255);
  --orz-chrome-fg: oklch(25% 0.015 260);
  --orz-chrome-muted: oklch(50% 0.016 260);
  --orz-chrome-accent: oklch(54% 0.17 258);
  --orz-chrome-accent-hover: oklch(49% 0.17 258);
  --orz-chrome-accent-fg: oklch(99% 0.002 258);
  --orz-chrome-focus: oklch(60% 0.19 258);
  --orz-chrome-success: oklch(54% 0.13 155);
  --orz-chrome-warning: oklch(64% 0.15 70);
  --orz-chrome-danger: oklch(56% 0.19 25);
  --orz-chrome-info: oklch(54% 0.17 258);
  --orz-chrome-shadow: 0 1px 2px oklch(22% 0.02 260 / 0.08), 0 8px 28px oklch(22% 0.02 260 / 0.14);
  --orz-chrome-syntax-heading: oklch(45% 0.16 258);
  --orz-chrome-syntax-mark: oklch(50% 0.016 260);
  --orz-chrome-syntax-link: oklch(48% 0.15 245);
  --orz-chrome-syntax-url: oklch(47% 0.1 210);
  --orz-chrome-syntax-code: oklch(48% 0.14 25);
  --orz-chrome-syntax-quote: oklch(46% 0.09 150);
  --orz-chrome-syntax-comment: oklch(50% 0.016 260);
  --orz-chrome-syntax-label: oklch(47% 0.14 300);
  color-scheme: light;`;

/** Dark tokens (the family's dark editor bar, lifted to OKLCH). */
const DARK = `
  --orz-chrome-bg: oklch(21% 0.008 260);
  --orz-chrome-surface: oklch(25% 0.009 260);
  --orz-chrome-surface-2: oklch(28.5% 0.01 260);
  --orz-chrome-hover: oklch(33% 0.012 260);
  --orz-chrome-border: oklch(36% 0.012 260);
  --orz-chrome-fg: oklch(93% 0.006 260);
  --orz-chrome-muted: oklch(72% 0.012 260);
  --orz-chrome-accent: oklch(70% 0.14 258);
  --orz-chrome-accent-hover: oklch(76% 0.12 258);
  --orz-chrome-accent-fg: oklch(20% 0.03 258);
  --orz-chrome-focus: oklch(76% 0.14 258);
  --orz-chrome-success: oklch(74% 0.14 155);
  --orz-chrome-warning: oklch(80% 0.14 80);
  --orz-chrome-danger: oklch(71% 0.16 25);
  --orz-chrome-info: oklch(70% 0.14 258);
  --orz-chrome-shadow: 0 1px 2px oklch(0% 0 0 / 0.4), 0 10px 32px oklch(0% 0 0 / 0.45);
  --orz-chrome-syntax-heading: oklch(80% 0.11 258);
  --orz-chrome-syntax-mark: oklch(72% 0.012 260);
  --orz-chrome-syntax-link: oklch(78% 0.11 240);
  --orz-chrome-syntax-url: oklch(78% 0.09 210);
  --orz-chrome-syntax-code: oklch(80% 0.1 45);
  --orz-chrome-syntax-quote: oklch(80% 0.09 150);
  --orz-chrome-syntax-comment: oklch(72% 0.012 260);
  --orz-chrome-syntax-label: oklch(80% 0.1 300);
  color-scheme: dark;`;

/**
 * The shell chrome's stylesheet, installed in every chrome shadow root by
 * {@link createShadowRoot}. Tokens are custom properties on `:host`
 * (`--orz-chrome-*`); dark applies with `prefers-color-scheme: dark`, and an
 * explicit `data-chrome="light"` / `"dark"` on the host (or, where
 * `:host-context` is supported, on an ancestor such as `<html>`) overrides
 * the system.
 */
export const CHROME_CSS = `
:host {
  all: initial;
  display: inline-block;
  ${LIGHT}
  --orz-chrome-font: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", "PingFang SC", "Hiragino Sans", "Microsoft YaHei", sans-serif;
  --orz-chrome-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --orz-chrome-text-xs: 11px;
  --orz-chrome-text-sm: 12px;
  --orz-chrome-text-md: 13px;
  --orz-chrome-text-lg: 15px;
  --orz-chrome-space-1: 2px;
  --orz-chrome-space-2: 4px;
  --orz-chrome-space-3: 8px;
  --orz-chrome-space-4: 12px;
  --orz-chrome-space-5: 16px;
  --orz-chrome-space-6: 24px;
  --orz-chrome-radius-s: 6px;
  --orz-chrome-radius-m: 10px;
  --orz-chrome-radius-l: 14px;
  --orz-chrome-radius-pill: 999px;
  --orz-chrome-control: 30px;
  --orz-chrome-ease: cubic-bezier(.2, .7, .2, 1);
  --orz-chrome-fast: 120ms;
  --orz-chrome-slow: 200ms;
  --orz-chrome-z: 2147483000;
  font: 400 var(--orz-chrome-text-md)/1.45 var(--orz-chrome-font);
  color: var(--orz-chrome-fg);
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) { :host { ${DARK} } }
:host-context([data-chrome="light"]) { ${LIGHT} }
:host-context([data-chrome="dark"]) { ${DARK} }
:host([data-chrome="light"]) { ${LIGHT} }
:host([data-chrome="dark"]) { ${DARK} }
:host([hidden]) { display: none; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--orz-chrome-focus); outline-offset: 2px; }
.orz-icon { display: inline-flex; flex: none; width: 16px; height: 16px; }
.orz-icon svg { width: 100%; height: 100%; display: block; }
.orz-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

.orz-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--orz-chrome-space-2);
  min-height: var(--orz-chrome-control); padding: 0 var(--orz-chrome-space-4);
  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-s);
  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg);
  font: 500 var(--orz-chrome-text-md)/1 var(--orz-chrome-font); cursor: pointer; white-space: nowrap;
  transition: background var(--orz-chrome-fast) var(--orz-chrome-ease), border-color var(--orz-chrome-fast) var(--orz-chrome-ease), color var(--orz-chrome-fast) var(--orz-chrome-ease);
}
.orz-btn:hover { background: var(--orz-chrome-hover); }
.orz-btn:disabled { opacity: .55; cursor: default; }
.orz-btn--primary { background: var(--orz-chrome-accent); border-color: transparent; color: var(--orz-chrome-accent-fg); }
.orz-btn--primary:hover { background: var(--orz-chrome-accent-hover); }
.orz-btn--ghost { background: transparent; border-color: transparent; color: var(--orz-chrome-muted); }
.orz-btn--ghost:hover { background: var(--orz-chrome-hover); color: var(--orz-chrome-fg); }
.orz-btn--icon { width: var(--orz-chrome-control); padding: 0; }

.orz-chip {
  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: var(--orz-chrome-space-2);
  height: 22px; min-width: 22px; padding: 0 var(--orz-chrome-space-2);
  border: 0; border-radius: var(--orz-chrome-radius-pill);
  background: transparent; color: var(--orz-chrome-accent); cursor: pointer;
  font: 600 var(--orz-chrome-text-xs)/1 var(--orz-chrome-font);
  transition: background var(--orz-chrome-fast) var(--orz-chrome-ease);
}
.orz-chip:hover, .orz-chip[aria-expanded="true"] { background: color-mix(in oklch, var(--orz-chrome-accent) 14%, transparent); }
.orz-chip .orz-icon { width: 14px; height: 14px; }
.orz-dot {
  position: absolute; top: 2px; right: 2px; width: 7px; height: 7px; border-radius: 50%;
  background: var(--orz-chrome-accent); box-shadow: 0 0 0 2px var(--orz-chrome-bg);
  animation: orz-chrome-in var(--orz-chrome-slow) var(--orz-chrome-ease) both;
}

.orz-popover {
  position: fixed; z-index: var(--orz-chrome-z); width: max-content; max-width: min(320px, calc(100vw - 16px));
  padding: var(--orz-chrome-space-4) var(--orz-chrome-space-5) var(--orz-chrome-space-4);
  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-m);
  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);
  animation: orz-chrome-pop var(--orz-chrome-slow) var(--orz-chrome-ease) both;
}
.orz-popover__title { margin: 0 0 var(--orz-chrome-space-1); font: 600 var(--orz-chrome-text-lg)/1.3 var(--orz-chrome-font); }
.orz-popover__meta { margin: 0 0 var(--orz-chrome-space-3); color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-sm); }
.orz-popover__link { color: var(--orz-chrome-accent); font-size: var(--orz-chrome-text-sm); text-decoration: none; border-radius: 3px; }
.orz-popover__link:hover { text-decoration: underline; }
.orz-popover__error { margin: var(--orz-chrome-space-3) 0 0; color: var(--orz-chrome-danger); font-size: var(--orz-chrome-text-sm); }
.orz-popover__actions { display: flex; flex-wrap: wrap; gap: var(--orz-chrome-space-2); margin-top: var(--orz-chrome-space-4); }

.orz-toast-stack {
  position: fixed; z-index: var(--orz-chrome-z); left: 50%; bottom: var(--orz-chrome-space-5); transform: translateX(-50%);
  display: flex; flex-direction: column-reverse; align-items: center; gap: var(--orz-chrome-space-3);
  width: max-content; max-width: min(560px, calc(100vw - 24px)); pointer-events: none;
}
.orz-toast {
  display: flex; align-items: flex-start; gap: var(--orz-chrome-space-3); pointer-events: auto;
  padding: var(--orz-chrome-space-3) var(--orz-chrome-space-3) var(--orz-chrome-space-3) var(--orz-chrome-space-4);
  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-m);
  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);
  animation: orz-chrome-rise var(--orz-chrome-slow) var(--orz-chrome-ease) both;
}
.orz-toast > .orz-icon { margin-top: 1px; color: var(--orz-chrome-info); }
.orz-toast[data-tone="success"] > .orz-icon { color: var(--orz-chrome-success); }
.orz-toast[data-tone="warning"] > .orz-icon { color: var(--orz-chrome-warning); }
.orz-toast[data-tone="error"] > .orz-icon { color: var(--orz-chrome-danger); }
.orz-toast__message { flex: 1; min-width: 0; padding-top: 1px; overflow-wrap: anywhere; }
.orz-toast__actions { display: flex; flex-wrap: wrap; gap: var(--orz-chrome-space-2); margin-top: var(--orz-chrome-space-3); }
.orz-toast__action { min-height: 26px; padding: 0 var(--orz-chrome-space-3); font-size: var(--orz-chrome-text-sm); }
.orz-toast__close { width: 22px; height: 22px; min-height: 22px; padding: 0; margin: -2px -2px 0 0; }
.orz-toast__close .orz-icon { width: 14px; height: 14px; }

@keyframes orz-chrome-in { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: none; } }
@keyframes orz-chrome-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
@keyframes orz-chrome-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
@media print { :host { display: none !important; } }
`;

const svg = (body: string): string =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

/** The shell's inline icons (24×24, stroke `currentColor`, `aria-hidden`); name a control with `aria-label`, not the icon. */
export const ICONS = {
  save: svg('<path d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3"/><path d="M7 21v-7h10v7"/>'),
  download: svg('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  update: svg('<path d="M21 12a9 9 0 0 1-15.4 6.4L3 16"/><path d="M3 21v-5h5"/><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8"/><path d="M21 3v5h-5"/>'),
  edit: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/>'),
  preview: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  split: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>'),
  theme: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>'),
  close: svg('<path d="M6 6l12 12"/><path d="M18 6 6 18"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>'),
  check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
  warning: svg('<path d="M10.3 4.1 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4"/><path d="M12 17h.01"/>'),
  more: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  // 2.2.0 (the carrier app's chrome): the measure setting, New document, Save as new copy
  measure: svg('<path d="M4 5v14"/><path d="M20 5v14"/><path d="M8 12h8"/><path d="m10.5 9.5-2.5 2.5 2.5 2.5"/><path d="m13.5 9.5 2.5 2.5-2.5 2.5"/>'),
  new: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M12 12v6"/><path d="M9 15h6"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  // 2.2.0 (round 1 of the carrier-app loop): the actions and settings of slides and paged — Present, Print, page size
  present: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="m10 8 4 2-4 2z" fill="currentColor"/><path d="M12 16v4"/><path d="M8 20h8"/>'),
  print: svg('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'),
  pageSize: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 12h6"/><path d="M9 16h6"/>'),
} as const;

export type IconName = keyof typeof ICONS;

/** The chrome's one markup write: an icon constant into its own span (never page or document content). */
type IconSpan = UiElement & { innerHTML: string };

/** An icon element (`span.orz-icon` holding one of {@link ICONS}). */
export function iconElement(doc: UiDocument, name: IconName): UiElement {
  const span = doc.createElement('span') as IconSpan;
  span.className = 'orz-icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = ICONS[name];
  return span;
}

/**
 * A kind's own icon (2.2.0): the `d` of up to {@link KIND_ICON_MAX_PATHS}
 * stroked paths on the ICONS grid (24×24, `currentColor`), nothing else — no
 * markup, so no script, link, style or colour can come with it. Each `d` is
 * path data only (commands, numbers, separators; at most 1,000 characters).
 */
export interface KindIcon {
  readonly paths: readonly string[];
}
export const KIND_ICON_MAX_PATHS = 8;
const PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9.,+\-eE \t\n]{1,1000}$/;

/** True when a value is a well-formed {@link KindIcon}. */
export function isKindIcon(icon: unknown): icon is KindIcon {
  const p = (icon as { paths?: unknown } | null)?.paths;
  return Array.isArray(p) && p.length > 0 && p.length <= KIND_ICON_MAX_PATHS && p.every((d) => typeof d === 'string' && PATH_DATA.test(d));
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * An icon element for a kit icon name or a kind's {@link KindIcon}: the kit's
 * constant, or the kind's paths built element by element (`createElementNS`,
 * attributes set as data — never markup). Null for an unknown name, a
 * malformed kind icon or a document without SVG elements: the control keeps
 * its label.
 */
export function anyIconElement(doc: UiDocument, icon: IconName | KindIcon | undefined): UiElement | null {
  if (typeof icon === 'string') return Object.prototype.hasOwnProperty.call(ICONS, icon) ? iconElement(doc, icon) : null;
  if (!isKindIcon(icon) || typeof doc.createElementNS !== 'function') return null;
  try {
    const span = doc.createElement('span');
    span.className = 'orz-icon';
    span.setAttribute('aria-hidden', 'true');
    const s = doc.createElementNS(SVG_NS, 'svg');
    for (const [k, v] of [['viewBox', '0 0 24 24'], ['width', '16'], ['height', '16'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '2'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true'], ['focusable', 'false']]) s.setAttribute(k, v);
    for (const d of icon.paths) {
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      s.append(path);
    }
    span.append(s);
    return span;
  } catch {
    return null;
  }
}

/** An element with a text child (the text is set as data, never parsed as HTML). */
export function textElement(doc: UiDocument, tag: string, className: string, text: string): { el: UiElement; text: TextLike } {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  const node = doc.createTextNode(text);
  el.append(node);
  return { el, text: node };
}

/** The document an element belongs to (or the global one). */
export function documentOf(el: UiElement | undefined): UiDocument | undefined {
  try {
    return el?.ownerDocument ?? ((globalThis as { document?: UiDocument }).document);
  } catch {
    return undefined;
  }
}

/** The view (window) of a document. */
export function viewOf(doc: UiDocument | undefined): UiView | undefined {
  try {
    return doc?.defaultView ?? (globalThis as { window?: UiView }).window ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Attach a shadow root to `host` and install {@link CHROME_CSS} in it — as a
 * constructed stylesheet where supported (no inline `<style>`, so a strict
 * `style-src` keeps working), else a `<style>` element. `mode` defaults to
 * `open`, so tests and assistive tooling can reach the chrome.
 */
export function createShadowRoot(host: UiElement, options: { mode?: 'open' | 'closed' } = {}): ShadowRootLike {
  if (typeof host.attachShadow !== 'function') throw new Error('orz chrome: the host element cannot have a shadow root');
  const root = host.attachShadow({ mode: options.mode ?? 'open' });
  const doc = documentOf(host);
  const Sheet = viewOf(doc)?.CSSStyleSheet;
  let adopted = false;
  if (Sheet && Array.isArray(root.adoptedStyleSheets)) {
    try {
      const sheet = new Sheet();
      sheet.replaceSync(CHROME_CSS);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      adopted = true;
    } catch {
      adopted = false;
    }
  }
  if (!adopted && doc) {
    const style = doc.createElement('style');
    style.append(doc.createTextNode(CHROME_CSS));
    root.append(style);
  }
  return root;
}

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  tone?: ToastTone;
  /** Auto-dismiss after this many ms (`0`: stays until dismissed). Default 5 s; 8 s for warnings and errors (with `actions`: 0). Paused while hovered or focused. */
  timeoutMs?: number;
  /**
   * Buttons in the toast (2.2.0): choosing one dismisses the toast, then runs
   * it. A toast with actions stays until chosen or dismissed (default
   * `timeoutMs` 0) and takes the focus on its first action when `focus` is set.
   */
  actions?: ReadonlyArray<{ label: string; run(): void; primary?: boolean }>;
  /** Called once when the toast goes without an action chosen (Dismiss, the timeout, `dismiss()`). */
  onDismiss?(): void;
  /** Focus the first action (a question the reader must answer). */
  focus?: boolean;
}

export interface Toast {
  dismiss(): void;
}

const TONE_ICON: Record<ToastTone, IconName> = { info: 'info', success: 'check', warning: 'warning', error: 'warning' };
const stacks = new WeakMap<object, UiElement>();

/**
 * Show a toast in a chrome root (a shadow root from {@link createShadowRoot},
 * or an element inside one). Toasts stack bottom-centre in one
 * `aria-live="polite"` region per root; each has a Dismiss button and goes by
 * itself after `timeoutMs` (paused while the pointer or focus is on it).
 */
export function showToast(root: ShadowRootLike | UiElement, message: string, options: ToastOptions = {}): Toast {
  const doc = documentOf((root as { host?: UiElement }).host ?? (root as UiElement));
  if (!doc) return { dismiss() { /* no document */ } };
  const view = viewOf(doc);
  let stack = stacks.get(root);
  if (!stack) {
    stack = doc.createElement('div');
    stack.className = 'orz-toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-relevant', 'additions');
    root.append(stack);
    stacks.set(root, stack);
  }
  const tone: ToastTone = options.tone && Object.prototype.hasOwnProperty.call(TONE_ICON, options.tone) ? options.tone : 'info';
  const actions = Array.isArray(options.actions) ? options.actions.filter((a) => a && typeof a.label === 'string' && typeof a.run === 'function') : [];
  const timeout = typeof options.timeoutMs === 'number' && options.timeoutMs >= 0 ? options.timeoutMs : actions.length ? 0 : tone === 'warning' || tone === 'error' ? 8000 : 5000;
  const toast = doc.createElement('div');
  toast.className = 'orz-toast';
  toast.setAttribute('data-tone', tone);
  const msg = textElement(doc, 'span', 'orz-toast__message', String(message));
  const close = doc.createElement('button');
  close.setAttribute('type', 'button');
  close.className = 'orz-btn orz-btn--ghost orz-btn--icon orz-toast__close';
  close.setAttribute('aria-label', 'Dismiss');
  close.append(iconElement(doc, 'close'));
  const buttons: UiElement[] = [];
  let chosen = false;
  if (actions.length) {
    const row = doc.createElement('span');
    row.className = 'orz-toast__actions';
    for (const a of actions) {
      const b = doc.createElement('button');
      b.setAttribute('type', 'button');
      b.className = `orz-btn ${a.primary ? 'orz-btn--primary' : 'orz-btn--ghost'} orz-toast__action`;
      b.append(doc.createTextNode(String(a.label)));
      b.addEventListener('click', () => {
        if (gone) return;
        chosen = true;
        dismiss();
        try { a.run(); } catch { /* the action's own error */ }
      });
      buttons.push(b);
      row.append(b);
    }
    msg.el.append(row);
  }
  toast.append(iconElement(doc, TONE_ICON[tone]), msg.el, close);
  stack.append(toast);
  if (options.focus && buttons[0]) buttons[0].focus?.();

  let timer: unknown = null;
  let gone = false;
  const clear = (): void => { if (timer !== null && view) view.clearTimeout(timer); timer = null; };
  const arm = (): void => { clear(); if (timeout > 0 && view && !gone) timer = view.setTimeout(dismiss, timeout); };
  function dismiss(): void {
    if (gone) return;
    gone = true;
    clear();
    toast.remove();
    if (!chosen) { try { options.onDismiss?.(); } catch { /* the caller's own error */ } }
  }
  close.addEventListener('click', dismiss);
  toast.addEventListener('pointerenter', clear);
  toast.addEventListener('pointerleave', arm);
  toast.addEventListener('focusin', clear);
  toast.addEventListener('focusout', arm);
  arm();
  return { dismiss };
}

/** What the reader is asked when the file changed on disk since the page opened it (a save's `conflict` result, 2.2.0). */
export const SAVE_CONFLICT_MESSAGE = 'This file changed on disk since you opened it (another program or an agent edited it). Replace it with your version?';

/**
 * Ask the reader about a save that found the file changed on disk (2.2.0,
 * shell-runtime §1): a toast that stays, with "Replace it" and "Download a
 * copy instead"; the focus goes to the first. Resolves the choice, or null
 * when the toast is dismissed. Writes text only.
 */
export function askSaveConflict(root: ShadowRootLike | UiElement, name?: string): Promise<'replace' | 'download' | null> {
  return new Promise((resolve) => {
    showToast(root, name ? `${name}: ${SAVE_CONFLICT_MESSAGE}` : SAVE_CONFLICT_MESSAGE, {
      tone: 'warning',
      focus: true,
      actions: [
        { label: 'Replace it', primary: true, run: () => resolve('replace') },
        { label: 'Download a copy instead', run: () => resolve('download') },
      ],
      onDismiss: () => resolve(null),
    });
  });
}
