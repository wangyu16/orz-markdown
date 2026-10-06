"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mountUpdateIndicator = mountUpdateIndicator;
/**
 * The quiet update indicator (FD-05; spec/shell-runtime.md §7): a small chip
 * with a dot next to an anchor (the brand), rendered in its own shadow root.
 * Clicking it opens a small non-modal popover — "Update available: x.y.z",
 * a "What's new" link, and Update now / Not now / Skip this version. No
 * modal, no `confirm()`, no banner over the content; Esc closes the popover
 * and returns focus to the chip; motion respects `prefers-reduced-motion`.
 *
 * Shown only by a standalone file; in an app host the app owns the component
 * version and shows nothing (FC-19 §5.6). No DOM at module load.
 */
const chrome_js_1 = require("./chrome.js");
const POPOVER_ID = 'orz-update-popover';
const TITLE_ID = 'orz-update-title';
/** Mount the indicator after `anchor` (the brand). Throws only when there is no document. */
function mountUpdateIndicator(anchor, info, handlers, options = {}) {
    const doc = options.document ?? (0, chrome_js_1.documentOf)(anchor);
    if (!doc)
        throw new Error('orz update: the indicator needs a document');
    const view = (0, chrome_js_1.viewOf)(doc);
    const host = doc.createElement('span');
    host.className = 'orz-update-indicator';
    host.setAttribute('data-orz-chrome', 'update');
    if (typeof anchor.after === 'function')
        anchor.after(host);
    else if (anchor.parentNode)
        anchor.parentNode.insertBefore(host, anchor.nextSibling ?? null);
    else
        throw new Error('orz update: the anchor is not in a document');
    const root = (0, chrome_js_1.createShadowRoot)(host);
    const label = `Update available: ${info.latest}`;
    const chip = doc.createElement('button');
    chip.setAttribute('type', 'button');
    chip.className = 'orz-chip';
    chip.setAttribute('aria-haspopup', 'dialog');
    chip.setAttribute('aria-expanded', 'false');
    chip.setAttribute('aria-controls', POPOVER_ID);
    chip.setAttribute('aria-label', label);
    chip.setAttribute('title', label);
    const dot = doc.createElement('span');
    dot.className = 'orz-dot';
    dot.setAttribute('aria-hidden', 'true');
    chip.append((0, chrome_js_1.iconElement)(doc, 'update'), dot);
    const pop = doc.createElement('div');
    pop.className = 'orz-popover';
    pop.setAttribute('id', POPOVER_ID);
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-modal', 'false');
    pop.setAttribute('aria-labelledby', TITLE_ID);
    pop.hidden = true;
    const title = (0, chrome_js_1.textElement)(doc, 'p', 'orz-popover__title', label);
    title.el.setAttribute('id', TITLE_ID);
    const meta = (0, chrome_js_1.textElement)(doc, 'p', 'orz-popover__meta', `You have ${info.current}. Your text stays exactly as it is.`);
    pop.append(title.el, meta.el);
    if (info.notes) {
        const link = (0, chrome_js_1.textElement)(doc, 'a', 'orz-popover__link', 'What’s new');
        link.el.setAttribute('href', info.notes);
        link.el.setAttribute('target', '_blank');
        link.el.setAttribute('rel', 'noopener noreferrer');
        pop.append(link.el);
    }
    const error = (0, chrome_js_1.textElement)(doc, 'p', 'orz-popover__error', '');
    error.el.setAttribute('role', 'status');
    error.el.setAttribute('aria-live', 'polite');
    error.el.hidden = true;
    const actions = doc.createElement('div');
    actions.className = 'orz-popover__actions';
    const updateBtn = (0, chrome_js_1.textElement)(doc, 'button', 'orz-btn orz-btn--primary', 'Update now');
    const laterBtn = (0, chrome_js_1.textElement)(doc, 'button', 'orz-btn', 'Not now');
    const skipBtn = (0, chrome_js_1.textElement)(doc, 'button', 'orz-btn orz-btn--ghost', 'Skip this version');
    for (const b of [updateBtn, laterBtn, skipBtn])
        b.el.setAttribute('type', 'button');
    actions.append(updateBtn.el, laterBtn.el, skipBtn.el);
    pop.append(error.el, actions);
    root.append(chip, pop);
    let opened = false;
    let busy = false;
    let disposed = false;
    const place = () => {
        try {
            const r = chip.getBoundingClientRect?.();
            const width = view?.innerWidth;
            if (!r || typeof width !== 'number' || !pop.style)
                return;
            const left = Math.max(8, Math.min(r.left, width - 8 - 320));
            pop.style.setProperty('top', `${Math.round(r.bottom + 6)}px`);
            pop.style.setProperty('left', `${Math.round(left)}px`);
        }
        catch {
            /* layout unavailable: CSS defaults */
        }
    };
    const onOutside = (e) => {
        const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
        if (!path.includes(host))
            close(false);
    };
    function open() {
        if (opened || disposed)
            return;
        opened = true;
        place();
        pop.hidden = false;
        chip.setAttribute('aria-expanded', 'true');
        doc.addEventListener('pointerdown', onOutside, true);
        updateBtn.el.focus?.();
    }
    function close(returnFocus = true) {
        if (!opened)
            return;
        opened = false;
        pop.hidden = true;
        chip.setAttribute('aria-expanded', 'false');
        doc.removeEventListener('pointerdown', onOutside, true);
        if (returnFocus)
            chip.focus?.();
    }
    const setBusy = (on) => {
        busy = on;
        for (const b of [updateBtn, laterBtn, skipBtn])
            b.el.disabled = on;
        if (on)
            pop.setAttribute('aria-busy', 'true');
        else
            pop.removeAttribute('aria-busy');
        updateBtn.text.data = on ? 'Updating…' : 'Update now';
    };
    const onChip = () => { if (opened)
        close(true);
    else
        open(); };
    const onKey = (e) => {
        if (e.key === 'Escape' && opened) {
            e.preventDefault();
            e.stopPropagation?.();
            close(true);
        }
    };
    const onFocusOut = (e) => {
        const to = e.relatedTarget;
        if (opened && to && typeof root.contains === 'function' && !root.contains(to))
            close(false);
    };
    const onUpdate = () => {
        if (busy)
            return;
        setBusy(true);
        error.el.hidden = true;
        error.text.data = '';
        Promise.resolve()
            .then(() => handlers.onUpdate(info))
            .then(() => { if (!disposed) {
            setBusy(false);
            close(false);
        } }, (err) => {
            if (disposed)
                return;
            setBusy(false);
            error.text.data = String(err?.message ?? err) || 'The update did not complete.';
            error.el.hidden = false;
            updateBtn.el.focus?.();
        });
    };
    const onLater = () => { if (busy)
        return; dispose(); handlers.onLater?.(info); };
    const onSkip = () => { if (busy)
        return; dispose(); handlers.onSkip?.(info); };
    chip.addEventListener('click', onChip);
    chip.addEventListener('keydown', onKey);
    pop.addEventListener('keydown', onKey);
    pop.addEventListener('focusout', onFocusOut);
    updateBtn.el.addEventListener('click', onUpdate);
    laterBtn.el.addEventListener('click', onLater);
    skipBtn.el.addEventListener('click', onSkip);
    function dispose() {
        if (disposed)
            return;
        const hadFocus = opened;
        close(false);
        disposed = true;
        chip.removeEventListener('click', onChip);
        chip.removeEventListener('keydown', onKey);
        pop.removeEventListener('keydown', onKey);
        pop.removeEventListener('focusout', onFocusOut);
        updateBtn.el.removeEventListener('click', onUpdate);
        laterBtn.el.removeEventListener('click', onLater);
        skipBtn.el.removeEventListener('click', onSkip);
        host.remove();
        if (hadFocus)
            anchor.focus?.();
    }
    return { host, root, open, close: () => close(true), isOpen: () => opened, dispose };
}
//# sourceMappingURL=indicator.js.map