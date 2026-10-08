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
/**
 * The shell chrome's stylesheet, installed in every chrome shadow root by
 * {@link createShadowRoot}. Tokens are custom properties on `:host`
 * (`--orz-chrome-*`); dark applies with `prefers-color-scheme: dark`, and an
 * explicit `data-chrome="light"` / `"dark"` on the host (or, where
 * `:host-context` is supported, on an ancestor such as `<html>`) overrides
 * the system.
 */
export declare const CHROME_CSS = "\n:host {\n  all: initial;\n  display: inline-block;\n  \n  --orz-chrome-bg: oklch(98.6% 0.003 255);\n  --orz-chrome-surface: oklch(100% 0 0);\n  --orz-chrome-surface-2: oklch(96.4% 0.005 255);\n  --orz-chrome-hover: oklch(93.8% 0.008 255);\n  --orz-chrome-border: oklch(88.5% 0.008 255);\n  --orz-chrome-fg: oklch(25% 0.015 260);\n  --orz-chrome-muted: oklch(50% 0.016 260);\n  --orz-chrome-accent: oklch(54% 0.17 258);\n  --orz-chrome-accent-hover: oklch(49% 0.17 258);\n  --orz-chrome-accent-fg: oklch(99% 0.002 258);\n  --orz-chrome-focus: oklch(60% 0.19 258);\n  --orz-chrome-success: oklch(54% 0.13 155);\n  --orz-chrome-warning: oklch(64% 0.15 70);\n  --orz-chrome-danger: oklch(56% 0.19 25);\n  --orz-chrome-info: oklch(54% 0.17 258);\n  --orz-chrome-shadow: 0 1px 2px oklch(22% 0.02 260 / 0.08), 0 8px 28px oklch(22% 0.02 260 / 0.14);\n  --orz-chrome-syntax-heading: oklch(45% 0.16 258);\n  --orz-chrome-syntax-mark: oklch(50% 0.016 260);\n  --orz-chrome-syntax-link: oklch(48% 0.15 245);\n  --orz-chrome-syntax-url: oklch(47% 0.1 210);\n  --orz-chrome-syntax-code: oklch(48% 0.14 25);\n  --orz-chrome-syntax-quote: oklch(46% 0.09 150);\n  --orz-chrome-syntax-comment: oklch(50% 0.016 260);\n  --orz-chrome-syntax-label: oklch(47% 0.14 300);\n  color-scheme: light;\n  --orz-chrome-font: system-ui, -apple-system, \"Segoe UI\", Roboto, \"Helvetica Neue\", \"Noto Sans\", \"PingFang SC\", \"Hiragino Sans\", \"Microsoft YaHei\", sans-serif;\n  --orz-chrome-mono: ui-monospace, \"SF Mono\", \"JetBrains Mono\", Menlo, Consolas, monospace;\n  --orz-chrome-text-xs: 11px;\n  --orz-chrome-text-sm: 12px;\n  --orz-chrome-text-md: 13px;\n  --orz-chrome-text-lg: 15px;\n  --orz-chrome-space-1: 2px;\n  --orz-chrome-space-2: 4px;\n  --orz-chrome-space-3: 8px;\n  --orz-chrome-space-4: 12px;\n  --orz-chrome-space-5: 16px;\n  --orz-chrome-space-6: 24px;\n  --orz-chrome-radius-s: 6px;\n  --orz-chrome-radius-m: 10px;\n  --orz-chrome-radius-l: 14px;\n  --orz-chrome-radius-pill: 999px;\n  --orz-chrome-control: 30px;\n  --orz-chrome-ease: cubic-bezier(.2, .7, .2, 1);\n  --orz-chrome-fast: 120ms;\n  --orz-chrome-slow: 200ms;\n  --orz-chrome-z: 2147483000;\n  font: 400 var(--orz-chrome-text-md)/1.45 var(--orz-chrome-font);\n  color: var(--orz-chrome-fg);\n  -webkit-font-smoothing: antialiased;\n}\n@media (prefers-color-scheme: dark) { :host { \n  --orz-chrome-bg: oklch(21% 0.008 260);\n  --orz-chrome-surface: oklch(25% 0.009 260);\n  --orz-chrome-surface-2: oklch(28.5% 0.01 260);\n  --orz-chrome-hover: oklch(33% 0.012 260);\n  --orz-chrome-border: oklch(36% 0.012 260);\n  --orz-chrome-fg: oklch(93% 0.006 260);\n  --orz-chrome-muted: oklch(72% 0.012 260);\n  --orz-chrome-accent: oklch(70% 0.14 258);\n  --orz-chrome-accent-hover: oklch(76% 0.12 258);\n  --orz-chrome-accent-fg: oklch(20% 0.03 258);\n  --orz-chrome-focus: oklch(76% 0.14 258);\n  --orz-chrome-success: oklch(74% 0.14 155);\n  --orz-chrome-warning: oklch(80% 0.14 80);\n  --orz-chrome-danger: oklch(71% 0.16 25);\n  --orz-chrome-info: oklch(70% 0.14 258);\n  --orz-chrome-shadow: 0 1px 2px oklch(0% 0 0 / 0.4), 0 10px 32px oklch(0% 0 0 / 0.45);\n  --orz-chrome-syntax-heading: oklch(80% 0.11 258);\n  --orz-chrome-syntax-mark: oklch(72% 0.012 260);\n  --orz-chrome-syntax-link: oklch(78% 0.11 240);\n  --orz-chrome-syntax-url: oklch(78% 0.09 210);\n  --orz-chrome-syntax-code: oklch(80% 0.1 45);\n  --orz-chrome-syntax-quote: oklch(80% 0.09 150);\n  --orz-chrome-syntax-comment: oklch(72% 0.012 260);\n  --orz-chrome-syntax-label: oklch(80% 0.1 300);\n  color-scheme: dark; } }\n:host-context([data-chrome=\"light\"]) { \n  --orz-chrome-bg: oklch(98.6% 0.003 255);\n  --orz-chrome-surface: oklch(100% 0 0);\n  --orz-chrome-surface-2: oklch(96.4% 0.005 255);\n  --orz-chrome-hover: oklch(93.8% 0.008 255);\n  --orz-chrome-border: oklch(88.5% 0.008 255);\n  --orz-chrome-fg: oklch(25% 0.015 260);\n  --orz-chrome-muted: oklch(50% 0.016 260);\n  --orz-chrome-accent: oklch(54% 0.17 258);\n  --orz-chrome-accent-hover: oklch(49% 0.17 258);\n  --orz-chrome-accent-fg: oklch(99% 0.002 258);\n  --orz-chrome-focus: oklch(60% 0.19 258);\n  --orz-chrome-success: oklch(54% 0.13 155);\n  --orz-chrome-warning: oklch(64% 0.15 70);\n  --orz-chrome-danger: oklch(56% 0.19 25);\n  --orz-chrome-info: oklch(54% 0.17 258);\n  --orz-chrome-shadow: 0 1px 2px oklch(22% 0.02 260 / 0.08), 0 8px 28px oklch(22% 0.02 260 / 0.14);\n  --orz-chrome-syntax-heading: oklch(45% 0.16 258);\n  --orz-chrome-syntax-mark: oklch(50% 0.016 260);\n  --orz-chrome-syntax-link: oklch(48% 0.15 245);\n  --orz-chrome-syntax-url: oklch(47% 0.1 210);\n  --orz-chrome-syntax-code: oklch(48% 0.14 25);\n  --orz-chrome-syntax-quote: oklch(46% 0.09 150);\n  --orz-chrome-syntax-comment: oklch(50% 0.016 260);\n  --orz-chrome-syntax-label: oklch(47% 0.14 300);\n  color-scheme: light; }\n:host-context([data-chrome=\"dark\"]) { \n  --orz-chrome-bg: oklch(21% 0.008 260);\n  --orz-chrome-surface: oklch(25% 0.009 260);\n  --orz-chrome-surface-2: oklch(28.5% 0.01 260);\n  --orz-chrome-hover: oklch(33% 0.012 260);\n  --orz-chrome-border: oklch(36% 0.012 260);\n  --orz-chrome-fg: oklch(93% 0.006 260);\n  --orz-chrome-muted: oklch(72% 0.012 260);\n  --orz-chrome-accent: oklch(70% 0.14 258);\n  --orz-chrome-accent-hover: oklch(76% 0.12 258);\n  --orz-chrome-accent-fg: oklch(20% 0.03 258);\n  --orz-chrome-focus: oklch(76% 0.14 258);\n  --orz-chrome-success: oklch(74% 0.14 155);\n  --orz-chrome-warning: oklch(80% 0.14 80);\n  --orz-chrome-danger: oklch(71% 0.16 25);\n  --orz-chrome-info: oklch(70% 0.14 258);\n  --orz-chrome-shadow: 0 1px 2px oklch(0% 0 0 / 0.4), 0 10px 32px oklch(0% 0 0 / 0.45);\n  --orz-chrome-syntax-heading: oklch(80% 0.11 258);\n  --orz-chrome-syntax-mark: oklch(72% 0.012 260);\n  --orz-chrome-syntax-link: oklch(78% 0.11 240);\n  --orz-chrome-syntax-url: oklch(78% 0.09 210);\n  --orz-chrome-syntax-code: oklch(80% 0.1 45);\n  --orz-chrome-syntax-quote: oklch(80% 0.09 150);\n  --orz-chrome-syntax-comment: oklch(72% 0.012 260);\n  --orz-chrome-syntax-label: oklch(80% 0.1 300);\n  color-scheme: dark; }\n:host([data-chrome=\"light\"]) { \n  --orz-chrome-bg: oklch(98.6% 0.003 255);\n  --orz-chrome-surface: oklch(100% 0 0);\n  --orz-chrome-surface-2: oklch(96.4% 0.005 255);\n  --orz-chrome-hover: oklch(93.8% 0.008 255);\n  --orz-chrome-border: oklch(88.5% 0.008 255);\n  --orz-chrome-fg: oklch(25% 0.015 260);\n  --orz-chrome-muted: oklch(50% 0.016 260);\n  --orz-chrome-accent: oklch(54% 0.17 258);\n  --orz-chrome-accent-hover: oklch(49% 0.17 258);\n  --orz-chrome-accent-fg: oklch(99% 0.002 258);\n  --orz-chrome-focus: oklch(60% 0.19 258);\n  --orz-chrome-success: oklch(54% 0.13 155);\n  --orz-chrome-warning: oklch(64% 0.15 70);\n  --orz-chrome-danger: oklch(56% 0.19 25);\n  --orz-chrome-info: oklch(54% 0.17 258);\n  --orz-chrome-shadow: 0 1px 2px oklch(22% 0.02 260 / 0.08), 0 8px 28px oklch(22% 0.02 260 / 0.14);\n  --orz-chrome-syntax-heading: oklch(45% 0.16 258);\n  --orz-chrome-syntax-mark: oklch(50% 0.016 260);\n  --orz-chrome-syntax-link: oklch(48% 0.15 245);\n  --orz-chrome-syntax-url: oklch(47% 0.1 210);\n  --orz-chrome-syntax-code: oklch(48% 0.14 25);\n  --orz-chrome-syntax-quote: oklch(46% 0.09 150);\n  --orz-chrome-syntax-comment: oklch(50% 0.016 260);\n  --orz-chrome-syntax-label: oklch(47% 0.14 300);\n  color-scheme: light; }\n:host([data-chrome=\"dark\"]) { \n  --orz-chrome-bg: oklch(21% 0.008 260);\n  --orz-chrome-surface: oklch(25% 0.009 260);\n  --orz-chrome-surface-2: oklch(28.5% 0.01 260);\n  --orz-chrome-hover: oklch(33% 0.012 260);\n  --orz-chrome-border: oklch(36% 0.012 260);\n  --orz-chrome-fg: oklch(93% 0.006 260);\n  --orz-chrome-muted: oklch(72% 0.012 260);\n  --orz-chrome-accent: oklch(70% 0.14 258);\n  --orz-chrome-accent-hover: oklch(76% 0.12 258);\n  --orz-chrome-accent-fg: oklch(20% 0.03 258);\n  --orz-chrome-focus: oklch(76% 0.14 258);\n  --orz-chrome-success: oklch(74% 0.14 155);\n  --orz-chrome-warning: oklch(80% 0.14 80);\n  --orz-chrome-danger: oklch(71% 0.16 25);\n  --orz-chrome-info: oklch(70% 0.14 258);\n  --orz-chrome-shadow: 0 1px 2px oklch(0% 0 0 / 0.4), 0 10px 32px oklch(0% 0 0 / 0.45);\n  --orz-chrome-syntax-heading: oklch(80% 0.11 258);\n  --orz-chrome-syntax-mark: oklch(72% 0.012 260);\n  --orz-chrome-syntax-link: oklch(78% 0.11 240);\n  --orz-chrome-syntax-url: oklch(78% 0.09 210);\n  --orz-chrome-syntax-code: oklch(80% 0.1 45);\n  --orz-chrome-syntax-quote: oklch(80% 0.09 150);\n  --orz-chrome-syntax-comment: oklch(72% 0.012 260);\n  --orz-chrome-syntax-label: oklch(80% 0.1 300);\n  color-scheme: dark; }\n:host([hidden]) { display: none; }\n*, *::before, *::after { box-sizing: border-box; }\n[hidden] { display: none !important; }\n:focus { outline: none; }\n:focus-visible { outline: 2px solid var(--orz-chrome-focus); outline-offset: 2px; }\n.orz-icon { display: inline-flex; flex: none; width: 16px; height: 16px; }\n.orz-icon svg { width: 100%; height: 100%; display: block; }\n.orz-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }\n\n.orz-btn {\n  display: inline-flex; align-items: center; justify-content: center; gap: var(--orz-chrome-space-2);\n  min-height: var(--orz-chrome-control); padding: 0 var(--orz-chrome-space-4);\n  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-s);\n  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg);\n  font: 500 var(--orz-chrome-text-md)/1 var(--orz-chrome-font); cursor: pointer; white-space: nowrap;\n  transition: background var(--orz-chrome-fast) var(--orz-chrome-ease), border-color var(--orz-chrome-fast) var(--orz-chrome-ease), color var(--orz-chrome-fast) var(--orz-chrome-ease);\n}\n.orz-btn:hover { background: var(--orz-chrome-hover); }\n.orz-btn:disabled { opacity: .55; cursor: default; }\n.orz-btn--primary { background: var(--orz-chrome-accent); border-color: transparent; color: var(--orz-chrome-accent-fg); }\n.orz-btn--primary:hover { background: var(--orz-chrome-accent-hover); }\n.orz-btn--ghost { background: transparent; border-color: transparent; color: var(--orz-chrome-muted); }\n.orz-btn--ghost:hover { background: var(--orz-chrome-hover); color: var(--orz-chrome-fg); }\n.orz-btn--icon { width: var(--orz-chrome-control); padding: 0; }\n\n.orz-chip {\n  position: relative; display: inline-flex; align-items: center; justify-content: center; gap: var(--orz-chrome-space-2);\n  height: 22px; min-width: 22px; padding: 0 var(--orz-chrome-space-2);\n  border: 0; border-radius: var(--orz-chrome-radius-pill);\n  background: transparent; color: var(--orz-chrome-accent); cursor: pointer;\n  font: 600 var(--orz-chrome-text-xs)/1 var(--orz-chrome-font);\n  transition: background var(--orz-chrome-fast) var(--orz-chrome-ease);\n}\n.orz-chip:hover, .orz-chip[aria-expanded=\"true\"] { background: color-mix(in oklch, var(--orz-chrome-accent) 14%, transparent); }\n.orz-chip .orz-icon { width: 14px; height: 14px; }\n.orz-dot {\n  position: absolute; top: 2px; right: 2px; width: 7px; height: 7px; border-radius: 50%;\n  background: var(--orz-chrome-accent); box-shadow: 0 0 0 2px var(--orz-chrome-bg);\n  animation: orz-chrome-in var(--orz-chrome-slow) var(--orz-chrome-ease) both;\n}\n\n.orz-popover {\n  position: fixed; z-index: var(--orz-chrome-z); width: max-content; max-width: min(320px, calc(100vw - 16px));\n  padding: var(--orz-chrome-space-4) var(--orz-chrome-space-5) var(--orz-chrome-space-4);\n  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-m);\n  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);\n  animation: orz-chrome-pop var(--orz-chrome-slow) var(--orz-chrome-ease) both;\n}\n.orz-popover__title { margin: 0 0 var(--orz-chrome-space-1); font: 600 var(--orz-chrome-text-lg)/1.3 var(--orz-chrome-font); }\n.orz-popover__meta { margin: 0 0 var(--orz-chrome-space-3); color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-sm); }\n.orz-popover__link { color: var(--orz-chrome-accent); font-size: var(--orz-chrome-text-sm); text-decoration: none; border-radius: 3px; }\n.orz-popover__link:hover { text-decoration: underline; }\n.orz-popover__error { margin: var(--orz-chrome-space-3) 0 0; color: var(--orz-chrome-danger); font-size: var(--orz-chrome-text-sm); }\n.orz-popover__actions { display: flex; flex-wrap: wrap; gap: var(--orz-chrome-space-2); margin-top: var(--orz-chrome-space-4); }\n\n.orz-toasts {\n  position: fixed; z-index: var(--orz-chrome-z); left: 50%; bottom: var(--orz-chrome-space-5); transform: translateX(-50%);\n  display: flex; flex-direction: column-reverse; align-items: center;\n  width: max-content; max-width: min(560px, calc(100vw - 24px)); pointer-events: none;\n}\n.orz-toast-stack, .orz-toast-questions { display: flex; flex-direction: column-reverse; align-items: center; gap: var(--orz-chrome-space-3); max-width: 100%; }\n.orz-toast-stack:not(:empty) ~ .orz-toast-questions:not(:empty) { margin-bottom: var(--orz-chrome-space-3); }\n.orz-toast {\n  display: flex; align-items: flex-start; gap: var(--orz-chrome-space-3); pointer-events: auto;\n  padding: var(--orz-chrome-space-3) var(--orz-chrome-space-3) var(--orz-chrome-space-3) var(--orz-chrome-space-4);\n  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-m);\n  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);\n  animation: orz-chrome-rise var(--orz-chrome-slow) var(--orz-chrome-ease) both;\n}\n.orz-toast > .orz-icon { margin-top: 1px; color: var(--orz-chrome-info); }\n.orz-toast[data-tone=\"success\"] > .orz-icon { color: var(--orz-chrome-success); }\n.orz-toast[data-tone=\"warning\"] > .orz-icon { color: var(--orz-chrome-warning); }\n.orz-toast[data-tone=\"error\"] > .orz-icon { color: var(--orz-chrome-danger); }\n.orz-toast__message { flex: 1; min-width: 0; padding-top: 1px; overflow-wrap: anywhere; }\n.orz-toast__title { display: block; font-weight: 600; margin-bottom: var(--orz-chrome-space-1); }\n.orz-toast__actions { display: flex; flex-wrap: wrap; gap: var(--orz-chrome-space-2); margin-top: var(--orz-chrome-space-3); }\n.orz-toast__action { min-height: 26px; padding: 0 var(--orz-chrome-space-3); font-size: var(--orz-chrome-text-sm); }\n.orz-toast__close { width: 22px; height: 22px; min-height: 22px; padding: 0; margin: -2px -2px 0 0; }\n.orz-toast__close .orz-icon { width: 14px; height: 14px; }\n\n@keyframes orz-chrome-in { from { opacity: 0; transform: scale(.4); } to { opacity: 1; transform: none; } }\n@keyframes orz-chrome-pop { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }\n@keyframes orz-chrome-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }\n@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after { animation: none !important; transition: none !important; }\n}\n@media print { :host { display: none !important; } }\n";
/** The shell's inline icons (24×24, stroke `currentColor`, `aria-hidden`); name a control with `aria-label`, not the icon. */
export declare const ICONS: {
    readonly save: string;
    readonly download: string;
    readonly update: string;
    readonly edit: string;
    readonly preview: string;
    readonly split: string;
    readonly theme: string;
    readonly close: string;
    readonly info: string;
    readonly check: string;
    readonly warning: string;
    readonly more: string;
    readonly measure: string;
    readonly new: string;
    readonly copy: string;
    readonly present: string;
    readonly print: string;
    readonly pageSize: string;
};
export type IconName = keyof typeof ICONS;
/** An icon element (`span.orz-icon` holding one of {@link ICONS}). */
export declare function iconElement(doc: UiDocument, name: IconName): UiElement;
/**
 * A kind's own icon (2.2.0): the `d` of up to {@link KIND_ICON_MAX_PATHS}
 * stroked paths on the ICONS grid (24×24, `currentColor`), nothing else — no
 * markup, so no script, link, style or colour can come with it. Each `d` is
 * path data only (commands, numbers, separators; at most 1,000 characters).
 */
export interface KindIcon {
    readonly paths: readonly string[];
}
export declare const KIND_ICON_MAX_PATHS = 8;
/** True when a value is a well-formed {@link KindIcon}. */
export declare function isKindIcon(icon: unknown): icon is KindIcon;
/**
 * An icon element for a kit icon name or a kind's {@link KindIcon}: the kit's
 * constant, or the kind's paths built element by element (`createElementNS`,
 * attributes set as data — never markup). Null for an unknown name, a
 * malformed kind icon or a document without SVG elements: the control keeps
 * its label.
 */
export declare function anyIconElement(doc: UiDocument, icon: IconName | KindIcon | undefined): UiElement | null;
/** An element with a text child (the text is set as data, never parsed as HTML). */
export declare function textElement(doc: UiDocument, tag: string, className: string, text: string): {
    el: UiElement;
    text: TextLike;
};
/** The document an element belongs to (or the global one). */
export declare function documentOf(el: UiElement | undefined): UiDocument | undefined;
/** The view (window) of a document. */
export declare function viewOf(doc: UiDocument | undefined): UiView | undefined;
/**
 * Attach a shadow root to `host` and install {@link CHROME_CSS} in it — as a
 * constructed stylesheet where supported (no inline `<style>`, so a strict
 * `style-src` keeps working), else a `<style>` element. `mode` defaults to
 * `open`, so tests and assistive tooling can reach the chrome.
 */
export declare function createShadowRoot(host: UiElement, options?: {
    mode?: 'open' | 'closed';
}): ShadowRootLike;
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
    actions?: ReadonlyArray<{
        label: string;
        run(): void;
        primary?: boolean;
        autofocus?: boolean;
    }>;
    /**
     * A short title shown above the message (2.2.0, round 3). A toast with
     * actions is a question: `role="alertdialog"` labelled by its title (else
     * its message) and described by its message, outside the polite status
     * region, so focusing its default action announces the question.
     */
    title?: string;
    /** Called once when the toast goes without an action chosen (Dismiss, the timeout, `dismiss()`). */
    onDismiss?(): void;
    /** Focus an action (a question the reader must answer): the one marked `autofocus`, else the first. */
    focus?: boolean;
}
export interface Toast {
    dismiss(): void;
    /** Focus the toast's default action again (the one `focus` took), if it has actions and is still shown (2.2.0). */
    focus(): void;
    /** Change the message (text, never HTML) of a toast still shown (2.2.0). */
    setMessage(message: string): void;
}
/**
 * Show a toast in a chrome root (a shadow root from {@link createShadowRoot},
 * or an element inside one). Toasts stack bottom-centre: plain ones in one
 * `role="status"` `aria-live="polite"` region per root, toasts with actions
 * (questions) beside it as `role="alertdialog"` (labelled by the title, else
 * the message; described by the message), so a question is not read twice;
 * each has a Dismiss button and goes by itself after `timeoutMs` (paused
 * while the pointer or focus is on it).
 */
export declare function showToast(root: ShadowRootLike | UiElement, message: string, options?: ToastOptions): Toast;
/** The title of the conflict question (its accessible name: round 3). */
export declare const SAVE_CONFLICT_TITLE = "The file changed on disk";
/**
 * What the reader is asked when the file changed on disk since the page
 * opened it (a save's `conflict` result, 2.2.0; round 3: the consequence of
 * each answer is said, and a later save of the page also counts).
 */
export declare const SAVE_CONFLICT_MESSAGE = "This file changed on disk since this page opened or last saved it (another program or an agent edited it). Download a copy to keep both versions; replacing the file loses the version on disk.";
/**
 * The question for an editor with no opened file (an app's editor, round 3):
 * the file the reader picked holds another version of the document.
 */
export declare const SAVE_CONFLICT_PICKED_MESSAGE = "The file you chose holds another version of this document (another program or an agent edited it). Download a copy to keep both versions; replacing the file loses the version on disk.";
/** The question's answers: the safe default first (round 3: the destructive one is never styled primary). */
export declare const SAVE_CONFLICT_LABELS: {
    readonly download: "Download a copy instead";
    readonly replace: "Replace it (the version on disk is lost)";
};
/** What the reader is told after "Download a copy instead" (round 3, L11: the next save asks again). */
export declare const SAVE_CONFLICT_DOWNLOADED = "Download started; the file on disk is unchanged. Your next save asks again.";
/** Options of {@link askSaveConflict} (2.2.0). */
export interface SaveConflictOptions {
    /** Where the focus goes back to after the reader answers or dismisses (the element focused before the save). */
    returnFocus?: {
        focus?(options?: {
            preventScroll?: boolean;
        }): void;
    } | null;
    /**
     * The page or editor was opened from a file (default `true`): the question
     * says the file changed since then. `false` (an app's editor with no opened
     * file, round 3): {@link SAVE_CONFLICT_PICKED_MESSAGE}.
     */
    opened?: boolean;
}
/**
 * Ask the reader about a save that found the file changed on disk (2.2.0,
 * shell-runtime §1 step 3.4): a question (`role="alertdialog"`, titled
 * {@link SAVE_CONFLICT_TITLE}, described by the message) that stays, with
 * "Download a copy instead" (focused and styled as the default: it changes
 * nothing on disk) and "Replace it (the version on disk is lost)"; Escape
 * dismisses it (nothing chosen), and after a choice or a dismissal the
 * focus goes back to `returnFocus`. Resolves the choice, or null when the
 * toast is dismissed. One question per root: asked again while one is open,
 * the open one is focused and answers the newer call — the older call
 * resolves null (a caller then writes nothing: an older text is never
 * written over the newer one). Writes text only.
 */
export declare function askSaveConflict(root: ShadowRootLike | UiElement, name?: string, options?: SaveConflictOptions): Promise<'replace' | 'download' | null>;
//# sourceMappingURL=chrome.d.ts.map