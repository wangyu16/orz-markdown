/**
 * Chrome widgets (spec/carrier-app.md §5), built on the kit's chrome
 * vocabulary (`CHROME_CSS` classes, `ICONS`, `showToast`; spec/shell-runtime.md
 * §8): buttons, a menu button (a non-modal popover of menu items, keyboard
 * operable), the header-setting picker every carrier needs (md: theme,
 * measure; slides: ratio; paged: page size, template), the AI menu with its
 * review panel (host-protocols §4: the document is untouched until the reader
 * applies a proposal), and the preview follower (a header change rebuilds the
 * preview frame's head). Carriers' `mountEditor` and apps use them too.
 *
 * Everything renders into a shadow root the caller owns; text is set as text,
 * never parsed as HTML (the icons are the kit's constants). No DOM at module
 * load.
 */
import { type IconName, type KindIcon } from '../shell/chrome.js';
import type { ShadowRootLike } from '../shell/types.js';
import type { AiProposal, EditorShell } from '../editor/shell.js';
import type { ColorScheme } from '../../preview-frame.js';
import type { HeaderChange } from '../header.js';
import type { AppDocument, AppElement, AppShadowRoot, SettingChoice, SettingControl } from './types.js';
/** CSS of these widgets (installed next to `CHROME_CSS`, in the shadow root that holds them). */
export declare const WIDGET_CSS = "\n.orz-menu-wrap { position: relative; display: inline-flex; }\n.orz-menu {\n  position: absolute; z-index: var(--orz-chrome-z); top: calc(100% + 6px); right: 0; min-width: 180px;\n  max-height: min(70vh, 420px); overflow: auto; padding: var(--orz-chrome-space-2);\n  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-m);\n  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);\n  animation: orz-chrome-pop var(--orz-chrome-slow) var(--orz-chrome-ease) both;\n}\n.orz-menu[data-align=\"left\"] { right: auto; left: 0; }\n.orz-menu__label { padding: var(--orz-chrome-space-2) var(--orz-chrome-space-3); color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }\n.orz-menu__item {\n  display: flex; align-items: center; gap: var(--orz-chrome-space-3); width: 100%; min-height: 30px;\n  padding: 0 var(--orz-chrome-space-3); border: 0; border-radius: var(--orz-chrome-radius-s);\n  background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;\n}\n.orz-menu__item:hover, .orz-menu__item:focus-visible { background: var(--orz-chrome-hover); }\n.orz-menu__item:disabled { opacity: .55; cursor: default; }\n.orz-menu__item[aria-checked=\"true\"] { font-weight: 600; }\n.orz-menu__check { width: 16px; display: inline-flex; color: var(--orz-chrome-accent); }\n.orz-menu__swatch { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--orz-chrome-border); flex: none; }\n.orz-menu__sep { height: 1px; margin: var(--orz-chrome-space-2) 0; background: var(--orz-chrome-border); }\n.orz-menu__label-text { flex: 1; min-width: 0; }\n.orz-menu__chevron { color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-sm); }\n.orz-menu__item[aria-expanded=\"true\"] { background: var(--orz-chrome-hover); }\n.orz-menu--sub { position: fixed; top: auto; right: auto; max-height: calc(100vh - 16px); }\n.orz-review {\n  position: fixed; z-index: var(--orz-chrome-z); right: var(--orz-chrome-space-5); bottom: var(--orz-chrome-space-6);\n  width: min(520px, calc(100vw - 32px)); padding: var(--orz-chrome-space-4);\n  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-l);\n  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);\n}\n.orz-review__title { margin: 0 0 var(--orz-chrome-space-2); font: 600 var(--orz-chrome-text-md)/1.3 var(--orz-chrome-font); }\n.orz-review__note { margin: 0 0 var(--orz-chrome-space-2); color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-sm); }\n.orz-review textarea {\n  display: block; width: 100%; min-height: 160px; resize: vertical; padding: var(--orz-chrome-space-3);\n  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-s);\n  background: var(--orz-chrome-bg); color: var(--orz-chrome-fg); font: 12px/1.5 var(--orz-chrome-mono);\n}\n.orz-review__actions { display: flex; justify-content: flex-end; gap: var(--orz-chrome-space-2); margin-top: var(--orz-chrome-space-3); }\n";
type CssRoot = Pick<AppShadowRoot, 'adoptedStyleSheets' | 'appendChild'> & {
    readonly ownerDocument?: AppDocument | null;
};
/** Install a stylesheet in a shadow root once (constructed where supported — a strict `style-src` keeps working — else a `<style>`). */
export declare function installCss(root: CssRoot, css: string): void;
export interface ButtonOptions {
    /** The label (text) and accessible name (`aria-label`). */
    label: string;
    /** A kit icon, or a kind's own (`KindIcon`: path data only, 2.2.0). */
    icon?: IconName | KindIcon;
    variant?: 'primary' | 'ghost';
    /** Icon only (the label stays the accessible name and the tooltip). */
    iconOnly?: boolean;
    title?: string;
}
/**
 * A chrome button named by its label (`aria-label`), with an optional icon (a
 * kit icon or a kind's). One with an icon gets `orz-btn--has-icon`: at narrow
 * widths (APP_CSS) only those drop their visible label — a button without an
 * icon (or whose kind icon is malformed) keeps it.
 */
export declare function button(doc: AppDocument, o: ButtonOptions): AppElement;
/** One entry of a menu. */
export interface MenuItem {
    label: string;
    /** Called when chosen (the menu closes first). An item with `items` is a submenu and is not run. */
    run(): void;
    /**
     * (2.3.0) A submenu: its items, read when it opens. ArrowRight, Enter,
     * Space or a click opens it (on its checked item, else its first);
     * ArrowLeft and Escape close it with the focus back on its item; hovering
     * opens it. One level (a submenu's own `items` are ignored).
     */
    items?(): MenuItem[];
    /** For a choice: whether it is the current one (`menuitemradio`). */
    checked?: boolean;
    /** A colour swatch before the label (theme pickers). */
    swatch?: string;
    /** A separator before this item. */
    separator?: boolean;
    disabled?: boolean;
}
export interface MenuButton {
    readonly element: AppElement;
    readonly button: AppElement;
    open(): void;
    close(): void;
    isOpen(): boolean;
    destroy(): void;
}
/**
 * A menu button: a chrome button that opens a non-modal popover of items
 * (`role="menu"`), built from `items()` at each opening. Arrow keys, Home and
 * End move; Enter/Space choose; Esc and a pointer-down outside close (Esc
 * returns focus to the button); Tab closes. Never modal.
 */
export declare function menuButton(doc: AppDocument, o: ButtonOptions & {
    items(): MenuItem[];
    heading?: string;
    align?: 'left' | 'right';
}): MenuButton;
/** The choices a setting offers for a text (2.3.0: `choicesFor(text)` when it has one, else `choices`). */
export declare function settingChoices(control: SettingControl, text: string): ReadonlyArray<SettingChoice>;
/** Whether a setting is offered for a text (2.3.0: not when its `hidden(text)` says so; a throwing one is hidden). */
export declare function settingOffered(control: SettingControl, text: string): boolean;
/** The header changes of choosing `value` (2.3.0: the setting's `apply(text, value)`, else `{ [key]: value }`). */
export declare function settingChanges(control: SettingControl, text: string, value: string): Readonly<Record<string, HeaderChange>>;
/**
 * A picker for one header setting: choosing calls `apply(key, value)` (the
 * caller writes the header; with the setting's own `apply` (2.3.0) it writes
 * `settingChanges(control, text, value)` — `attachSettings` does). Its items
 * are `choicesFor(text)` when the setting has it (read at each opening).
 */
export declare function settingPicker(doc: AppDocument, control: SettingControl, getText: () => string, apply: (key: string, value: string) => void, o?: {
    iconOnly?: boolean;
}): MenuButton;
/**
 * The header settings in an editor's toolbar: each picker writes the header
 * through `shell.setHeader` (one undoable edit, FC-18 §9); a refused change
 * is a toast and changes nothing. A kind's `mountEditor` calls it, so app
 * hosts get the same tools (FC-19 §1).
 */
export declare function attachSettings(shell: EditorShell, settings: readonly SettingControl[], o?: {
    iconOnly?: boolean;
}): {
    readonly pickers: readonly MenuButton[];
    destroy(): void;
};
/** An AI operation as hosts offer it (`orz-host-ai@1`, FC-19 `hooks.ai.operations`). */
export interface AiOp {
    id: string;
    title: string;
    selection?: boolean;
}
/**
 * The review panel of an AI proposal (host-protocols §4: the document is
 * untouched until the reader applies it): a non-modal `role="dialog"` with
 * the proposal in an editable text box, Apply (Replace selection / Replace
 * document) and Cancel; Esc cancels. Resolves the text to apply, or null.
 */
export declare function reviewProposal(root: AppShadowRoot | ShadowRootLike, proposal: AiProposal, o: {
    title: string;
}): Promise<string | null>;
export interface AiMenu {
    /** Re-read the operations (a host's AI hello arrived): the menu appears, or goes when there are none. */
    refresh(): void;
    destroy(): void;
}
/**
 * The AI menu in an editor's toolbar (2.2.0): one item per operation; choosing
 * one runs `shell.proposeAi`, shows the proposal in the review panel and,
 * when the reader applies it, `shell.applyAi` (one undoable edit, refused if
 * the text changed meanwhile). A passage operation without a selection, a
 * failed request and a refused apply are toasts. Hidden while there are no
 * operations. Used by the standalone app for a host's operations and by a
 * kind's `mountEditor` for an app's `hooks.ai`.
 */
export declare function attachAiMenu(shell: EditorShell, o: {
    operations(): readonly AiOp[];
    label?: string;
    iconOnly?: boolean;
}): AiMenu;
/** What the preview frame shows for a text's presentation (`shell.preview.setOptions`). */
export interface PreviewPresentation {
    head?: string;
    scheme?: ColorScheme;
    articleClass?: string;
}
/**
 * Keep an editor's preview frame on the text's presentation: after a pause in
 * editing (default 200 ms) `present(text)` is compared with the last one and,
 * when it differs (a theme, measure or page-size change in the header), the
 * frame document is rebuilt (`shell.preview.setOptions`). Returns the
 * unsubscribe (call it before `destroy`).
 */
export declare function followPresentation(shell: EditorShell, present: (text: string) => PreviewPresentation, o?: {
    delayMs?: number;
    window?: {
        setTimeout(f: () => void, ms?: number): unknown;
        clearTimeout(id: unknown): void;
    };
}): () => void;
export {};
//# sourceMappingURL=widgets.d.ts.map