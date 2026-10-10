/**
 * The read view's one control (spec/carrier-app.md §4.2, 2.2.0): a small
 * round pencil fixed at the bottom-left corner — the handle for every
 * operation — and the compact list of operations it opens above itself.
 *
 * - **Pointer.** A click on the pencil runs its main action (Edit). Hovering
 *   it opens the list after a short delay; leaving the pencil and the list
 *   closes it after a grace period, so moving from the pencil into the list
 *   (or into a submenu) keeps it open.
 * - **Touch / pen.** A tap on the pencil opens (or closes) the list — its
 *   first item is the main action; a tap outside closes it.
 * - **Keyboard and screen readers.** The pencil is a button named by its
 *   label (`aria-haspopup="menu"`, `aria-expanded`); Enter runs the main
 *   action, ArrowDown / Space open the list on its first item and ArrowUp on
 *   its last (the menu pattern: roving focus, Home / End, ArrowRight opens a
 *   submenu, ArrowLeft / Escape close it, Escape closes the list and returns
 *   the focus to the pencil, Tab closes it).
 *
 * Entries are built at each opening (`entries()`): items, submenus (radio
 * choices, actions, links) and rows of buttons that keep the list open (the
 * reader controls). Text is set as text; icons are the kit's. No transform,
 * filter or backdrop-filter on any ancestor of the fixed submenus. No DOM at
 * module load.
 */
import { type IconName, type KindIcon } from '../shell/chrome.js';
import type { AppDocument, AppElement } from './types.js';
/** One choice or action of a submenu. */
export interface HandleSubItem {
    label: string;
    /** A choice: whether it is the current one (`menuitemradio`). */
    checked?: boolean;
    swatch?: string;
    disabled?: boolean;
    /** A link (opens in a new tab, `noopener noreferrer`) instead of an action. */
    href?: string;
    /** A separator before this item (2.3.0: groups of a kind's submenu). */
    separator?: boolean;
    run?(): void;
}
/** A button of a row (stays open after it runs: the row is drawn again). */
export interface HandleRowButton {
    /** The visible text ("A−", "100%"). */
    text: string;
    /** The accessible name (it contains the visible text). */
    label: string;
    disabled?: boolean;
    run(): void;
}
interface EntryBase {
    /** Stable id (`data-orz-item`): the focus stays on it when the list is drawn again. */
    id: string;
    label: string;
    /** A separator before this entry. */
    separator?: boolean;
}
/** An entry of the handle's list. */
export type HandleEntry = (EntryBase & {
    type: 'item';
    icon?: IconName | KindIcon;
    hint?: string;
    dot?: boolean;
    disabled?: boolean;
    run(): void;
}) | (EntryBase & {
    type: 'submenu';
    icon?: IconName | KindIcon;
    dot?: boolean;
    disabled?: boolean;
    items(): HandleSubItem[];
}) | (EntryBase & {
    type: 'row';
    buttons(): HandleRowButton[];
});
export interface HandleOptions {
    /** The pencil's accessible name ("Edit and more") and the list's. */
    label: string;
    /** The pencil's main action (a pointer's click, Enter). */
    activate(): void;
    /** The list's entries, read at each opening. */
    entries(): HandleEntry[];
    /** Delay before a hover opens the list (ms, default 140). */
    openDelayMs?: number;
    /** Grace period before leaving closes it (ms, default 360). */
    closeDelayMs?: number;
}
export interface Handle {
    /** The wrapper (pencil + list), placed by the caller's CSS. */
    readonly element: AppElement;
    /** The pencil button. */
    readonly button: AppElement;
    /** Open the list; `focus`: move the focus to its first or last item (keyboard), else it stays (hover, API). */
    open(o?: {
        focus?: 'first' | 'last';
    }): void;
    close(): void;
    isOpen(): boolean;
    /** Draw an open list again (its entries changed); the focus keeps its item. */
    refresh(): void;
    /** Marks on the pencil (unsaved changes, an update) and its accessible description. */
    setMarks(marks: {
        dirty?: boolean;
        update?: boolean;
        description?: string;
    }): void;
    destroy(): void;
}
/** The handle's CSS (installed next to `CHROME_CSS` in the chrome's shadow root). */
export declare const HANDLE_CSS = "\n.orz-handle { position: relative; display: inline-block; }\n.orz-handle__pencil {\n  position: relative; display: inline-flex; align-items: center; justify-content: center;\n  width: 40px; height: 40px; padding: 0; border: 1px solid var(--orz-chrome-border); border-radius: 50%;\n  background: var(--orz-chrome-surface); color: var(--orz-chrome-accent); cursor: pointer;\n  box-shadow: var(--orz-chrome-shadow); opacity: .6;\n  transition: opacity var(--orz-chrome-fast) var(--orz-chrome-ease), background var(--orz-chrome-fast) var(--orz-chrome-ease);\n}\n.orz-handle__pencil .orz-icon { width: 18px; height: 18px; }\n.orz-handle:hover .orz-handle__pencil, .orz-handle__pencil:focus-visible, .orz-handle__pencil[aria-expanded=\"true\"] { opacity: 1; }\n.orz-handle__pencil:hover { background: var(--orz-chrome-hover); }\n.orz-handle__pencil[data-dirty=\"true\"], .orz-handle__pencil[data-update=\"true\"] { opacity: .85; }\n.orz-handle__pencil[data-dirty=\"true\"]::after, .orz-handle__pencil[data-update=\"true\"]::before {\n  content: \"\"; position: absolute; width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 0 2px var(--orz-chrome-surface);\n}\n.orz-handle__pencil[data-dirty=\"true\"]::after { top: 1px; right: 1px; background: var(--orz-chrome-accent); }\n.orz-handle__pencil[data-update=\"true\"]::before { bottom: 1px; right: 1px; background: var(--orz-chrome-success); }\n.orz-handle__list {\n  position: absolute; left: 0; bottom: calc(100% + 8px); z-index: var(--orz-chrome-z);\n  min-width: 232px; max-width: min(300px, calc(100vw - 24px)); max-height: calc(100vh - 88px); max-height: calc(100dvh - 88px); overflow-y: auto;\n  padding: var(--orz-chrome-space-2); border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-m);\n  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);\n  animation: orz-handle-in var(--orz-chrome-slow) var(--orz-chrome-ease) both;\n}\n@keyframes orz-handle-in { from { opacity: 0; } to { opacity: 1; } }\n.orz-handle__item {\n  display: flex; align-items: center; gap: var(--orz-chrome-space-3); width: 100%; min-height: 32px;\n  padding: 0 var(--orz-chrome-space-3); border: 0; border-radius: var(--orz-chrome-radius-s);\n  background: transparent; color: inherit; font: inherit; text-align: left; text-decoration: none; cursor: pointer; white-space: nowrap;\n}\n.orz-handle__item:hover, .orz-handle__item:focus-visible, .orz-handle__item[aria-expanded=\"true\"] { background: var(--orz-chrome-hover); }\n.orz-handle__item:disabled { opacity: .5; cursor: default; background: transparent; }\n.orz-handle__item > .orz-icon { color: var(--orz-chrome-muted); }\n.orz-handle__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }\n.orz-handle__hint { color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-xs); letter-spacing: .02em; }\n.orz-handle__chevron { color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-sm); }\n.orz-handle__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--orz-chrome-accent); flex: none; }\n.orz-handle__dot--update { background: var(--orz-chrome-success); }\n.orz-handle__check { width: 16px; display: inline-flex; color: var(--orz-chrome-accent); }\n.orz-handle__swatch { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--orz-chrome-border); flex: none; }\n.orz-handle__sep { height: 1px; margin: var(--orz-chrome-space-2) var(--orz-chrome-space-2); background: var(--orz-chrome-border); }\n.orz-handle__row { display: flex; align-items: center; gap: var(--orz-chrome-space-1); min-height: 34px; padding: 0 var(--orz-chrome-space-1) 0 var(--orz-chrome-space-3); }\n.orz-handle__row-label { flex: 1; color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-sm); }\n.orz-handle__row .orz-handle__item { width: auto; min-width: 34px; min-height: 28px; justify-content: center; padding: 0 var(--orz-chrome-space-2); font-variant-numeric: tabular-nums; }\n.orz-handle__row .orz-handle__item[data-orz-reset] { min-width: 52px; color: var(--orz-chrome-muted); }\n.orz-handle__sub {\n  position: fixed; z-index: var(--orz-chrome-z); min-width: 196px; max-width: min(280px, calc(100vw - 16px)); overflow-y: auto;\n  padding: var(--orz-chrome-space-2); border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-m);\n  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);\n  animation: orz-handle-in var(--orz-chrome-fast) var(--orz-chrome-ease) both;\n}\n";
/** Mount the handle (the caller appends `element` to its shadow root and places it). */
export declare function mountHandle(doc: AppDocument, o: HandleOptions): Handle;
export {};
//# sourceMappingURL=handle.d.ts.map