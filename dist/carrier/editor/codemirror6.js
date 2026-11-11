"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESC_TAB_HINT = exports.ORZ_HIGHLIGHTER = exports.CODEMIRROR6_HISTORY_STEPS = exports.CODEMIRROR6_TIMEOUT_MS = exports.CODEMIRROR6_URL = void 0;
exports.isCodeMirror6Modules = isCodeMirror6Modules;
exports.loadCodeMirror6 = loadCodeMirror6;
exports.codemirror6Adapter = codemirror6Adapter;
/**
 * The default editing engine: CodeMirror 6 behind the adapter interface
 * (adapter.ts), loaded lazily.
 *
 * Loading. By default the PINNED bundle `vendor/codemirror6.js` of this
 * package (exact versions in codemirror-pin.ts, built by
 * scripts/build-codemirror.ts) is loaded from jsDelivr
 * (`https://cdn.jsdelivr.net/npm/orz-markdown@<VERSION>/vendor/codemirror6.js`)
 * by one `<script src integrity crossorigin>` per document — Subresource
 * Integrity pins the bytes, there is no eval and no inline script, and one
 * bundle means one `@codemirror/state` (per-package `+esm` URLs resolve it to
 * different versions, which CodeMirror refuses). An app that bundles
 * CodeMirror itself passes `loadModules` and nothing is fetched.
 *
 * While CodeMirror loads, the shell is already editable: the adapter starts
 * as a `<textarea>` and upgrades in place (its current text, selection, focus,
 * scroll and its newest undo steps carried over: each of the last
 * `CODEMIRROR6_HISTORY_STEPS` textarea undo steps becomes one CodeMirror undo
 * step — CodeMirror's own history keeps at least that many). When CodeMirror cannot load (offline, blocked, wrong bytes), the
 * textarea stays and `ready()` reports the error.
 */
const version_js_1 = require("../../version.js");
const codemirror_pin_js_1 = require("./codemirror-pin.js");
const adapter_js_1 = require("./adapter.js");
const text_model_js_1 = require("./text-model.js");
/** Where the pinned bundle is served (the package version that ships it). */
exports.CODEMIRROR6_URL = `https://cdn.jsdelivr.net/npm/orz-markdown@${version_js_1.VERSION}/${codemirror_pin_js_1.CODEMIRROR6_PATH}`;
/** How long the bundle may take to load before the textarea is kept. */
exports.CODEMIRROR6_TIMEOUT_MS = 20000;
/**
 * How many of the textarea's undo steps the upgrade replays into CodeMirror
 * (CodeMirror's history keeps at least 100 by default). Replaying all 300 of a
 * 1.25 MB document took 20 s and 590 MB (MED cost-2).
 */
exports.CODEMIRROR6_HISTORY_STEPS = 100;
/** True when an object has the exports the adapter needs. */
function isCodeMirror6Modules(m) {
    const o = m;
    return !!o && typeof o === 'object'
        && typeof o.state?.EditorState === 'function'
        && typeof o.view?.EditorView === 'function' && typeof o.view.keymap === 'object'
        && typeof o.commands?.history === 'function' && Array.isArray(o.commands.defaultKeymap) && Array.isArray(o.commands.historyKeymap)
        && typeof o.commands.undo === 'function' && typeof o.commands.redo === 'function'
        && typeof o.language?.syntaxHighlighting === 'function' && !!o.language.defaultHighlightStyle
        && !!o.markdown?.markdownLanguage;
}
/** One load per document and URL (several editors on a page share it). */
const loads = new WeakMap();
/**
 * Load the pinned CodeMirror 6 bundle into a document: a `<script>` with the
 * pinned SRI integrity, appended to `<head>` once; resolves the bundle's
 * global. Rejects on a network or integrity failure, a timeout or a bundle
 * without the expected exports (a later call tries again).
 */
function loadCodeMirror6(doc, options = {}) {
    const url = options.url ?? exports.CODEMIRROR6_URL;
    const win = doc.defaultView;
    const present = win?.[codemirror_pin_js_1.CODEMIRROR6_GLOBAL];
    if (isCodeMirror6Modules(present))
        return Promise.resolve(present);
    let perDoc = loads.get(doc);
    if (!perDoc)
        loads.set(doc, (perDoc = new Map()));
    const cached = perDoc.get(url);
    if (cached)
        return cached;
    const p = new Promise((resolve, reject) => {
        if (!win || !doc.head) {
            reject(new Error('CodeMirror needs a document with a window'));
            return;
        }
        const script = doc.createElement('script');
        let timer = null;
        const done = (error) => {
            if (timer !== null)
                win.clearTimeout(timer);
            script.removeEventListener('load', onLoad);
            script.removeEventListener('error', onError);
            if (error) {
                script.remove();
                reject(error);
                return;
            }
            const g = win[codemirror_pin_js_1.CODEMIRROR6_GLOBAL];
            if (isCodeMirror6Modules(g))
                resolve(g);
            else
                reject(new Error('The CodeMirror bundle did not provide the expected exports'));
        };
        const onLoad = () => done(null);
        const onError = () => done(new Error(`CodeMirror could not be loaded from ${url}`));
        script.addEventListener('load', onLoad);
        script.addEventListener('error', onError);
        script.setAttribute('data-orz-editor', 'codemirror6');
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.integrity = codemirror_pin_js_1.CODEMIRROR6_INTEGRITY;
        if (options.nonce)
            script.setAttribute('nonce', options.nonce);
        script.src = url;
        timer = win.setTimeout(() => done(new Error('CodeMirror took too long to load')), options.timeoutMs ?? exports.CODEMIRROR6_TIMEOUT_MS);
        doc.head.append(script);
    });
    perDoc.set(url, p);
    p.catch(() => { if (perDoc.get(url) === p)
        perDoc.delete(url); });
    return p;
}
/** The editor's look: chrome tokens (inherited from the shell's :host). */
const THEME = {
    '&': { height: '100%', fontSize: 'var(--orz-editor-font-size, 14px)', backgroundColor: 'var(--orz-chrome-surface)', color: 'var(--orz-chrome-fg)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--orz-chrome-mono)', lineHeight: '1.6', overflow: 'auto' },
    '.cm-content': { padding: '12px 0', caretColor: 'var(--orz-chrome-fg)' },
    '.cm-line': { padding: '0 16px' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--orz-chrome-fg)' },
    '.cm-activeLine': { backgroundColor: 'color-mix(in oklch, var(--orz-chrome-accent) 6%, transparent)' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: 'color-mix(in oklch, var(--orz-chrome-accent) 26%, transparent)',
    },
    '.cm-panels': { backgroundColor: 'var(--orz-chrome-surface-2)', color: 'var(--orz-chrome-fg)' },
    // setFocusRange (2.4.0): the text outside the focus range, dimmed
    '.orz-focus-outside': { opacity: '0.38' },
    // the folded header (2.7.0, D-130): one closed line, and the bar over an opened one
    '.orz-header-fold': {
        display: 'flex', alignItems: 'center', gap: '6px', margin: '0', padding: '2px 16px 6px', minHeight: '30px', boxSizing: 'border-box',
        // (audit 1, H1) NO outer margin: CodeMirror's height map does not measure a block widget's margins, so one
        // would offset every line below it (clicks on the next line, scroll sync off by a fraction); the gap is padding
        cursor: 'pointer', userSelect: 'none', fontFamily: 'var(--orz-chrome-font)', fontSize: 'var(--orz-chrome-text-sm, 13px)',
        color: 'var(--orz-chrome-muted)', background: 'var(--orz-chrome-surface-2)', borderBottom: '1px solid var(--orz-chrome-border)',
    },
    '.orz-header-fold:hover': { color: 'var(--orz-chrome-fg)' },
    // (audit 3) a selection over the whole closed header shows on it
    '.orz-header-fold[data-selected]': { backgroundColor: 'color-mix(in oklch, var(--orz-chrome-accent) 26%, var(--orz-chrome-surface-2))', color: 'var(--orz-chrome-fg)' },
    '.orz-header-fold__name': { fontWeight: '600', color: 'var(--orz-chrome-fg)', whiteSpace: 'nowrap' },
    '.orz-header-fold__title': { minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    '.orz-header-fold__mark': { marginLeft: 'auto', paddingLeft: '8px' },
    // flash (2.4.0): the lines a tool just changed, lit briefly
    '.cm-line.orz-flash': { backgroundColor: 'color-mix(in oklch, var(--orz-chrome-flash, oklch(85% 0.16 90)) 42%, transparent)', animation: 'orz-flash-fade var(--orz-flash-ms, 1600ms) ease-in forwards' },
    '@keyframes orz-flash-fade': { '0%, 55%': { backgroundColor: 'color-mix(in oklch, var(--orz-chrome-flash, oklch(85% 0.16 90)) 42%, transparent)' }, '100%': { backgroundColor: 'transparent' } },
    // syntax (2.2.0): the chrome's syntax tokens, light and dark with the chrome's scheme (E.27)
    '.orz-tok-heading': { color: 'var(--orz-chrome-syntax-heading)', fontWeight: '700' },
    '.orz-tok-strong': { fontWeight: '700' },
    '.orz-tok-em': { fontStyle: 'italic' },
    '.orz-tok-strike': { textDecoration: 'line-through' },
    '.orz-tok-link': { color: 'var(--orz-chrome-syntax-link)' },
    '.orz-tok-url': { color: 'var(--orz-chrome-syntax-url)', textDecoration: 'underline' },
    '.orz-tok-code': { color: 'var(--orz-chrome-syntax-code)' },
    '.orz-tok-quote': { color: 'var(--orz-chrome-syntax-quote)' },
    '.orz-tok-comment': { color: 'var(--orz-chrome-syntax-comment)', fontStyle: 'italic' },
    '.orz-tok-label': { color: 'var(--orz-chrome-syntax-label)' },
    '.orz-tok-mark': { color: 'var(--orz-chrome-syntax-mark)' },
};
/** Lezer highlight tag names → the classes of {@link THEME} (a tag's own name first, then its parents'). */
const TAG_CLASSES = {
    heading: 'orz-tok-heading', heading1: 'orz-tok-heading', heading2: 'orz-tok-heading', heading3: 'orz-tok-heading',
    heading4: 'orz-tok-heading', heading5: 'orz-tok-heading', heading6: 'orz-tok-heading',
    strong: 'orz-tok-strong', emphasis: 'orz-tok-em', strikethrough: 'orz-tok-strike',
    link: 'orz-tok-link', url: 'orz-tok-url', monospace: 'orz-tok-code', quote: 'orz-tok-quote', comment: 'orz-tok-comment',
    labelName: 'orz-tok-label', string: 'orz-tok-label', meta: 'orz-tok-label', atom: 'orz-tok-label', keyword: 'orz-tok-label',
    processingInstruction: 'orz-tok-mark', contentSeparator: 'orz-tok-mark', character: 'orz-tok-mark', escape: 'orz-tok-mark',
};
/**
 * The editor's syntax highlighter (2.2.0): a CodeMirror `Highlighter` that
 * gives each Markdown token a class of {@link THEME}, whose colours are the
 * chrome's `--orz-chrome-syntax-*` tokens — so the editor's syntax follows the
 * chrome's light or dark scheme (`data-chrome`, `prefers-color-scheme`) with
 * no reconfiguration, at ≥ 4.5:1 on the editor background (E.27). It reads
 * the tag names `@lezer/highlight` sets on its `tags`; a tag without a known
 * name is not styled.
 */
exports.ORZ_HIGHLIGHTER = {
    style(tags) {
        const out = new Set();
        for (const t of tags) {
            for (const p of (Array.isArray(t?.set) ? t.set : [t])) {
                const c = typeof p?.name === 'string' ? TAG_CLASSES[p.name] : undefined;
                if (c) {
                    out.add(c);
                    break;
                }
            }
        }
        return out.size ? [...out].join(' ') : null;
    },
};
/** CodeMirror 6 (markdown mode, line wrapping, history, search) behind the adapter interface. */
/**
 * Read-only in CodeMirror (claim E.22, FC-19 §5 invariant 7): the state is
 * read-only (no command or input edits it) and the content is not editable,
 * but it stays focusable (`tabindex="0"`) and selectable, so the reader can
 * select, copy and press Cmd/Ctrl+S in a read-only editor (2.2.0; before,
 * `editable: false` alone left nothing to focus).
 */
function readOnlyExtensions(m, flag) {
    const { EditorState } = m.state;
    const { EditorView } = m.view;
    return [
        EditorState.readOnly.of(flag),
        EditorView.editable.of(!flag),
        ...(flag && EditorView.contentAttributes ? [EditorView.contentAttributes.of({ tabindex: '0', 'aria-readonly': 'true' })] : []),
    ];
}
/**
 * The focus range of `setFocusRange` (2.4.0): a state field mapped through
 * every change (an insertion at its end grows it, one at its start stays
 * outside), drawing the text outside it dimmed (two mark decorations) or
 * folded away (whole lines replaced by nothing). Null when the modules lack
 * `StateField`, `StateEffect` or `Decoration` (an app's own CodeMirror build):
 * then everything stays shown.
 */
function focusExtension(m) {
    const { StateField, StateEffect } = m.state;
    const { Decoration, EditorView } = m.view;
    if (typeof StateField?.define !== 'function' || typeof StateEffect?.define !== 'function' || typeof Decoration?.mark !== 'function' || !EditorView?.decorations)
        return null;
    const effect = StateEffect.define();
    const dim = Decoration.mark({ class: 'orz-focus-outside' });
    const fold = Decoration.replace({ block: true });
    const decorate = (v, doc) => {
        if (!v)
            return Decoration.none;
        const len = doc.length;
        const ranges = [];
        if (v.mode === 'fold') {
            const first = doc.lineAt(v.from);
            const last = doc.lineAt(Math.max(v.from, v.to - (v.to > v.from ? 1 : 0)));
            if (first.number > 1)
                ranges.push(fold.range(0, doc.line(first.number - 1).to));
            if (last.number < doc.lines)
                ranges.push(fold.range(doc.line(last.number + 1).from, len));
        }
        else {
            if (v.from > 0)
                ranges.push(dim.range(0, v.from));
            if (v.to < len)
                ranges.push(dim.range(v.to, len));
        }
        return Decoration.set(ranges, true);
    };
    const field = StateField.define({
        create: () => ({ value: null, deco: Decoration.none }),
        update(f, tr) {
            let value = f.value;
            let touched = false;
            if (value && tr.docChanged) {
                const from = tr.changes.mapPos(value.from, 1);
                value = { from, to: Math.max(from, tr.changes.mapPos(value.to, 1)), mode: value.mode };
                touched = true;
            }
            let set = false;
            for (const e of tr.effects)
                if (e.is(effect)) {
                    value = e.value;
                    touched = true;
                    set = true;
                }
            // (audit 4, M2) a caret or selection end moved into the lines a fold hides shows them: the reader sees where
            // the next key acts (as a caret moving into the closed header opens it)
            if (value && value.mode === 'fold' && tr.selection && !set) {
                const doc = tr.newDoc;
                const first = doc.lineAt(Math.max(0, Math.min(doc.length, value.from)));
                const last = doc.lineAt(Math.max(0, Math.min(doc.length, Math.max(value.from, value.to - (value.to > value.from ? 1 : 0)))));
                const hidden = (n) => n < first.from || n > last.to;
                if (tr.newSelection.ranges.some((r) => hidden(r.head) || hidden(r.anchor))) {
                    value = null;
                    touched = true;
                }
            }
            if (!touched)
                return f;
            if (value) {
                const len = tr.newDoc.length;
                const from = Math.max(0, Math.min(len, value.from));
                value = { from, to: Math.max(from, Math.min(len, value.to)), mode: value.mode };
            }
            return { value, deco: decorate(value, tr.newDoc) };
        },
        provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
    });
    return { effect, field, extension: [field] };
}
/**
 * The flash of `flash` (2.4.0): a state field of line decorations (`orz-flash`) over the lines the
 * ranges touch, mapped through later changes, cleared by an effect. Null without the decoration API.
 */
function flashExtension(m) {
    const { StateField, StateEffect } = m.state;
    const { Decoration, EditorView } = m.view;
    if (typeof StateField?.define !== 'function' || typeof StateEffect?.define !== 'function' || typeof Decoration?.line !== 'function' || !EditorView?.decorations)
        return null;
    const effect = StateEffect.define();
    const line = Decoration.line({ class: 'orz-flash' });
    const field = StateField.define({
        create: () => Decoration.none,
        update(deco, tr) {
            let d = tr.docChanged ? deco.map(tr.changes) : deco;
            for (const e of tr.effects) {
                if (!e.is(effect))
                    continue;
                const ranges = e.value;
                if (!ranges) {
                    d = Decoration.none;
                    continue;
                }
                const doc = tr.state.doc;
                const starts = new Set();
                for (const r of ranges) {
                    const len = doc.length;
                    const a = Math.max(0, Math.min(len, Math.min(r.from, r.to)));
                    const b = Math.max(a, Math.min(len, Math.max(r.from, r.to)));
                    const first = doc.lineAt(a).number;
                    // a range that ends at a line start does not touch that line (a whole-line edit)
                    const last = b > a && doc.lineAt(b).from === b ? doc.lineAt(b).number - 1 : doc.lineAt(b).number;
                    for (let n = first; n <= Math.max(first, last) && starts.size < 2000; n++)
                        starts.add(doc.line(n).from);
                }
                d = Decoration.set([...starts].sort((x, y) => x - y).map((p) => line.range(p)));
            }
            return d;
        },
        provide: (f) => EditorView.decorations.from(f),
    });
    return { effect, field, extension: [field] };
}
/** How much of the text the header is looked for in (a header longer than this is not folded). */
const HEADER_PROBE = 65536;
/**
 * (2.7.0, STATUS D-130) The document header folded to one closed line —
 * "Document settings · <title> ▸" — that opens on a click, or when the caret
 * moves into it (a click above it, Ctrl+Home, the up arrow, a search match,
 * `select`, `reveal`, an undo there); an opened header has a bar above it
 * that folds it again. Nothing in the text changes: the header's lines are a
 * block replaced by a widget while closed. Lines from the start of the
 * header's first line to the end of its `}}` line; a header whose `}}` line
 * holds more text, or longer than {@link HEADER_PROBE}, is not folded. While
 * a `setFocusRange` fold hides the header's lines, nothing more is drawn.
 * Null without `StateField`, `StateEffect`, `Decoration` or `WidgetType`.
 */
function headerFoldExtension(m, find, focusExt, hooks) {
    const focusField = focusExt?.field ?? null;
    const { StateField, StateEffect } = m.state;
    const { Decoration, EditorView, WidgetType } = m.view;
    if (typeof StateField?.define !== 'function' || typeof StateEffect?.define !== 'function' || typeof Decoration?.replace !== 'function' || typeof WidgetType !== 'function' || !EditorView?.decorations)
        return null;
    const effect = StateEffect.define();
    const locate = (doc) => {
        let info = null;
        try {
            info = find(doc.sliceString(0, Math.min(doc.length, HEADER_PROBE)));
        }
        catch {
            info = null;
        }
        if (!info || !(info.to > info.from) || info.to > doc.length)
            return null;
        const first = doc.lineAt(info.from);
        const last = doc.lineAt(info.to);
        if (doc.sliceString(info.to, last.to).trim() !== '')
            return null; // more text on the }} line: not folded
        // (audit 4, M1) blank lines above the header go with it: a character typed there would make it no header
        const from = doc.sliceString(0, first.from).trim() === '' ? 0 : first.from;
        return { from, to: last.to, title: String(info.title ?? '').replace(/\s+/g, ' ').trim() };
    };
    /** The selection's head inside the folded lines (both ends count: typing there would change the header). */
    // (audit 2, HIGH) a range is in the header when its head is in [from, to] OR its anchor in (from, to]: a selection
    // anchored inside the hidden lines would otherwise let one key delete settings the reader cannot see. A range
    // anchored at the header's very start (select-all) is the whole header, visibly selected: not "inside".
    const inside = (at, sel) => sel.ranges.some((r) => (r.head >= at.from && r.head <= at.to) || (r.anchor > at.from && r.anchor <= at.to));
    /** The selection with no end in the header: an end inside goes to the first offset after it. */
    const outside = (at, sel, len) => {
        const after = Math.min(len, at.to + 1);
        const r = sel.main;
        const fix = (n) => (n >= at.from && n <= at.to ? after : n);
        return { anchor: fix(r.anchor), head: fix(r.head) };
    };
    class FoldLine extends WidgetType {
        constructor(title, open, selected = false) {
            super();
            this.title = title;
            this.open = open;
            this.selected = selected;
        }
        eq(other) { return other.title === this.title && other.open === this.open && other.selected === this.selected; }
        toDOM(view) {
            const d = view.dom.ownerDocument;
            const line = d.createElement('div');
            line.className = 'orz-header-fold';
            line.setAttribute('data-orz-header-fold', this.open ? 'open' : 'closed');
            // (audit 3) a selection over the whole closed header shows on it (its own background hides the selection layer)
            if (this.selected)
                line.setAttribute('data-selected', '');
            line.setAttribute('role', 'button');
            line.setAttribute('aria-expanded', String(this.open));
            line.setAttribute('aria-label', this.open ? 'Fold the document settings' : `Document settings${this.title ? `: ${this.title}` : ''}. Open them to edit.`);
            line.title = this.open ? 'Fold the document settings into one line' : 'Open the document settings (the {{nyml}} header) to edit them';
            const name = d.createElement('span');
            name.className = 'orz-header-fold__name';
            name.textContent = 'Document settings';
            line.append(name);
            // the title on the open bar too (audit 4: an edit that opens it — a block joined to the header — keeps naming it)
            if (this.title) {
                const t = d.createElement('span');
                t.className = 'orz-header-fold__title';
                t.textContent = `· ${this.title}`;
                line.append(t);
            }
            const mark = d.createElement('span');
            mark.className = 'orz-header-fold__mark';
            mark.setAttribute('aria-hidden', 'true');
            mark.textContent = this.open ? '▾' : '▸';
            line.append(mark);
            const open = this.open;
            // the editor ignores events in the widget (ignoreEvent): the pointer press moves no caret, and the click acts
            // (audit 1, L1: a role="button" activated by assistive technology sends a click alone)
            line.addEventListener('mousedown', (e) => { if (e.button === 0)
                e.preventDefault(); });
            line.addEventListener('click', (e) => {
                // (audit 2) the second click of a double-click does not fold at once what the first opened
                if (e.button !== 0 || e.detail > 1)
                    return;
                e.preventDefault();
                const v = view.state.field(field, false);
                const at = v?.at;
                if (!at)
                    return;
                if (open) {
                    // fold again: a caret inside goes after the header, so the header stays closed
                    const sel = view.state.selection;
                    view.dispatch({ effects: effect.of(false), ...(inside(at, sel) ? { selection: outside(at, sel, view.state.doc.length) } : {}) });
                }
                else {
                    // open, the caret on the first setting (the line after {{nyml)
                    const doc = view.state.doc;
                    const firstLine = doc.lineAt(at.from);
                    const caret = firstLine.number < doc.lines && doc.line(firstLine.number + 1).from <= at.to ? doc.line(firstLine.number + 1).to : at.from;
                    view.dispatch({ effects: effect.of(true), selection: { anchor: caret } });
                }
                view.focus();
            });
            return line;
        }
        ignoreEvent() { return true; }
    }
    const draw = (at, open, covered = false) => {
        if (!at)
            return Decoration.none;
        if (open)
            return Decoration.set([Decoration.widget({ widget: new FoldLine(at.title, true), block: true, side: -1 }).range(at.from)]);
        return Decoration.set([Decoration.replace({ widget: new FoldLine(at.title, false, covered), block: true }).range(at.from, at.to)]);
    };
    const covers = (at, sel) => !!at && sel.ranges.some((r) => !r.empty && r.from <= at.from && r.to >= at.to);
    /** The changes alter the header's hidden text: one overlaps [from, to), or inserts at its start or inside it. */
    const touchesHidden = (changes, at) => {
        let hit = false;
        changes.iterChangedRanges((fA, tA) => { if ((fA < at.to && tA > at.from) || (fA === tA && fA >= at.from && fA < at.to))
            hit = true; });
        return hit;
    };
    const field = StateField.define({
        create: (state) => {
            const at = locate(state.doc);
            // (audit 3, MEDIUM) a text reloaded with the caret in the header (setDoc with resetHistory) shows it open
            // (a fresh state's default caret, collapsed at the header's start, is no reader's: the adapter moves it after the
            // header when CodeMirror arrives, and a key there is refused by the guard below)
            const m0 = state.selection.main;
            const open = !!at && !(state.selection.ranges.length === 1 && m0.empty && m0.head === at.from) && inside(at, state.selection);
            const covered = !open && covers(at, state.selection);
            return { at, open, covered, deco: draw(at, open, covered) };
        },
        update(v, tr) {
            let at = v.at;
            let open = v.open;
            let changed = false;
            // (audit 3, LOW) an undo or redo that changes the closed header's hidden text opens it: settings never change unseen
            if (at && !open && tr.docChanged && (tr.isUserEvent('undo') || tr.isUserEvent('redo')) && touchesHidden(tr.changes, at)) {
                open = true;
                changed = true;
            }
            if (tr.docChanged) {
                // (audit 3, perf) read the header again only when a change touches it (not on every key of the first body line)
                // (audit 4, L6) up to the first non-space after the header: a block brought next to it (a legacy meta
                // block, FC-18's pair) belongs to the header and changes its title
                let reach = Math.min(tr.startState.doc.length, HEADER_PROBE);
                if (at) {
                    const tail = tr.startState.doc.sliceString(at.to, Math.min(tr.startState.doc.length, at.to + 4096));
                    const ns = tail.search(/\S/);
                    reach = at.to + (ns < 0 ? tail.length : ns + 1);
                }
                if (tr.changes.touchesRange(0, reach))
                    at = locate(tr.newDoc);
                else if (at)
                    at = { from: tr.changes.mapPos(at.from), to: tr.changes.mapPos(at.to), title: at.title };
                changed = true;
            }
            // the caret moved into the closed header: it opens (the reader sees what they edit)
            if (at && !open && tr.selection && inside(at, tr.newSelection)) {
                open = true;
                changed = true;
            }
            for (const e of tr.effects)
                if (e.is(effect)) {
                    open = e.value === true;
                    changed = true;
                }
            if (!at)
                open = false;
            const covered = !open && (tr.selection || changed ? covers(at, tr.newSelection) : v.covered);
            if (covered !== v.covered)
                changed = true;
            if (!changed)
                return v;
            if (v.at && at && v.open === open && v.covered === covered && v.at.from === at.from && v.at.to === at.to && v.at.title === at.title)
                return { at, open, covered, deco: v.deco.map(tr.changes) };
            return { at, open, covered, deco: draw(at, open, covered) };
        },
    });
    // a focus fold (setFocusRange 'fold') that hides the header's lines leaves nothing to draw
    const decorations = EditorView.decorations.compute([field, ...(focusField ? [focusField] : [])], (state) => {
        const v = state.field(field);
        const f = focusField ? state.field(focusField, false)?.value : null;
        if (v.at && f && f.mode === 'fold' && state.doc.lineAt(f.from).from > v.at.from)
            return Decoration.none;
        return v.deco;
    });
    // (audit 1, M2) the closed header is one atomic piece: the caret steps over it as a whole, a selection never ends
    // inside it; and a selection that covered it (select-all) is not cut back to the line after it by the browser's
    // read-back of the DOM selection (the widget cannot hold a DOM caret before it)
    const atomic = EditorView.atomicRanges ? [EditorView.atomicRanges.of((view) => {
            const v = view.state.field(field, false);
            return v?.at && !v.open ? v.deco : Decoration.none;
        })] : [];
    const { EditorState } = m.state;
    const keepCover = EditorState?.transactionFilter ? [EditorState.transactionFilter.of((tr) => {
            if (tr.docChanged || !tr.selection || tr.effects.length)
                return tr;
            const v = tr.startState.field(field, false);
            if (!v?.at || v.open)
                return tr;
            const s0 = tr.startState.selection.main;
            const s1 = tr.newSelection.main;
            const doc = tr.startState.doc;
            const after = v.at.to < doc.length ? v.at.to + 1 : v.at.to;
            // the old selection covered the header; the new one is the same but starts just after the header
            if (s0.from <= v.at.from && !s0.empty && !s1.empty && s1.to === s0.to && s1.from >= v.at.to && s1.from <= after && tr.newSelection.ranges.length === 1) {
                return [tr, { selection: tr.startState.selection, sequential: true }];
            }
            return tr;
        })] : [];
    // (audits 2–3, HIGH) the rule: no single user action changes header text the reader neither saw selected nor saw
    // open. INVERTED (audit 3): while the header is closed, EVERY transaction that changes its hidden text is refused —
    // whatever its userEvent (typing, delete, paste, drop, replace, toggle comment, indent, line moves) — unless it
    // comes from code (setText / setHeader / applyEdits, flagged by the adapter), is an undo or redo (which then opens
    // the header, above), or replaces the WHOLE document (select-all, which the closed line shows selected). Instead
    // the header opens and nothing changes; the refusal is no history step. A Replace all keeps its body replacements
    // (the header stays closed) and says why the settings were left.
    const announce = (msg) => (EditorView.announce ? [EditorView.announce.of(msg)] : []);
    const OPENED = 'Document settings opened: nothing was changed. Press the key again to change them.';
    /** (audit 4, M2) the lines a `setFocusRange` fold hides: [from, to] pairs (inclusive ends), or none. */
    const focusHidden = (state) => {
        const f = focusField ? state.field(focusField, false)?.value : null;
        if (!f || f.mode !== 'fold')
            return [];
        const doc = state.doc;
        const first = doc.lineAt(f.from);
        const last = doc.lineAt(Math.max(f.from, f.to - (f.to > f.from ? 1 : 0)));
        const out = [];
        if (first.number > 1)
            out.push([0, doc.line(first.number - 1).to]);
        if (last.number < doc.lines)
            out.push([doc.line(last.number + 1).from, doc.length]);
        return out;
    };
    const guard = EditorState?.transactionFilter ? [EditorState.transactionFilter.of((tr) => {
            if (!tr.docChanged || hooks.fromCode())
                return tr;
            if (tr.isUserEvent('undo') || tr.isUserEvent('redo'))
                return tr;
            // (audit 4, M2) text a focus fold hides: a change there is refused and the fold cleared, so it shows
            const hidden = focusHidden(tr.startState);
            if (hidden.length && focusExt) {
                let hit = false;
                // (final) ends inclusive: a deletion of the line break at a hidden region's edge joins a hidden line into view
                tr.changes.iterChangedRanges((fA, tA) => { for (const [h0, h1] of hidden)
                    if ((fA < tA && fA <= h1 && tA >= h0) || (fA === tA && fA >= h0 && fA <= h1))
                        hit = true; });
                // a caret or selection end the reader cannot see (it sits in the hidden lines): whatever the key does is unseen
                for (const r of tr.startState.selection.ranges)
                    for (const [h0, h1] of hidden)
                        if ((r.head >= h0 && r.head <= h1) || (r.anchor >= h0 && r.anchor <= h1))
                            hit = true;
                if (hit)
                    return { effects: [focusExt.effect.of(null), ...announce('The hidden text is shown again: nothing was changed. Press the key again to change it.')], scrollIntoView: true };
            }
            const v = tr.startState.field(field, false);
            if (!v?.at || v.open)
                return tr;
            const at = v.at;
            const len = tr.startState.doc.length;
            let whole = false;
            tr.changes.iterChangedRanges((fA, tA) => { if (fA === 0 && tA === len)
                whole = true; });
            // (audit 4, L1) a Replace all first: its whole-text match is no reader's select-all
            if (tr.isUserEvent('input.replace.all') && (touchesHidden(tr.changes, at) || whole)) {
                const kept = [];
                tr.changes.iterChanges((fA, tA, _fB, _tB, ins) => {
                    if (!((fA < at.to && tA > at.from) || (fA === tA && fA >= at.from && fA < at.to)))
                        kept.push({ from: fA, to: tA, insert: ins.toString() });
                });
                // (audit 4, L5) the words say what the reader then sees
                hooks.notice?.(kept.length
                    ? 'Replaced in the text. The document settings were left as they are: open them (the line at the top) to replace there too.'
                    : 'Nothing replaced: the matches are in the document settings, shown now. Press Replace all again to replace them there.');
                return kept.length ? { changes: kept, userEvent: 'input.replace.all' } : { effects: [effect.of(true), ...announce(OPENED)] };
            }
            // (audit 4, L2) a selection over the closed header (not the whole text): any change made from it — also one the
            // browser reports for the body part alone (typing over it) — opens the header instead
            const coveringStart = tr.startState.selection.ranges.some((r) => !r.empty && r.from <= at.from && r.to >= at.to);
            // (audit 4, final) a caret left at the hidden range's start or inside it (a host's setText keeps a caret where it
            // was): a key from there acts where the reader cannot see (a forward delete skips the atomic header and takes
            // the body's first word), so the header opens instead
            const caretHidden = tr.startState.selection.ranges.some((r) => r.empty && r.head >= at.from && r.head < at.to);
            if (!touchesHidden(tr.changes, at) && !coveringStart && !caretHidden)
                return tr;
            // the whole text replaced from a selection the closed line showed (audit 3, S1: drawn selected)
            if (whole && v.covered)
                return tr;
            return { effects: [effect.of(true), ...announce(OPENED)], scrollIntoView: true };
        })] : [];
    return { effect, field, inside, outside, extension: [field, decorations, ...atomic, ...keepCover, ...guard] };
}
/** What the editing surface announces about leaving it (D-129, WCAG 2.1.2). */
exports.ESC_TAB_HINT = 'Tab indents. Press Esc, then Tab, to leave the text.';
/** A line that is only a list item's marker (in its indent and quote prefix): what a list continuation writes. */
const CONTINUED_ITEM = /^((?:[ \t]*>)*[ \t]*)(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?$/;
/** A list marker typed by the reader. */
const TYPED_MARKER = /^(?:[-*+]|\d{1,9}[.)])$/;
function codemirror6Adapter(options = {}) {
    let fallback = (0, adapter_js_1.textareaAdapter)();
    let view = null;
    let cm = null;
    let extensions = [];
    let destroyed = false;
    let readyPromise = Promise.resolve({ engine: 'textarea' });
    let scrollOff = null;
    let mountOptions = null;
    /** Read-only now (mount option, then `setReadOnly`); a Compartment switches it in CodeMirror at run time. */
    let readOnlyNow = false;
    let roCompartment = null;
    /** The focus range (2.4.0): its CodeMirror field, and the range asked for before CodeMirror arrived. */
    let focus = null;
    let pendingFocus = null;
    /** The flash (2.4.0): its CodeMirror field and the timer that clears it. */
    let flashExt = null;
    let flashTimer = null;
    /** The folded header (2.7.0, D-130): its CodeMirror field, when the shell asked for it and the modules can. */
    let headerExt = null;
    /** (audit 3) > 0 while the adapter applies an edit from code: the header guard lets it through. */
    let codeEdits = 0;
    const fromCode = (fn) => { codeEdits++; try {
        return fn();
    }
    finally {
        codeEdits--;
    } };
    /** (D-95) The line a list continuation just started (its start, the marker it wrote), while the caret stays on it. */
    let continued = null;
    const noteContinuation = (state) => {
        const sel = state.selection.main;
        const line = sel.empty ? state.doc.lineAt(sel.head) : null;
        continued = line && sel.head === line.to && CONTINUED_ITEM.test(line.text) ? { from: line.from, marker: line.text } : null;
    };
    /** The space after a marker the reader typed on a continued line: their marker replaces the continued one. */
    const ownMarker = (v, from, to, text) => {
        const c = continued;
        if (!c || text !== ' ' || from !== to || readOnlyNow)
            return false;
        const line = v.state.doc.lineAt(from);
        if (line.from !== c.from || from !== line.to || !line.text.startsWith(c.marker))
            return false;
        const typed = line.text.slice(c.marker.length);
        if (!TYPED_MARKER.test(typed))
            return false;
        const start = line.from + (CONTINUED_ITEM.exec(c.marker)?.[1].length ?? 0);
        continued = null;
        v.dispatch({ changes: { from: start, to: line.to, insert: `${typed} ` }, selection: { anchor: start + typed.length + 1 }, userEvent: 'input.type' });
        return true;
    };
    const build = (m, o) => {
        const { EditorState } = m.state;
        const { EditorView, keymap } = m.view;
        const c = m.commands;
        const l = m.language;
        const ro = readOnlyNow;
        const roExtensions = (flag) => readOnlyExtensions(m, flag);
        roCompartment = m.state.Compartment ? new m.state.Compartment() : null;
        focus = focusExtension(m);
        flashExt = flashExtension(m);
        headerExt = o.headerFold ? headerFoldExtension(m, o.headerFold, focus, {
            fromCode: () => codeEdits > 0,
            // (audit 4, L4) after the transaction, and a host's failing handler never costs the reader the edit
            notice: (t) => { const fn = o.onNotice; if (!fn)
                return; queueMicrotask(() => { try {
                fn(t);
            }
            catch { /* the host's */ } }); },
        }) : null;
        // (2.5.0, STATUS D-95) Enter continues a list ("- "); a reader who then types a marker of their
        // own ("- pears") gets one marker, not "- - pears": theirs replaces the continued one when they type
        // the space after it. Only right after the continuation, on that line, with nothing else typed.
        const continueEnter = (b) => (b && b.key === 'Enter' && typeof b.run === 'function'
            ? { ...b, run: (v) => { const ok = b.run(v); if (ok)
                    noteContinuation(v.state); return ok; } }
            : b);
        const keys = [...(m.markdown.markdownKeymap ?? []).map(continueEnter), ...c.defaultKeymap, ...c.historyKeymap, ...(m.search?.searchKeymap ?? []), ...(c.indentWithTab ? [c.indentWithTab] : [])];
        return [
            m.view.highlightSpecialChars?.(),
            c.history(),
            m.view.drawSelection?.(),
            m.view.dropCursor?.(),
            l.indentOnInput?.(),
            l.bracketMatching?.(),
            l.syntaxHighlighting(exports.ORZ_HIGHLIGHTER),
            l.LanguageSupport ? new l.LanguageSupport(m.markdown.markdownLanguage) : m.markdown.markdownLanguage,
            m.view.highlightActiveLine?.(),
            m.search?.highlightSelectionMatches?.(),
            EditorView.lineWrapping,
            keymap.of(keys),
            roCompartment ? roCompartment.of(roExtensions(ro)) : roExtensions(ro),
            // (audit 1, L2; WCAG 2.1.2) the way out of the text is announced: Tab indents here
            EditorView.contentAttributes.of({ 'aria-label': o.label ?? 'Document text', 'aria-multiline': 'true', 'aria-description': exports.ESC_TAB_HINT }),
            EditorView.theme(THEME),
            ...(focus ? focus.extension : []),
            ...(flashExt ? flashExt.extension : []),
            ...(headerExt ? headerExt.extension : []),
            options.nonce && EditorView.cspNonce ? EditorView.cspNonce.of(options.nonce) : undefined,
            EditorView.inputHandler ? EditorView.inputHandler.of((v, from, to, text) => ownMarker(v, from, to, text)) : undefined,
            EditorView.updateListener.of((u) => {
                if (continued && (u.docChanged || u.selectionSet)) {
                    // the continued line stays the one the caret is on, or the chance is gone
                    const from = u.docChanged ? u.changes.mapPos(continued.from, -1) : continued.from;
                    const head = u.state.selection.main;
                    continued = head.empty && u.state.doc.lineAt(head.head).from === from ? { from, marker: continued.marker } : null;
                }
                if (u.docChanged)
                    o.onChange();
                if (u.selectionSet && o.onSelection) {
                    const r = u.state.selection.main;
                    o.onSelection({ from: r.from, to: r.to });
                }
            }),
        ].filter((x) => x !== undefined && x !== null);
    };
    const upgrade = (m, el, o) => {
        const f = fallback;
        // the textarea's CURRENT text (typed or set while CodeMirror loaded), its selection, focus, scroll and undo steps:
        // its live value first (a change whose input event has not run yet is one more step, reported to the shell; E.21)
        (0, adapter_js_1.syncTextarea)(f);
        const doc = f.getDoc();
        const history = (0, adapter_js_1.undoSteps)(f, exports.CODEMIRROR6_HISTORY_STEPS) ?? { base: doc, changes: [] };
        let sel = f.getSelection?.() ?? { from: 0, to: 0 };
        const focused = f.hasFocus?.() ?? false;
        const scroll = f.getScroll?.();
        cm = m;
        extensions = build(m, o);
        const { EditorState } = m.state;
        const iso = m.commands.isolateHistory;
        // Seed CodeMirror's history with the textarea's newest steps (A-6, MED cost-2): start from the
        // text that many undos back and apply each step's change as its own isolated, undoable change
        // (CodeMirror's text is a rope: no whole-text copy per step). Built before the textarea goes,
        // so a failure here leaves the textarea in place.
        let state = EditorState.create({ doc: history.base, extensions });
        for (const change of history.changes)
            state = fromCode(() => state.update({ changes: change, ...(iso ? { annotations: iso.of('full') } : {}) }).state);
        // the replay must end at the textarea's text; if it does not, start from that text without history
        if (state.doc.length !== doc.length || state.doc.toString() !== doc)
            state = EditorState.create({ doc, extensions });
        const len = doc.length;
        const clamp = (n) => Math.max(0, Math.min(len, n));
        // (D-130) a caret still at the very start, before a folded header, starts after it: typing there would go into
        // the header the reader does not see
        const folded = headerExt ? state.field(headerExt.field, false)?.at : null;
        if (folded && sel.from === 0 && sel.to === 0 && folded.from === 0)
            sel = { from: Math.min(len, folded.to + 1), to: Math.min(len, folded.to + 1) };
        state = state.update({ selection: { anchor: clamp(sel.from), head: clamp(sel.to) } }).state;
        f.destroy();
        fallback = null;
        // E.23: CodeMirror reads a pending DOM change on every scroll of the editor or a scroll parent
        // WITHOUT re-reading the DOM selection (DOMObserver.onScroll → flush(false)). Chrome can
        // dispatch the scroll that reveals the caret after a keystroke's text is in the DOM but before
        // CodeMirror's mutation observer has run (seen under load): the change is then applied with the
        // caret from before the key, the caret stays behind the character and every later key is typed
        // in front of it ("Second line" → "Seond linec"). So a scroll with a DOM change pending first
        // flushes it with the live selection; CodeMirror's own flush then finds nothing. Registered
        // before the view exists, so it runs before CodeMirror's listeners: capture on the shadow root
        // for the editor's own scrollers, and on the window (first listener there) for the page's.
        // `observer.flush` / `pendingRecords` are internals of the pinned bundle (E.11, E.23).
        const flushFirst = () => {
            const obs = view?.observer;
            if (!obs || typeof obs.flush !== 'function' || typeof obs.pendingRecords !== 'function')
                return;
            try {
                if (obs.pendingRecords().length > 0)
                    obs.flush(true);
            }
            catch { /* CodeMirror's own handler runs next */ }
        };
        const captureRoots = [];
        const shadow = o.root;
        if (shadow && typeof shadow.addEventListener === 'function')
            captureRoots.push(shadow);
        const win = el.ownerDocument?.defaultView;
        if (win && typeof win.addEventListener === 'function')
            captureRoots.push(win);
        for (const t of captureRoots)
            t.addEventListener('scroll', flushFirst, { capture: true, passive: true });
        const flushOff = () => { for (const t of captureRoots)
            t.removeEventListener('scroll', flushFirst, { capture: true }); };
        try {
            view = new m.view.EditorView({ state, parent: el, ...(o.root ? { root: o.root } : {}) });
        }
        catch (error) {
            flushOff();
            throw error;
        }
        const onScroll = () => o.onScroll?.();
        view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
        // (audit 1, M1; D-129) EVERY Escape starts CodeMirror's Tab-focus window — also one its keymap consumes
        // (a selection simplified, the search panel closed), which never reaches the handler that starts it: so
        // Esc then Tab always leaves the text. Capture on the editor's root element: its panels too.
        const onEscape = (e) => {
            if (e.key !== 'Escape' || e.isComposing)
                return;
            const v = view;
            if (!v || typeof v.setTabFocusMode !== 'function')
                return;
            try {
                v.setTabFocusMode(2000);
            }
            catch { /* an older CodeMirror: its own Escape handling */ }
        };
        view.dom.addEventListener('keydown', onEscape, true);
        scrollOff = () => {
            view?.scrollDOM.removeEventListener('scroll', onScroll);
            view?.dom.removeEventListener('keydown', onEscape, true);
            flushOff();
        };
        if (scroll)
            adapter.scrollTo({ fraction: scroll.fraction });
        if (focused)
            view.focus();
        // a focus range asked for while the textarea showed (clamped to the text)
        if (pendingFocus && focus) {
            const len = view.state.doc.length;
            const from = Math.max(0, Math.min(len, pendingFocus.from));
            view.dispatch({ effects: focus.effect.of({ from, to: Math.max(from, Math.min(len, pendingFocus.to)), mode: pendingFocus.mode }) });
        }
        pendingFocus = null;
    };
    /** Where the document's top lies in the scroller's content (its top padding), for the height map's offsets. */
    const docOffset = () => {
        try {
            const sd = view.scrollDOM;
            const o = view.documentTop - sd.getBoundingClientRect().top + sd.scrollTop;
            return Number.isFinite(o) ? Math.max(0, o) : 0;
        }
        catch {
            return 0;
        }
    };
    const adapter = {
        get name() { return view ? 'codemirror6' : 'textarea'; },
        mount(el, o) {
            mountOptions = o;
            readOnlyNow = o.readOnly === true;
            fallback.mount(el, o);
            const doc = el.ownerDocument;
            readyPromise = (async () => {
                let m;
                try {
                    const got = options.loadModules ? await options.loadModules() : await loadCodeMirror6(doc, { url: options.url, timeoutMs: options.timeoutMs, nonce: options.nonce });
                    if (!isCodeMirror6Modules(got))
                        throw new Error('loadModules did not provide the CodeMirror 6 exports the editor needs');
                    m = got;
                }
                catch (error) {
                    return { engine: 'textarea', error };
                }
                if (destroyed)
                    return { engine: 'none' };
                try {
                    upgrade(m, el, o);
                }
                catch (error) {
                    return { engine: fallback ? 'textarea' : 'none', error };
                }
                return { engine: 'codemirror6' };
            })();
        },
        getDoc() {
            return view ? view.state.doc.toString() : fallback?.getDoc() ?? '';
        },
        setDoc(text, o) {
            if (!view) {
                fallback?.setDoc(text, o);
                return;
            }
            const current = view.state.doc.toString();
            const change = (0, text_model_js_1.minimalChange)(current, text);
            if (o?.resetHistory) {
                const sel = view.state.selection.main;
                const map = (p) => {
                    if (!change)
                        return p;
                    const delta = change.insert.length - (change.to - change.from);
                    return p <= change.from ? p : p >= change.to ? p + delta : change.from + change.insert.length;
                };
                view.setState(cm.state.EditorState.create({ doc: text, extensions, selection: { anchor: map(sel.anchor), head: map(sel.head) } }));
                // (audit 4, final) a caret mapped to the start of a closed header (where the browser cannot draw it) goes after
                // it at once, so getSelection says where the caret is (before: it moved there unannounced at the next focus)
                if (headerExt) {
                    const v = view.state.field(headerExt.field, false);
                    const m0 = view.state.selection.main;
                    if (v?.at && !v.open && m0.empty && m0.head >= v.at.from && m0.head <= v.at.to) {
                        const after = Math.min(view.state.doc.length, v.at.to + 1);
                        fromCode(() => view.dispatch({ selection: { anchor: after } }));
                    }
                }
                // setState is not an update: report it like one
                mountOptions?.onChange();
                return;
            }
            if (!change)
                return;
            const iso = cm.commands.isolateHistory;
            fromCode(() => view.dispatch({ changes: change, ...(iso ? { annotations: iso.of('full') } : {}) }));
        },
        focus() {
            if (view)
                view.focus();
            else
                fallback?.focus();
        },
        destroy() {
            destroyed = true;
            scrollOff?.();
            scrollOff = null;
            view?.destroy();
            view = null;
            fallback?.destroy();
            fallback = null;
            mountOptions = null;
        },
        getSelection() {
            if (!view)
                return fallback?.getSelection?.() ?? { from: 0, to: 0 };
            const r = view.state.selection.main;
            return { from: r.from, to: r.to };
        },
        setReadOnly(flag) {
            readOnlyNow = flag;
            if (!view) {
                fallback?.setReadOnly?.(flag);
                return;
            }
            const { EditorState } = cm.state;
            const ext = readOnlyExtensions(cm, flag);
            if (roCompartment) {
                view.dispatch({ effects: roCompartment.reconfigure(ext) });
                return;
            }
            // modules without Compartment: rebuild the state (text and selection kept; the history starts over)
            extensions = build(cm, mountOptions ?? { doc: '', onChange() { } });
            const sel = view.state.selection.main;
            view.setState(EditorState.create({ doc: view.state.doc.toString(), extensions, selection: { anchor: sel.anchor, head: sel.head } }));
        },
        setSelection(s, o) {
            if (!view) {
                fallback?.setSelection?.(s, o);
                return;
            }
            const len = view.state.doc.length;
            const clamp = (n) => Math.max(0, Math.min(len, n));
            view.dispatch({ selection: { anchor: clamp(s.from), head: clamp(s.to) }, scrollIntoView: o?.scroll !== false });
        },
        applyChanges(changes) {
            if (!view) {
                fallback?.applyChanges?.(changes);
                return;
            }
            const list = changes.filter((c) => c.from !== c.to || c.insert !== '');
            if (list.length === 0)
                return;
            const iso = cm.commands.isolateHistory;
            // one transaction = one undoable step; the selection maps through every change
            fromCode(() => view.dispatch({ changes: list.map((c) => ({ from: c.from, to: c.to, insert: c.insert })), ...(iso ? { annotations: iso.of('full') } : {}) }));
        },
        setFocusRange(range, o) {
            const value = range ? { from: Math.min(range.from, range.to), to: Math.max(range.from, range.to), mode: o?.mode === 'fold' ? 'fold' : 'dim' } : null;
            if (!view) {
                pendingFocus = value;
                return;
            }
            if (!focus)
                return; // modules without the decoration API: everything stays shown
            // (audit 4, M2) folding away the caret's line would leave it where the reader cannot see it: it goes to the range
            let sel;
            if (value && value.mode === 'fold') {
                const doc = view.state.doc;
                const a = Math.max(0, Math.min(doc.length, value.from));
                const first = doc.lineAt(a);
                const last = doc.lineAt(Math.max(a, Math.min(doc.length, value.to - (value.to > value.from ? 1 : 0))));
                if (view.state.selection.ranges.some((r) => r.head < first.from || r.head > last.to || r.anchor < first.from || r.anchor > last.to))
                    sel = { anchor: a };
            }
            view.dispatch({ effects: focus.effect.of(value), ...(sel ? { selection: sel } : {}) });
        },
        flash(ranges, o) {
            if (!view || !flashExt)
                return; // the textarea (and a build without the decoration API): nothing lights up
            if (flashTimer !== null)
                clearTimeout(flashTimer);
            const ms = typeof o?.ms === 'number' && o.ms > 0 ? Math.min(10000, o.ms) : 1600;
            view.dom?.style?.setProperty?.('--orz-flash-ms', `${ms}ms`);
            view.dispatch({ effects: flashExt.effect.of(ranges.map((r) => ({ from: r.from, to: r.to }))) });
            const ext = flashExt;
            flashTimer = setTimeout(() => { flashTimer = null; if (view && ext)
                view.dispatch({ effects: ext.effect.of(null) }); }, ms);
        },
        reveal(s, o) {
            if (!view) {
                fallback?.setSelection?.(o?.select ? s : { from: s.from, to: s.from }, { scroll: false });
                const before = (fallback?.getDoc() ?? '').slice(0, Math.max(0, s.from));
                let line = 0;
                for (let i = before.indexOf('\n'); i >= 0; i = before.indexOf('\n', i + 1))
                    line++;
                fallback?.scrollTo?.({ line });
                return;
            }
            const len = view.state.doc.length;
            const clamp = (n) => Math.max(0, Math.min(len, n));
            const from = clamp(Math.min(s.from, s.to));
            const to = clamp(Math.max(s.from, s.to));
            const { EditorView } = cm.view;
            // the range's first line at the top of the view (a heading above its section), not merely in view
            view.dispatch({
                selection: { anchor: from, head: o?.select ? to : from },
                ...(typeof EditorView.scrollIntoView === 'function' ? { effects: EditorView.scrollIntoView(from, { y: 'start', yMargin: 8 }) } : { scrollIntoView: true }),
            });
        },
        setHeaderFolded(flag) {
            if (!view || !headerExt)
                return;
            const v = view.state.field(headerExt.field, false);
            if (!v?.at)
                return;
            // folding with an end of the selection inside moves that end after the header (audit 2: the anchor too) —
            // also when it is already closed (audit 3: a reload can leave the caret there)
            const fix = flag && headerExt.inside(v.at, view.state.selection);
            if (v.open === !flag && !fix)
                return;
            view.dispatch({ effects: headerExt.effect.of(!flag), ...(fix ? { selection: headerExt.outside(v.at, view.state.selection, view.state.doc.length) } : {}) });
        },
        isHeaderFolded() {
            if (!view || !headerExt)
                return false;
            const v = view.state.field(headerExt.field, false);
            return !!v?.at && !v.open;
        },
        hasFocus() {
            return view ? view.hasFocus === true : fallback?.hasFocus?.() ?? false;
        },
        undo() {
            return view ? cm.commands.undo(view) === true : fallback?.undo?.() ?? false;
        },
        redo() {
            return view ? cm.commands.redo(view) === true : fallback?.redo?.() ?? false;
        },
        getScroll() {
            if (!view)
                return fallback?.getScroll?.() ?? { line: 0, fraction: 0 };
            const sd = view.scrollDOM;
            const top = sd.scrollTop;
            const max = Math.max(0, sd.scrollHeight - sd.clientHeight);
            // (audit 1, H1) heights are from the document's top, which lies below the content's padding
            const block = view.lineBlockAtHeight(Math.max(0, top - docOffset()));
            const line = view.state.doc.lineAt(block.from).number - 1;
            const within = block.height > 0 ? Math.max(0, Math.min(1, (top - docOffset() - block.top) / block.height)) : 0;
            return { line: line + within, fraction: max > 0 ? Math.min(1, top / max) : 0 };
        },
        scrollTo(target) {
            if (!view) {
                fallback?.scrollTo?.(target);
                return;
            }
            const sd = view.scrollDOM;
            if (typeof target.line === 'number' && Number.isFinite(target.line)) {
                const d = view.state.doc;
                const n = Math.max(0, Math.min(d.lines - 1, Math.floor(target.line)));
                const block = view.lineBlockAt(d.line(n + 1).from);
                const y = block.top + Math.max(0, Math.min(1, target.line - n)) * block.height;
                // the first line at the top shows the padding above it too (scrollTop 0)
                sd.scrollTop = y <= 0 ? 0 : docOffset() + y;
            }
            else if (typeof target.fraction === 'number' && Number.isFinite(target.fraction)) {
                sd.scrollTop = Math.max(0, Math.min(1, target.fraction)) * Math.max(0, sd.scrollHeight - sd.clientHeight);
            }
        },
        ready: () => readyPromise,
    };
    return adapter;
}
//# sourceMappingURL=codemirror6.js.map