"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WIDGET_CSS = void 0;
exports.installCss = installCss;
exports.button = button;
exports.menuButton = menuButton;
exports.settingPicker = settingPicker;
exports.attachSettings = attachSettings;
exports.reviewProposal = reviewProposal;
exports.attachAiMenu = attachAiMenu;
exports.followPresentation = followPresentation;
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
const chrome_js_1 = require("../shell/chrome.js");
/** CSS of these widgets (installed next to `CHROME_CSS`, in the shadow root that holds them). */
exports.WIDGET_CSS = `
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
const installed = new WeakMap();
/** Install a stylesheet in a shadow root once (constructed where supported — a strict `style-src` keeps working — else a `<style>`). */
function installCss(root, css) {
    let set = installed.get(root);
    if (set?.has(css))
        return;
    if (!set)
        installed.set(root, (set = new Set()));
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
    }
    catch { /* fall back to a <style> */ }
    if (!doc)
        return;
    const style = doc.createElement('style');
    style.textContent = css;
    root.appendChild(style);
}
/** A chrome button named by its label (`aria-label`), with an optional kit icon. */
function button(doc, o) {
    const b = doc.createElement('button');
    b.setAttribute('type', 'button');
    b.className = `orz-btn${o.variant ? ` orz-btn--${o.variant}` : ''}${o.iconOnly ? ' orz-btn--icon' : ''}`;
    b.setAttribute('aria-label', o.label);
    if (o.title !== undefined || o.iconOnly)
        b.title = o.title ?? o.label;
    if (o.icon)
        b.append((0, chrome_js_1.iconElement)(doc, o.icon));
    if (!o.iconOnly) {
        const span = doc.createElement('span');
        span.className = 'orz-btn__label';
        span.textContent = o.label;
        b.append(span);
    }
    return b;
}
/**
 * A menu button: a chrome button that opens a non-modal popover of items
 * (`role="menu"`), built from `items()` at each opening. Arrow keys, Home and
 * End move; Enter/Space choose; Esc and a pointer-down outside close (Esc
 * returns focus to the button); Tab closes. Never modal.
 */
function menuButton(doc, o) {
    const wrap = doc.createElement('span');
    wrap.className = 'orz-menu-wrap';
    const btn = button(doc, o);
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    wrap.append(btn);
    let menu = null;
    const win = doc.defaultView;
    const onOutside = (e) => {
        if (!menu)
            return;
        const path = e.composedPath?.() ?? [];
        if (!path.includes(wrap))
            close();
    };
    function close() {
        if (!menu)
            return;
        menu.remove();
        menu = null;
        btn.setAttribute('aria-expanded', 'false');
        win?.removeEventListener('pointerdown', onOutside, true);
    }
    const itemsNow = () => (menu ? Array.from(menu.querySelectorAll('.orz-menu__item')).filter((b) => !b.disabled) : []);
    function open() {
        if (menu)
            return;
        const m = doc.createElement('div');
        menu = m;
        m.className = 'orz-menu';
        m.setAttribute('role', 'menu');
        m.setAttribute('aria-label', o.label);
        if (o.align === 'left')
            m.setAttribute('data-align', 'left');
        if (o.heading) {
            const h = doc.createElement('div');
            h.className = 'orz-menu__label';
            h.textContent = o.heading;
            m.append(h);
        }
        for (const it of o.items()) {
            if (it.separator) {
                const sep = doc.createElement('div');
                sep.className = 'orz-menu__sep';
                sep.setAttribute('role', 'separator');
                m.append(sep);
            }
            const b = doc.createElement('button');
            b.setAttribute('type', 'button');
            b.className = 'orz-menu__item';
            b.setAttribute('role', it.checked === undefined ? 'menuitem' : 'menuitemradio');
            if (it.checked !== undefined) {
                b.setAttribute('aria-checked', String(it.checked));
                const c = doc.createElement('span');
                c.className = 'orz-menu__check';
                if (it.checked)
                    c.append((0, chrome_js_1.iconElement)(doc, 'check'));
                b.append(c);
            }
            if (it.disabled)
                b.disabled = true;
            if (it.swatch) {
                const s = doc.createElement('span');
                s.className = 'orz-menu__swatch';
                s.style.setProperty('background', it.swatch);
                b.append(s);
            }
            const l = doc.createElement('span');
            l.textContent = it.label;
            b.append(l);
            b.addEventListener('click', () => {
                close();
                btn.focus();
                it.run();
            });
            m.append(b);
        }
        m.addEventListener('keydown', (e) => {
            const list = itemsNow();
            const root = (m.getRootNode?.() ?? doc);
            const at = list.indexOf(root.activeElement);
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation?.();
                close();
                btn.focus();
            }
            else if (e.key === 'ArrowDown') {
                e.preventDefault();
                list[(at + 1) % list.length]?.focus();
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                list[(at - 1 + list.length) % list.length]?.focus();
            }
            else if (e.key === 'Home') {
                e.preventDefault();
                list[0]?.focus();
            }
            else if (e.key === 'End') {
                e.preventDefault();
                list[list.length - 1]?.focus();
            }
            else if (e.key === 'Tab')
                close();
        });
        wrap.append(m);
        btn.setAttribute('aria-expanded', 'true');
        win?.addEventListener('pointerdown', onOutside, true);
        const list = itemsNow();
        (list.find((b) => b.getAttribute('aria-checked') === 'true') ?? list[0])?.focus();
    }
    btn.addEventListener('click', () => (menu ? close() : open()));
    btn.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' && !menu) {
            e.preventDefault();
            open();
        }
    });
    return { element: wrap, button: btn, open, close, isOpen: () => menu !== null, destroy() { close(); wrap.remove(); } };
}
/** A picker for one header setting: choosing calls `apply(key, value)` (the caller writes the header). */
function settingPicker(doc, control, getText, apply, o = {}) {
    return menuButton(doc, {
        label: control.label,
        ...(control.icon ? { icon: control.icon } : {}),
        iconOnly: o.iconOnly ?? false,
        heading: control.label,
        items: () => {
            const now = control.current(getText());
            return control.choices.map((c) => ({
                label: c.label,
                checked: c.value === now,
                ...(c.swatch ? { swatch: c.swatch } : {}),
                run: () => { if (c.value !== control.current(getText()))
                    apply(control.key, c.value); },
            }));
        },
    });
}
/** The toolbar slot of an editor shell (null with `chrome: 'none'`). */
const toolbarOf = (shell) => shell.toolbar;
const rootOf = (shell) => shell.root;
/**
 * The header settings in an editor's toolbar: each picker writes the header
 * through `shell.setHeader` (one undoable edit, FC-18 §9); a refused change
 * is a toast and changes nothing. A kind's `mountEditor` calls it, so app
 * hosts get the same tools (FC-19 §1).
 */
function attachSettings(shell, settings, o = {}) {
    const toolbar = toolbarOf(shell);
    const pickers = [];
    if (toolbar) {
        const root = rootOf(shell);
        installCss(root, exports.WIDGET_CSS);
        for (const control of settings) {
            const p = settingPicker(toolbar.ownerDocument, control, () => shell.getText(), (key, value) => {
                try {
                    shell.setHeader({ [key]: value });
                }
                catch (e) {
                    (0, chrome_js_1.showToast)(shell.root, `Could not change the header: ${e instanceof Error ? e.message : String(e)}`, { tone: 'error' });
                }
            }, o);
            pickers.push(p);
            toolbar.append(p.element);
        }
    }
    return { pickers, destroy() { for (const p of pickers.splice(0))
            p.destroy(); } };
}
/**
 * The review panel of an AI proposal (host-protocols §4: the document is
 * untouched until the reader applies it): a non-modal `role="dialog"` with
 * the proposal in an editable text box, Apply (Replace selection / Replace
 * document) and Cancel; Esc cancels. Resolves the text to apply, or null.
 */
function reviewProposal(root, proposal, o) {
    const r = root;
    const doc = r.ownerDocument;
    installCss(r, exports.WIDGET_CSS);
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
        const ta = doc.createElement('textarea');
        ta.value = proposal.proposed;
        ta.setAttribute('aria-label', 'Proposed text');
        const row = doc.createElement('div');
        row.className = 'orz-review__actions';
        const cancel = button(doc, { label: 'Cancel', variant: 'ghost' });
        const apply = button(doc, { label: proposal.passage ? 'Replace selection' : 'Replace document', variant: 'primary' });
        row.append(cancel, apply);
        panel.append(h, note, ta, row);
        const done = (v) => { panel.remove(); resolve(v); };
        cancel.addEventListener('click', () => done(null));
        apply.addEventListener('click', () => done(ta.value));
        panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation?.();
            done(null);
        } });
        r.append(panel);
        ta.focus();
    });
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
function attachAiMenu(shell, o) {
    const toolbar = toolbarOf(shell);
    const root = rootOf(shell);
    let menu = null;
    let busy = false;
    let gone = false;
    const ops = () => { try {
        return (o.operations() ?? []).filter((x) => x && typeof x.id === 'string' && typeof x.title === 'string');
    }
    catch {
        return [];
    } };
    const toast = (msg, tone) => { if (!gone)
        (0, chrome_js_1.showToast)(shell.root, msg, { tone }); };
    const run = async (op) => {
        if (busy || gone || !menu)
            return;
        busy = true;
        const b = menu.button;
        b.disabled = true;
        b.setAttribute('aria-busy', 'true');
        try {
            const r = await shell.proposeAi(op.id, op.selection ? { selection: true } : {});
            if (gone)
                return;
            if (!r.ok) {
                toast(r.error === 'no selection' ? `${op.title}: select a passage first.` : `${op.title} did not run: ${r.error}.`, 'warning');
                return;
            }
            const text = await reviewProposal(root, r.proposal, { title: op.title });
            if (text === null || gone)
                return;
            const a = shell.applyAi(r.proposal, { proposed: text });
            if (!a.ok)
                toast(`${op.title} was not applied: ${a.error}.`, 'warning');
        }
        finally {
            busy = false;
            if (!gone) {
                b.disabled = false;
                b.removeAttribute('aria-busy');
            }
        }
    };
    const refresh = () => {
        if (gone || !toolbar)
            return;
        if (ops().length === 0) {
            menu?.destroy();
            menu = null;
            return;
        }
        if (menu)
            return;
        installCss(root, exports.WIDGET_CSS);
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
/**
 * Keep an editor's preview frame on the text's presentation: after a pause in
 * editing (default 200 ms) `present(text)` is compared with the last one and,
 * when it differs (a theme, measure or page-size change in the header), the
 * frame document is rebuilt (`shell.preview.setOptions`). Returns the
 * unsubscribe (call it before `destroy`).
 */
function followPresentation(shell, present, o = {}) {
    const win = o.window ?? (toolbarOf(shell)?.ownerDocument?.defaultView ?? globalThis);
    const key = (p) => JSON.stringify([p.head ?? null, p.scheme ?? null, p.articleClass ?? null]);
    let last = key(present(shell.getText()));
    let timer = null;
    const apply = () => {
        timer = null;
        const p = present(shell.getText());
        const k = key(p);
        if (k === last)
            return;
        last = k;
        shell.preview.setOptions(p);
    };
    const off = shell.on('change', () => {
        if (timer !== null)
            win.clearTimeout(timer);
        timer = win.setTimeout(apply, o.delayMs ?? 200);
    });
    return () => { off(); if (timer !== null)
        win.clearTimeout(timer); timer = null; };
}
//# sourceMappingURL=widgets.js.map