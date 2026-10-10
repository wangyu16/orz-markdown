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
import { anyIconElement, iconElement, type IconName, type KindIcon } from '../shell/chrome.js';
import type { UiDocument } from '../shell/types.js';
import type { AppDocument, AppElement, AppEvent, AppWindow } from './types.js';

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
export type HandleEntry =
  | (EntryBase & { type: 'item'; icon?: IconName | KindIcon; hint?: string; dot?: boolean; disabled?: boolean; run(): void })
  | (EntryBase & { type: 'submenu'; icon?: IconName | KindIcon; dot?: boolean; disabled?: boolean; items(): HandleSubItem[] })
  | (EntryBase & { type: 'row'; buttons(): HandleRowButton[] });

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
  open(o?: { focus?: 'first' | 'last' }): void;
  close(): void;
  isOpen(): boolean;
  /** Draw an open list again (its entries changed); the focus keeps its item. */
  refresh(): void;
  /** Marks on the pencil (unsaved changes, an update) and its accessible description. */
  setMarks(marks: { dirty?: boolean; update?: boolean; description?: string }): void;
  destroy(): void;
}

/** The handle's CSS (installed next to `CHROME_CSS` in the chrome's shadow root). */
export const HANDLE_CSS = `
.orz-handle { position: relative; display: inline-block; }
.orz-handle__pencil {
  position: relative; display: inline-flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; padding: 0; border: 1px solid var(--orz-chrome-border); border-radius: 50%;
  background: var(--orz-chrome-surface); color: var(--orz-chrome-accent); cursor: pointer;
  box-shadow: var(--orz-chrome-shadow); opacity: .6;
  transition: opacity var(--orz-chrome-fast) var(--orz-chrome-ease), background var(--orz-chrome-fast) var(--orz-chrome-ease);
}
.orz-handle__pencil .orz-icon { width: 18px; height: 18px; }
.orz-handle:hover .orz-handle__pencil, .orz-handle__pencil:focus-visible, .orz-handle__pencil[aria-expanded="true"] { opacity: 1; }
.orz-handle__pencil:hover { background: var(--orz-chrome-hover); }
.orz-handle__pencil[data-dirty="true"], .orz-handle__pencil[data-update="true"] { opacity: .85; }
.orz-handle__pencil[data-dirty="true"]::after, .orz-handle__pencil[data-update="true"]::before {
  content: ""; position: absolute; width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 0 2px var(--orz-chrome-surface);
}
.orz-handle__pencil[data-dirty="true"]::after { top: 1px; right: 1px; background: var(--orz-chrome-accent); }
.orz-handle__pencil[data-update="true"]::before { bottom: 1px; right: 1px; background: var(--orz-chrome-success); }
.orz-handle__list {
  position: absolute; left: 0; bottom: calc(100% + 8px); z-index: var(--orz-chrome-z);
  min-width: 232px; max-width: min(300px, calc(100vw - 24px)); max-height: calc(100vh - 88px); max-height: calc(100dvh - 88px); overflow-y: auto;
  padding: var(--orz-chrome-space-2); border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-m);
  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);
  animation: orz-handle-in var(--orz-chrome-slow) var(--orz-chrome-ease) both;
}
@keyframes orz-handle-in { from { opacity: 0; } to { opacity: 1; } }
.orz-handle__item {
  display: flex; align-items: center; gap: var(--orz-chrome-space-3); width: 100%; min-height: 32px;
  padding: 0 var(--orz-chrome-space-3); border: 0; border-radius: var(--orz-chrome-radius-s);
  background: transparent; color: inherit; font: inherit; text-align: left; text-decoration: none; cursor: pointer; white-space: nowrap;
}
.orz-handle__item:hover, .orz-handle__item:focus-visible, .orz-handle__item[aria-expanded="true"] { background: var(--orz-chrome-hover); }
.orz-handle__item:disabled { opacity: .5; cursor: default; background: transparent; }
.orz-handle__item > .orz-icon { color: var(--orz-chrome-muted); }
.orz-handle__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
/* an item without an icon (a kind's action, setting or reader control) keeps its label in the labels' column (A.31) */
.orz-handle__list > .orz-handle__item > .orz-handle__label:first-child { margin-left: calc(16px + var(--orz-chrome-space-3)); }
.orz-handle__hint { color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-xs); letter-spacing: .02em; }
.orz-handle__chevron { color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-sm); }
.orz-handle__dot { width: 7px; height: 7px; border-radius: 50%; background: var(--orz-chrome-accent); flex: none; }
.orz-handle__dot--update { background: var(--orz-chrome-success); }
.orz-handle__check { width: 16px; display: inline-flex; color: var(--orz-chrome-accent); }
.orz-handle__swatch { width: 12px; height: 12px; border-radius: 50%; border: 1px solid var(--orz-chrome-border); flex: none; }
.orz-handle__sep { height: 1px; margin: var(--orz-chrome-space-2) var(--orz-chrome-space-2); background: var(--orz-chrome-border); }
.orz-handle__row { display: flex; align-items: center; gap: var(--orz-chrome-space-1); min-height: 34px; padding: 0 var(--orz-chrome-space-1) 0 var(--orz-chrome-space-3); }
.orz-handle__row-label { flex: 1; color: var(--orz-chrome-muted); font-size: var(--orz-chrome-text-sm); }
.orz-handle__row .orz-handle__item { width: auto; min-width: 34px; min-height: 28px; justify-content: center; padding: 0 var(--orz-chrome-space-2); font-variant-numeric: tabular-nums; }
.orz-handle__row .orz-handle__item[data-orz-reset] { min-width: 52px; color: var(--orz-chrome-muted); }
.orz-handle__sub {
  position: fixed; z-index: var(--orz-chrome-z); min-width: 196px; max-width: min(280px, calc(100vw - 16px)); overflow-y: auto;
  padding: var(--orz-chrome-space-2); border: 1px solid var(--orz-chrome-border); border-radius: var(--orz-chrome-radius-m);
  background: var(--orz-chrome-surface); color: var(--orz-chrome-fg); box-shadow: var(--orz-chrome-shadow);
  animation: orz-handle-in var(--orz-chrome-fast) var(--orz-chrome-ease) both;
}
`;

const OPEN_DELAY = 140;
const CLOSE_DELAY = 360;
const SUB_DELAY = 120;

let handles = 0;

/** Mount the handle (the caller appends `element` to its shadow root and places it). */
export function mountHandle(doc: AppDocument, o: HandleOptions): Handle {
  const win = doc.defaultView as AppWindow | null;
  const n = ++handles;
  const wrap = doc.createElement('div');
  wrap.className = 'orz-handle';
  const pencil = doc.createElement('button');
  pencil.setAttribute('type', 'button');
  pencil.className = 'orz-handle__pencil';
  pencil.setAttribute('aria-label', o.label);
  pencil.setAttribute('aria-haspopup', 'menu');
  pencil.setAttribute('aria-expanded', 'false');
  pencil.setAttribute('aria-controls', `orz-handle-list-${n}`);
  pencil.title = o.label;
  pencil.append(iconElement(doc as unknown as UiDocument, 'edit'));
  const desc = doc.createElement('span');
  desc.className = 'orz-visually-hidden';
  desc.id = `orz-handle-desc-${n}`;
  const list = doc.createElement('div');
  list.className = 'orz-handle__list';
  list.id = `orz-handle-list-${n}`;
  list.setAttribute('role', 'menu');
  list.setAttribute('aria-label', o.label);
  list.hidden = true;
  wrap.append(list, pencil, desc);

  const timers = { open: null as unknown, close: null as unknown, sub: null as unknown };
  const later = (key: keyof typeof timers, fn: () => void, ms: number): void => {
    clear(key);
    timers[key] = win ? win.setTimeout(() => { timers[key] = null; fn(); }, ms) : null;
  };
  function clear(key: keyof typeof timers): void {
    if (timers[key] !== null && win) win.clearTimeout(timers[key]);
    timers[key] = null;
  }

  let open = false;
  /** How the list was opened: a hover closes it when the pointer leaves; the keyboard and a tap do not. */
  let openedBy: 'hover' | 'keyboard' | 'tap' | 'api' = 'api';
  let lastPointer = 'mouse';
  let spaceDown = false;
  let destroyed = false;
  let sub: { parent: AppElement; menu: AppElement } | null = null;

  const rootOf = (): { activeElement?: unknown } => (wrap.getRootNode?.() ?? doc) as { activeElement?: unknown };
  const active = (): AppElement | null => (rootOf().activeElement as AppElement | null) ?? null;
  const enabled = (els: ArrayLike<AppElement>): AppElement[] => Array.from(els).filter((b) => !b.disabled);
  const mainItems = (): AppElement[] => enabled(list.querySelectorAll('.orz-handle__list > .orz-handle__item, .orz-handle__list > .orz-handle__row > .orz-handle__item'));
  const subItems = (): AppElement[] => (sub ? enabled(sub.menu.querySelectorAll('.orz-handle__item')) : []);
  const pointerChose = (e: AppEvent): boolean => (e.detail ?? 0) > 0;

  // ── building ──
  const separator = (): AppElement => {
    const s = doc.createElement('div');
    s.className = 'orz-handle__sep';
    s.setAttribute('role', 'separator');
    return s;
  };
  const span = (cls: string, text?: string): AppElement => {
    const s = doc.createElement('span');
    s.className = cls;
    if (text !== undefined) s.textContent = text;
    return s;
  };
  const itemButton = (id: string, role = 'menuitem'): AppElement => {
    const b = doc.createElement('button');
    b.setAttribute('type', 'button');
    b.className = 'orz-handle__item';
    b.setAttribute('role', role);
    b.setAttribute('data-orz-item', id);
    b.tabIndex = -1;
    return b;
  };
  /** After a choice: the keyboard's focus goes back to the pencil, a pointer's to the page (a read view's keys work at once). */
  const settle = (byPointer: boolean): void => {
    if (byPointer) { const a = active(); if (a && wrap.contains(a)) a.blur?.(); } else pencil.focus();
  };

  function build(): void {
    closeSub();
    list.replaceChildren();
    let first = true;
    for (const e of o.entries()) {
      if (e.separator && !first) list.append(separator());
      first = false;
      if (e.type === 'row') {
        const row = doc.createElement('div');
        row.className = 'orz-handle__row';
        row.setAttribute('role', 'group');
        row.setAttribute('data-orz-row', e.id);
        const lid = `orz-handle-${n}-${e.id}`;
        const l = span('orz-handle__row-label', e.label);
        l.id = lid;
        row.setAttribute('aria-labelledby', lid);
        row.append(l);
        fillRow(row, e);
        list.append(row);
        continue;
      }
      const b = itemButton(e.id);
      const icon = e.icon ? anyIconElement(doc as unknown as UiDocument, e.icon) : null;
      if (icon) b.append(icon);
      b.append(span('orz-handle__label', e.label));
      if (e.dot) b.append(span(`orz-handle__dot${e.type === 'submenu' ? ' orz-handle__dot--update' : ''}`));
      if (e.disabled) b.disabled = true;
      if (e.type === 'item') {
        if (e.hint) { const h = span('orz-handle__hint', e.hint); h.setAttribute('aria-hidden', 'true'); b.append(h); }
        b.addEventListener('click', (ev) => {
          close();
          settle(pointerChose(ev));
          e.run();
        });
      } else {
        b.setAttribute('aria-haspopup', 'menu');
        b.setAttribute('aria-expanded', 'false');
        const c = span('orz-handle__chevron', '›');
        c.setAttribute('aria-hidden', 'true');
        b.append(c);
        b.addEventListener('click', (ev) => {
          if (sub?.parent === b) { if (pointerChose(ev)) return; closeSub(); b.focus(); return; }
          openSub(b, e, !pointerChose(ev));
        });
        b.addEventListener('pointerenter', (ev) => {
          if (ev.pointerType && ev.pointerType !== 'mouse') return;
          if (sub?.parent === b) { clear('sub'); return; }
          later('sub', () => openSub(b, e, false), SUB_DELAY);
        });
      }
      if (e.type === 'item') {
        b.addEventListener('pointerenter', (ev) => {
          if (ev.pointerType && ev.pointerType !== 'mouse') return;
          if (sub) later('sub', () => closeSub(), SUB_DELAY * 2);
        });
      }
      list.append(b);
    }
  }

  function fillRow(row: AppElement, e: Extract<HandleEntry, { type: 'row' }>): void {
    for (const old of Array.from(row.querySelectorAll('.orz-handle__item'))) old.remove();
    e.buttons().forEach((rb, i) => {
      const b = itemButton(`${e.id}:${i}`);
      b.textContent = rb.text;
      b.setAttribute('aria-label', rb.label);
      b.title = rb.label;
      if (rb.text.endsWith('%')) b.setAttribute('data-orz-reset', '');
      if (rb.disabled) b.disabled = true;
      b.addEventListener('click', () => {
        const at = `${e.id}:${i}`;
        rb.run();
        fillRow(row, e);
        // the focus stays on the button pressed (or its row's reset, when it is now disabled)
        const again = row.querySelector(`[data-orz-item="${at}"]`) as AppElement | null;
        const target = again && !again.disabled ? again : (row.querySelector('[data-orz-reset]') as AppElement | null);
        if (wrap.contains(active())) target?.focus();
      });
      b.addEventListener('pointerenter', (ev) => {
        if (ev.pointerType && ev.pointerType !== 'mouse') return;
        if (sub) later('sub', () => closeSub(), SUB_DELAY * 2);
      });
      row.append(b);
    });
  }

  function openSub(parent: AppElement, e: Extract<HandleEntry, { type: 'submenu' }>, focus: boolean): void {
    clear('sub');
    if (sub?.parent === parent) { if (focus) focusSub(); return; }
    closeSub();
    const m = doc.createElement('div');
    m.className = 'orz-handle__sub';
    m.setAttribute('role', 'menu');
    m.setAttribute('aria-label', e.label);
    for (const [i, it] of e.items().entries()) {
      if (it.separator && i > 0) m.append(separator());
      const role = it.checked === undefined ? 'menuitem' : 'menuitemradio';
      let b: AppElement;
      if (it.href) {
        b = doc.createElement('a');
        b.className = 'orz-handle__item';
        b.setAttribute('role', 'menuitem');
        b.setAttribute('href', it.href);
        b.setAttribute('target', '_blank');
        b.setAttribute('rel', 'noopener noreferrer');
        b.tabIndex = -1;
        b.setAttribute('data-orz-item', `${e.id}:${i}`);
      } else b = itemButton(`${e.id}:${i}`, role);
      if (it.checked !== undefined) {
        b.setAttribute('aria-checked', String(it.checked));
        const c = span('orz-handle__check');
        if (it.checked) c.append(iconElement(doc as unknown as UiDocument, 'check'));
        b.append(c);
      }
      if (it.swatch) {
        const s = span('orz-handle__swatch');
        s.style.setProperty('background', it.swatch);
        b.append(s);
      }
      b.append(span('orz-handle__label', it.label));
      if (it.disabled) b.disabled = true;
      b.addEventListener('click', (ev) => {
        const byPointer = pointerChose(ev);
        close();
        settle(byPointer);
        it.run?.();
      });
      m.append(b);
    }
    m.addEventListener('pointerenter', () => clear('sub'));
    // inside the wrapper (leaving the list for the submenu is not leaving the handle); fixed, so the list's scroll does not clip it
    parent.after?.(m);
    sub = { parent, menu: m };
    parent.setAttribute('aria-expanded', 'true');
    placeSub(parent, m);
    if (focus) focusSub();
  }
  function focusSub(): void {
    const items = subItems();
    (items.find((b) => b.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
  }
  function placeSub(parent: AppElement, m: AppElement): void {
    const r = parent.getBoundingClientRect?.();
    const vh = win?.innerHeight;
    const vw = win?.innerWidth;
    if (!r || typeof vh !== 'number' || typeof vw !== 'number' || (r.width === 0 && r.height === 0)) return;
    const h = m.getBoundingClientRect?.().height ?? 0;
    const room = vh - 16;
    m.style.setProperty('max-height', `${Math.max(120, room)}px`);
    // beside the parent item, its bottom on the item's bottom (the handle sits at the bottom of the page), kept on screen
    const top = Math.max(8, Math.min(r.bottom + 4 - Math.min(h, room), vh - 8 - Math.min(h, room)));
    const width = m.getBoundingClientRect?.().width ?? 0;
    const left = r.right + 4 + width <= vw - 8 ? r.right + 4 : Math.max(8, r.left - 4 - width);
    m.style.setProperty('top', `${Math.round(top)}px`);
    m.style.setProperty('left', `${Math.round(left)}px`);
  }
  function closeSub(): void {
    clear('sub');
    if (!sub) return;
    sub.parent.setAttribute('aria-expanded', 'false');
    sub.menu.remove();
    sub = null;
  }

  // ── opening and closing ──
  const onOutside = (e: AppEvent): void => {
    const path = e.composedPath?.() ?? [];
    if (!path.includes(wrap)) close();
  };
  function openList(by: typeof openedBy, focus?: 'first' | 'last'): void {
    clear('open');
    clear('close');
    if (!open) {
      open = true;
      openedBy = by;
      build();
      list.hidden = false;
      pencil.setAttribute('aria-expanded', 'true');
      win?.addEventListener('pointerdown', onOutside, true);
    } else if (by !== 'hover') openedBy = by;
    if (focus) {
      const items = mainItems();
      (focus === 'first' ? items[0] : items[items.length - 1])?.focus();
    }
  }
  function close(): void {
    clear('open');
    clear('close');
    if (!open) return;
    open = false;
    closeSub();
    list.hidden = true;
    list.replaceChildren();
    pencil.setAttribute('aria-expanded', 'false');
    win?.removeEventListener('pointerdown', onOutside, true);
  }
  function refresh(): void {
    if (!open) return;
    const a = active();
    const id = a && list.contains(a) && !(sub && sub.menu.contains(a)) ? a.getAttribute('data-orz-item') : null;
    build();
    if (id) (list.querySelector(`[data-orz-item="${id}"]`) as AppElement | null)?.focus();
  }

  // ── the pencil ──
  pencil.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || 'mouse'; spaceDown = false; });
  pencil.addEventListener('click', (e) => {
    if (spaceDown) return; // Space opens the list (keydown); its keyup's click is not Edit
    if (pointerChose(e) && lastPointer !== 'mouse') {
      // touch / pen: there is no hover — a tap opens the list (its first item is Edit), a second tap closes it
      if (open) close(); else openList('tap');
      return;
    }
    close();
    o.activate();
  });
  pencil.addEventListener('keydown', (e) => {
    const k = String(e.key ?? '');
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      e.preventDefault();
      openList('keyboard', k === 'ArrowDown' ? 'first' : 'last');
    } else if (k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      spaceDown = true;
      openList('keyboard', 'first');
    } else if (k === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation?.();
      close();
    }
  });
  // Space's keyup lands where the focus went (the list's first item): listen on the whole handle
  wrap.addEventListener('keyup', (e) => {
    if ((e.key === ' ' || e.key === 'Spacebar') && spaceDown) {
      e.preventDefault();
      if (win) win.setTimeout(() => { spaceDown = false; }, 0); else spaceDown = false;
    }
  });

  // ── hover: a short delay to open, a grace period to leave (the list and its submenu are inside the wrapper) ──
  wrap.addEventListener('pointerenter', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    clear('close');
    if (!open) later('open', () => openList('hover'), o.openDelayMs ?? OPEN_DELAY);
  });
  wrap.addEventListener('pointerleave', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    clear('open');
    if (open && openedBy === 'hover') later('close', () => { if (openedBy === 'hover') close(); }, o.closeDelayMs ?? CLOSE_DELAY);
  });
  // the focus leaving the handle (Tab, a click elsewhere) closes a list the keyboard opened
  wrap.addEventListener('focusout', (e) => {
    const to = e.relatedTarget as AppElement | null | undefined;
    if (open && openedBy !== 'hover' && to && !wrap.contains(to)) close();
  });

  // ── the menu's keys ──
  list.addEventListener('keydown', (e) => {
    const k = String(e.key ?? '');
    const a = active();
    const inSub = !!(sub && a && sub.menu.contains(a));
    const items = inSub ? subItems() : mainItems();
    const at = a ? items.indexOf(a) : -1;
    const move = (i: number): void => { e.preventDefault(); items[(i + items.length) % items.length]?.focus(); };
    if (k === 'ArrowDown') move(at + 1);
    else if (k === 'ArrowUp') move(at < 0 ? items.length - 1 : at - 1);
    else if (k === 'Home') move(0);
    else if (k === 'End') move(items.length - 1);
    else if (k === 'ArrowRight') {
      if (!inSub && a?.getAttribute('aria-haspopup') === 'menu') { e.preventDefault(); a.click?.(); }
      else if (!inSub && a?.parentElement?.getAttribute('role') === 'group') move(at + 1);
    } else if (k === 'ArrowLeft') {
      if (inSub && sub) { e.preventDefault(); const p = sub.parent; closeSub(); p.focus(); }
      else if (a?.parentElement?.getAttribute('role') === 'group') move(at - 1);
    } else if (k === 'Escape') {
      e.preventDefault();
      e.stopPropagation?.();
      if (inSub && sub) { const p = sub.parent; closeSub(); p.focus(); } else { close(); pencil.focus(); }
    } else if (k === 'Tab') close();
  });

  return {
    element: wrap,
    button: pencil,
    open: (opts = {}) => openList(opts.focus ? 'keyboard' : 'api', opts.focus),
    close,
    isOpen: () => open,
    refresh,
    setMarks(m) {
      if (m.dirty !== undefined) pencil.setAttribute('data-dirty', String(m.dirty));
      if (m.update !== undefined) pencil.setAttribute('data-update', String(m.update));
      if (m.description !== undefined) {
        desc.textContent = m.description;
        if (m.description) pencil.setAttribute('aria-describedby', desc.id); else pencil.removeAttribute('aria-describedby');
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      close();
      wrap.remove();
    },
  };
}
