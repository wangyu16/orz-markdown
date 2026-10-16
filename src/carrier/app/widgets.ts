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
import { anyIconElement, iconElement, showToast, type IconName, type KindIcon } from '../shell/chrome.js';
import type { ShadowRootLike, UiDocument } from '../shell/types.js';
import type { AiProposal, EditorShell } from '../editor/shell.js';
import type { ColorScheme } from '../../preview-frame.js';
import type { HeaderChange } from '../header.js';
import type { AppDocument, AppElement, AppEvent, AppShadowRoot, SettingChoice, SettingControl } from './types.js';

/** CSS of these widgets (installed next to `CHROME_CSS`, in the shadow root that holds them). */
export const WIDGET_CSS = `
.orz-menu-wrap { position: relative; display: inline-flex; }
.orz-menu {
  position: absolute; z-index: var(--orz-chrome-z); top: calc(100% + 6px); right: 0; min-width: 180px;
  max-height: min(70vh, 420px); overflow: auto; padding: var(--orz-chrome-space-2);
  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-m);
  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);
  animation: orz-chrome-pop var(--orz-chrome-slow) var(--orz-chrome-ease) both;
}
.orz-menu[data-align="left"] { right: auto; left: 0; }
.orz-menu__label { padding: var(--orz-chrome-space-2) var(--orz-chrome-space-3); color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.orz-menu__item {
  display: flex; align-items: center; gap: var(--orz-chrome-space-3); width: 100%; min-height: 30px;
  padding: 0 var(--orz-chrome-space-3); border: 0; border-radius: var(--orz-chrome-radius-s);
  background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.orz-menu__item:hover, .orz-menu__item:focus-visible { background: var(--orz-chrome-hover); }
.orz-menu__item:disabled { opacity: .55; cursor: default; }
.orz-menu__item[aria-checked="true"] { font-weight: 600; }
.orz-menu__check { width: 16px; display: inline-flex; color: var(--orz-chrome-accent); }
.orz-menu__swatch { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--orz-chrome-border); flex: none; }
.orz-menu__sep { height: 1px; margin: var(--orz-chrome-space-2) 0; background: var(--orz-chrome-border); }
.orz-menu__label-text { flex: 1; min-width: 0; }
.orz-menu__chevron { color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-sm); }
.orz-menu__item[aria-expanded="true"] { background: var(--orz-chrome-hover); }
.orz-menu--sub { position: fixed; top: auto; right: auto; max-height: calc(100vh - 16px); }
.orz-review {
  position: fixed; z-index: var(--orz-chrome-z); right: var(--orz-chrome-space-5); bottom: var(--orz-chrome-space-6);
  width: min(520px, calc(100vw - 32px)); padding: var(--orz-chrome-space-4);
  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-l);
  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);
}
.orz-review__title { margin: 0 0 var(--orz-chrome-space-2); font: 600 var(--orz-chrome-text-md)/1.3 var(--orz-chrome-font); }
.orz-review__note { margin: 0 0 var(--orz-chrome-space-2); color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-sm); }
.orz-review textarea {
  display: block; width: 100%; min-height: 160px; resize: vertical; padding: var(--orz-chrome-space-3);
  border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-s);
  background: var(--orz-chrome-bg); color: var(--orz-chrome-fg); font: 12px/1.5 var(--orz-chrome-mono);
}
.orz-review__actions { display: flex; justify-content: flex-end; gap: var(--orz-chrome-space-2); margin-top: var(--orz-chrome-space-3); }
`;

type CssRoot = Pick<AppShadowRoot, 'adoptedStyleSheets' | 'appendChild'> & { readonly ownerDocument?: AppDocument | null };
const installed = new WeakMap<object, Set<string>>();

/** Install a stylesheet in a shadow root once (constructed where supported — a strict `style-src` keeps working — else a `<style>`). */
export function installCss(root: CssRoot, css: string): void {
  let set = installed.get(root);
  if (set?.has(css)) return;
  if (!set) installed.set(root, (set = new Set()));
  set.add(css);
  const doc = root.ownerDocument;
  const Sheet = doc?.defaultView?.CSSStyleSheet;
  try {
    if (Sheet && Array.isArray(root.adoptedStyleSheets)) {
      const sheet = new Sheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return;
    }
  } catch { /* fall back to a <style> */ }
  if (!doc) return;
  const style = doc.createElement('style');
  style.textContent = css;
  root.appendChild(style);
}

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
export function button(doc: AppDocument, o: ButtonOptions): AppElement {
  const b = doc.createElement('button');
  b.setAttribute('type', 'button');
  const icon = o.icon ? anyIconElement(doc as unknown as UiDocument, o.icon) : null;
  b.className = `orz-btn${o.variant ? ` orz-btn--${o.variant}` : ''}${o.iconOnly ? ' orz-btn--icon' : ''}${icon ? ' orz-btn--has-icon' : ''}`;
  b.setAttribute('aria-label', o.label);
  if (o.title !== undefined || o.iconOnly) b.title = o.title ?? o.label;
  if (icon) b.append(icon);
  if (!o.iconOnly) {
    const span = doc.createElement('span');
    span.className = 'orz-btn__label';
    span.textContent = o.label;
    b.append(span);
  }
  return b;
}

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
export function menuButton(doc: AppDocument, o: ButtonOptions & { items(): MenuItem[]; heading?: string; align?: 'left' | 'right' }): MenuButton {
  const wrap = doc.createElement('span');
  wrap.className = 'orz-menu-wrap';
  const btn = button(doc, o);
  btn.setAttribute('aria-haspopup', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  wrap.append(btn);
  let menu: AppElement | null = null;
  /** The open submenu (2.3.0): its parent item and its popover (fixed, beside the parent; a sibling of the menu, so the menu's scroll does not clip it). */
  let sub: { parent: AppElement; menu: AppElement } | null = null;
  let subTimer: unknown = null;
  const win = doc.defaultView;
  const clearSubTimer = (): void => { if (subTimer !== null) win?.clearTimeout(subTimer); subTimer = null; };

  const onOutside = (e: AppEvent): void => {
    if (!menu) return;
    const path = e.composedPath?.() ?? [];
    if (!path.includes(wrap)) close();
  };
  function closeSub(): void {
    clearSubTimer();
    if (!sub) return;
    sub.parent.setAttribute('aria-expanded', 'false');
    sub.menu.remove();
    sub = null;
  }
  function close(): void {
    if (!menu) return;
    closeSub();
    menu.remove();
    menu = null;
    btn.setAttribute('aria-expanded', 'false');
    win?.removeEventListener('pointerdown', onOutside, true);
  }
  const enabledIn = (m: AppElement | null): AppElement[] => (m ? Array.from(m.querySelectorAll('.orz-menu__item')).filter((b) => !b.disabled) : []);
  const itemsNow = (): AppElement[] => enabledIn(menu);
  const activeIn = (m: AppElement): unknown => ((m.getRootNode?.() ?? doc) as { activeElement?: unknown }).activeElement;
  /** After a choice: the keyboard keeps its place on the button; a pointer's leaves the focus to the page (2.2.0). */
  const settle = (e: AppEvent): void => { if ((e.detail ?? 0) > 0) btn.blur?.(); else btn.focus(); };

  /** One item's button (a choice, an action, or a submenu's parent). */
  function itemButton(it: MenuItem, inSub: boolean): AppElement {
    const b = doc.createElement('button');
    b.setAttribute('type', 'button');
    b.className = 'orz-menu__item';
    b.setAttribute('role', it.checked === undefined ? 'menuitem' : 'menuitemradio');
    if (it.checked !== undefined) {
      b.setAttribute('aria-checked', String(it.checked));
      const c = doc.createElement('span');
      c.className = 'orz-menu__check';
      if (it.checked) c.append(iconElement(doc as unknown as UiDocument, 'check'));
      b.append(c);
    }
    if (it.disabled) b.disabled = true;
    if (it.swatch) {
      const sw = doc.createElement('span');
      sw.className = 'orz-menu__swatch';
      sw.style.setProperty('background', it.swatch);
      b.append(sw);
    }
    const l = doc.createElement('span');
    l.className = 'orz-menu__label-text';
    l.textContent = it.label;
    b.append(l);
    const items = !inSub && typeof it.items === 'function' ? it.items.bind(it) : null;
    if (items) {
      b.setAttribute('aria-haspopup', 'menu');
      b.setAttribute('aria-expanded', 'false');
      const ch = doc.createElement('span');
      ch.className = 'orz-menu__chevron';
      ch.setAttribute('aria-hidden', 'true');
      ch.textContent = '›';
      b.append(ch);
      b.addEventListener('click', (e) => {
        if (sub?.parent === b) { if ((e.detail ?? 0) > 0) return; closeSub(); b.focus(); return; }
        openSub(b, it.label, items, true);
      });
      b.addEventListener('pointerenter', (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        if (sub?.parent === b) { clearSubTimer(); return; }
        clearSubTimer();
        subTimer = win ? win.setTimeout(() => { subTimer = null; if (menu) openSub(b, it.label, items, false); }, 120) : null;
      });
      return b;
    }
    if (!inSub) {
      b.addEventListener('pointerenter', (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return;
        if (sub) { clearSubTimer(); subTimer = win ? win.setTimeout(() => { subTimer = null; closeSub(); }, 240) : null; }
      });
    }
    b.addEventListener('click', (e) => {
      close();
      settle(e);
      it.run();
    });
    return b;
  }

  /** Fill a menu popover with items (separators before those that ask for one). */
  function fill(m: AppElement, list: MenuItem[], inSub: boolean): void {
    for (const it of list) {
      if (it.separator) {
        const sep = doc.createElement('div');
        sep.className = 'orz-menu__sep';
        sep.setAttribute('role', 'separator');
        m.append(sep);
      }
      m.append(itemButton(it, inSub));
    }
  }

  /** The arrow keys, Home and End over a popover's items; Escape and Tab as `onEscape` / close say. */
  function keys(m: AppElement, onEscape: () => void, extra?: (e: AppEvent, at: AppElement | null) => boolean): void {
    m.addEventListener('keydown', (e) => {
      const list = enabledIn(m);
      const a = activeIn(m) as AppElement | null;
      if (extra?.(e, a)) return;
      const at = list.indexOf(a as AppElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation?.(); onEscape(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); list[(at + 1) % list.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus(); }
      else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus(); }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus(); }
      else if (e.key === 'Tab') close();
    });
  }

  function openSub(parent: AppElement, label: string, items: () => MenuItem[], focus: boolean): void {
    clearSubTimer();
    if (sub?.parent === parent) { if (focus) focusFirst(sub.menu); return; }
    closeSub();
    const m = doc.createElement('div');
    m.className = 'orz-menu orz-menu--sub';
    m.setAttribute('role', 'menu');
    m.setAttribute('aria-label', label);
    fill(m, items(), true);
    keys(m, () => { const p = parent; closeSub(); p.focus(); }, (e) => {
      if (e.key !== 'ArrowLeft') return false;
      e.preventDefault();
      const p = parent;
      closeSub();
      p.focus();
      return true;
    });
    m.addEventListener('pointerenter', () => clearSubTimer());
    wrap.append(m);
    sub = { parent, menu: m };
    parent.setAttribute('aria-expanded', 'true');
    place(parent, m);
    if (focus) focusFirst(m);
  }
  const focusFirst = (m: AppElement): void => {
    const list = enabledIn(m);
    (list.find((b) => b.getAttribute('aria-checked') === 'true') ?? list[0])?.focus();
  };
  /** Beside the parent item (right, else left), its top on the item's, kept on screen. */
  function place(parent: AppElement, m: AppElement): void {
    const r = parent.getBoundingClientRect?.();
    const vh = win?.innerHeight;
    const vw = win?.innerWidth;
    if (!r || typeof vh !== 'number' || typeof vw !== 'number' || (r.width === 0 && r.height === 0)) return;
    const box = m.getBoundingClientRect?.();
    const h = Math.min(box?.height ?? 0, vh - 16);
    const w = box?.width ?? 0;
    const top = Math.max(8, Math.min(r.top - 4, vh - 8 - h));
    const left = r.right + 4 + w <= vw - 8 ? r.right + 4 : Math.max(8, r.left - 4 - w);
    m.style.setProperty('top', `${Math.round(top)}px`);
    m.style.setProperty('left', `${Math.round(left)}px`);
  }

  function open(): void {
    if (menu) return;
    const m = doc.createElement('div');
    menu = m;
    m.className = 'orz-menu';
    m.setAttribute('role', 'menu');
    m.setAttribute('aria-label', o.label);
    if (o.align === 'left') m.setAttribute('data-align', 'left');
    if (o.heading) {
      const h = doc.createElement('div');
      h.className = 'orz-menu__label';
      h.textContent = o.heading;
      m.append(h);
    }
    fill(m, o.items(), false);
    keys(m, () => { close(); btn.focus(); }, (e, a) => {
      // ArrowRight opens a submenu on its first (or checked) item
      if (e.key !== 'ArrowRight' || !a || a.getAttribute('aria-haspopup') !== 'menu') return false;
      e.preventDefault();
      a.click?.();
      return true;
    });
    wrap.append(m);
    btn.setAttribute('aria-expanded', 'true');
    win?.addEventListener('pointerdown', onOutside, true);
    const list = itemsNow();
    (list.find((b) => b.getAttribute('aria-checked') === 'true') ?? list[0])?.focus();
  }
  btn.addEventListener('click', () => (menu ? close() : open()));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && !menu) { e.preventDefault(); open(); }
  });
  return { element: wrap, button: btn, open, close, isOpen: () => menu !== null, destroy() { close(); wrap.remove(); } };
}

/** The choices a setting offers for a text (2.3.0: `choicesFor(text)` when it has one, else `choices`). */
export function settingChoices(control: SettingControl, text: string): ReadonlyArray<SettingChoice> {
  if (typeof control.choicesFor === 'function') {
    try { return control.choicesFor(text) ?? []; } catch { return []; }
  }
  return control.choices;
}

/** The last text each `hidden(text)` was asked about, and its answer (2.3.0, A.29). */
const hiddenMemo = new WeakMap<object, { fn: (text: string) => boolean; text: string; hidden: boolean }>();

/**
 * `owner.hidden(text)`, asked at most once per text (2.3.0, A.29): the answer
 * for the last text asked is kept per owner (a setting or an action), so a
 * menu opened again, a sync after a pause and the bar's follower do not run a
 * costly `hidden` again on the same text. A throwing one is hidden. `hidden`
 * is a function of the text (FC-19 §8: `hidden(text)`).
 */
export function hiddenFor(owner: { hidden?(text: string): boolean }, text: string): boolean {
  const fn = owner.hidden;
  if (typeof fn !== 'function') return false;
  const m = hiddenMemo.get(owner);
  if (m && m.fn === fn && m.text === text) return m.hidden;
  let hidden: boolean;
  try { hidden = !!fn.call(owner, text); } catch { hidden = true; }
  hiddenMemo.set(owner, { fn, text, hidden });
  return hidden;
}

/** Whether a setting is offered for a text (2.3.0: not when its `hidden(text)` says so; a throwing one is hidden; asked once per text, A.29). */
export function settingOffered(control: SettingControl, text: string): boolean {
  return !hiddenFor(control, text);
}

/** The header changes of choosing `value` (2.3.0: the setting's `apply(text, value)`, else `{ [key]: value }`). */
export function settingChanges(control: SettingControl, text: string, value: string): Readonly<Record<string, HeaderChange>> {
  return typeof control.apply === 'function' ? control.apply(text, value) : { [control.key]: value };
}

/** The radio items of a setting for a text: checked by the choice's own `checked`, else by `current(text)`. */
function settingItems(control: SettingControl, getText: () => string, choose: (value: string) => void, readOnly?: () => boolean): MenuItem[] {
  const text = getText();
  const locked = readOnly?.() === true; // a read-only editor shows its settings, but none can be chosen (2.4.0, E.43)
  let now: string | null = null;
  const current = (): string => (now ??= control.current(text));
  return settingChoices(control, text).map((c) => {
    const toggle = typeof c.checked === 'boolean';
    return {
      label: c.label,
      checked: toggle ? c.checked! : c.value === current(),
      ...(c.swatch ? { swatch: c.swatch } : {}),
      ...(c.separator ? { separator: true } : {}),
      ...(locked ? { disabled: true } : {}),
      // a toggle is applied either way (its apply turns it off); a radio choice writes only a change
      run: () => { if (readOnly?.() === true) return; if (toggle || c.value !== control.current(getText())) choose(c.value); },
    };
  });
}

/**
 * A picker for one header setting: choosing calls `apply(key, value)` (the
 * caller writes the header; with the setting's own `apply` (2.3.0) it writes
 * `settingChanges(control, text, value)` — `attachSettings` does). Its items
 * are `choicesFor(text)` when the setting has it (read at each opening).
 */
export function settingPicker(doc: AppDocument, control: SettingControl, getText: () => string, apply: (key: string, value: string) => void, o: { iconOnly?: boolean; readOnly?: () => boolean } = {}): MenuButton {
  return menuButton(doc, {
    label: control.label,
    ...(control.icon ? { icon: control.icon } : {}),
    iconOnly: o.iconOnly ?? false,
    heading: control.label,
    items: () => settingItems(control, getText, (value) => apply(control.key, value), o.readOnly),
  });
}

/** The toolbar slot of an editor shell (null with `chrome: 'none'`). */
const toolbarOf = (shell: EditorShell): AppElement | null => shell.toolbar as unknown as AppElement | null;
const rootOf = (shell: EditorShell): AppShadowRoot => shell.root as unknown as AppShadowRoot;

/**
 * The header settings in an editor's toolbar: each picker writes the header
 * through `shell.setHeader` (one undoable edit, FC-18 §9); a refused change
 * is a toast and changes nothing. While the editor is read-only the pickers
 * show the current values with every choice disabled (E.43). A kind's `mountEditor` calls it, so app
 * hosts get the same tools (FC-19 §1).
 */
export function attachSettings(shell: EditorShell, settings: readonly SettingControl[], o: { iconOnly?: boolean } = {}): { readonly pickers: readonly MenuButton[]; destroy(): void } {
  const toolbar = toolbarOf(shell);
  const pickers: MenuButton[] = [];
  let off: (() => void) | null = null;
  let timer: unknown = null;
  const win = toolbar?.ownerDocument?.defaultView ?? null;
  if (toolbar) {
    const root = rootOf(shell);
    installCss(root, WIDGET_CSS);
    const conditional: Array<[SettingControl, MenuButton]> = [];
    for (const control of settings) {
      // the picker writes the setting's changes (2.3.0: its own `apply`, a block value included) as one undoable edit
      const picker = settingPicker(toolbar.ownerDocument, control, () => shell.getText(), (_key, value) => {
        if (shell.readOnly) return; // read-only (asked for, a newer format, an update running): the header never changes (E.43)
        try { shell.setHeader({ ...settingChanges(control, shell.getText(), value) }); } catch (e) {
          showToast(shell.root, `Could not change the header: ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
        }
      }, { ...o, readOnly: () => shell.readOnly });
      pickers.push(picker);
      toolbar.append(picker.element);
      if (typeof control.hidden === 'function') conditional.push([control, picker]);
    }
    // 2.3.0: a setting with `hidden(text)` follows the text (after a pause in typing)
    if (conditional.length > 0) {
      const sync = (): void => {
        timer = null;
        const text = shell.getText();
        for (const [control, picker] of conditional) {
          const show = settingOffered(control, text);
          if (!show) picker.close();
          picker.element.hidden = !show;
        }
      };
      sync();
      off = shell.on('change', () => {
        if (timer !== null) win?.clearTimeout(timer);
        timer = win ? win.setTimeout(sync, 250) : null;
        if (!win) sync();
      });
    }
  }
  return {
    pickers,
    destroy() {
      off?.();
      off = null;
      if (timer !== null) win?.clearTimeout(timer);
      timer = null;
      for (const p of pickers.splice(0)) p.destroy();
    },
  };
}

/** An AI operation as hosts offer it (`orz-host-ai@1`, FC-19 `hooks.ai.operations`). */
export interface AiOp { id: string; title: string; selection?: boolean }

/**
 * The review panel of an AI proposal (host-protocols §4: the document is
 * untouched until the reader applies it): a non-modal `role="dialog"` with
 * the proposal in an editable text box, Apply (Replace selection / Replace
 * document) and Cancel; Esc cancels. Resolves the text to apply, or null.
 */
export function reviewProposal(root: AppShadowRoot | ShadowRootLike, proposal: AiProposal, o: { title: string }): Promise<string | null> {
  const r = root as AppShadowRoot;
  const doc = r.ownerDocument;
  installCss(r, WIDGET_CSS);
  return new Promise((resolve) => {
    const panel = doc.createElement('section');
    panel.className = 'orz-review';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', `${o.title}: review the proposal`);
    const h = doc.createElement('p');
    h.className = 'orz-review__title';
    h.textContent = proposal.passage ? `${o.title} — replacement for the selection` : `${o.title} — proposed document`;
    const note = doc.createElement('p');
    note.className = 'orz-review__note';
    note.textContent = 'Nothing changes until you apply it. You can edit the proposal first.';
    const ta = doc.createElement('textarea') as AppElement & { value: string };
    ta.value = proposal.proposed;
    ta.setAttribute('aria-label', 'Proposed text');
    const row = doc.createElement('div');
    row.className = 'orz-review__actions';
    const cancel = button(doc, { label: 'Cancel', variant: 'ghost' });
    const apply = button(doc, { label: proposal.passage ? 'Replace selection' : 'Replace document', variant: 'primary' });
    row.append(cancel, apply);
    panel.append(h, note, ta, row);
    const done = (v: string | null): void => { panel.remove(); resolve(v); };
    cancel.addEventListener('click', () => done(null));
    apply.addEventListener('click', () => done(ta.value));
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation?.(); done(null); } });
    r.append(panel);
    ta.focus();
  });
}

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
export function attachAiMenu(shell: EditorShell, o: { operations(): readonly AiOp[]; label?: string; iconOnly?: boolean }): AiMenu {
  const toolbar = toolbarOf(shell);
  const root = rootOf(shell);
  let menu: MenuButton | null = null;
  let busy = false;
  let gone = false;
  const ops = (): AiOp[] => { try { return (o.operations() ?? []).filter((x) => x && typeof x.id === 'string' && typeof x.title === 'string'); } catch { return []; } };
  const toast = (msg: string, tone: 'warning' | 'error'): void => { if (!gone) showToast(shell.root, msg, { tone }); };
  const run = async (op: AiOp): Promise<void> => {
    if (busy || gone || !menu) return;
    busy = true;
    const b = menu.button;
    b.disabled = true;
    b.setAttribute('aria-busy', 'true');
    try {
      const r = await shell.proposeAi(op.id, op.selection ? { selection: true } : {});
      if (gone) return;
      if (!r.ok) {
        toast(r.error === 'no selection' ? `${op.title}: select a passage first.` : `${op.title} did not run: ${r.error}.`, 'warning');
        return;
      }
      const text = await reviewProposal(root, r.proposal, { title: op.title });
      if (text === null || gone) return;
      const a = shell.applyAi(r.proposal, { proposed: text });
      if (!a.ok) toast(`${op.title} was not applied: ${a.error}.`, 'warning');
    } finally {
      busy = false;
      if (!gone) { b.disabled = false; b.removeAttribute('aria-busy'); }
    }
  };
  const refresh = (): void => {
    if (gone || !toolbar) return;
    if (ops().length === 0) { menu?.destroy(); menu = null; return; }
    if (menu) return;
    installCss(root, WIDGET_CSS);
    menu = menuButton(toolbar.ownerDocument, {
      label: o.label ?? 'AI',
      icon: 'info',
      ...(o.iconOnly ? { iconOnly: true } : {}),
      heading: o.label ?? 'AI',
      items: () => ops().map((op) => ({ label: op.title, run: () => { void run(op); } })),
    });
    menu.element.setAttribute('data-orz-ai-menu', '');
    toolbar.append(menu.element);
  };
  refresh();
  return { refresh, destroy() { gone = true; menu?.destroy(); menu = null; } };
}

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
export function followPresentation(shell: EditorShell, present: (text: string) => PreviewPresentation, o: { delayMs?: number; window?: { setTimeout(f: () => void, ms?: number): unknown; clearTimeout(id: unknown): void } } = {}): () => void {
  const win = o.window ?? (toolbarOf(shell)?.ownerDocument?.defaultView ?? (globalThis as unknown as { setTimeout(f: () => void, ms?: number): unknown; clearTimeout(id: unknown): void }));
  const key = (p: PreviewPresentation): string => JSON.stringify([p.head ?? null, p.scheme ?? null, p.articleClass ?? null]);
  let last = key(present(shell.getText()));
  let timer: unknown = null;
  const apply = (): void => {
    timer = null;
    const p = present(shell.getText());
    const k = key(p);
    if (k === last) return;
    last = k;
    shell.preview.setOptions(p);
  };
  const off = shell.on('change', () => {
    if (timer !== null) win.clearTimeout(timer);
    timer = win.setTimeout(apply, o.delayMs ?? 200);
  });
  return () => { off(); if (timer !== null) win.clearTimeout(timer); timer = null; };
}
