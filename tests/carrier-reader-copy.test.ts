/**
 * Reader copies and the host's editor words (orz-markdown 2.9.0; owner decision
 * 2026-11-17, STATUS D-144, D-149; FC-18 §8.2 `readerCopy`, FC-19 §3/§4
 * `words` / `setWords`): claims K.37 and E.56 in notes/CLAIMS.md. The app's
 * half is A.34 (tests/carrier-app.test.ts), the real-Chrome half A.35
 * (tests/carrier-links-chrome.test.ts).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assembleEnvelope, extract, readerCopy, readReaderCopy, readerCopyNotice, READER_COPY_NOTICE, READER_COPY_NOTICE_MAX,
  type Kind, type ShellParts,
} from '../src/carrier';
import * as read from '../src/carrier/read';
import { createEditorShell, textareaAdapter, renderMarkdownPreview, type EditorShell, type EditorShellOptions, type EdElement } from '../src/carrier/editor';
import type { StorageLike } from '../src/carrier/shell';

const ROOT = 'tests/carrier-corpus';
const manifest = JSON.parse(readFileSync(`${ROOT}/manifest.json`, 'utf8')) as { files: Array<{ path: string; kind: Kind }> };
const corpus = manifest.files.map((f) => ({ ...f, text: readFileSync(`${ROOT}/${f.path}`).toString('utf8') }));
const parts = (kind: Kind, over: Partial<ShellParts> = {}): ShellParts => ({ kind, shellVersion: '1.2.3', headHtml: '<style>x</style>', bodyHtml: '<div id="orz-app"></div>', ...over });
const shellOf = (html: string): string => /<script type="application\/json" id="orz-shell">([^<]*)<\/script>/.exec(html)![1];
const NOTICE = 'You’re editing your own copy. Changes can’t be saved to this website — use “Download a copy” to keep them.';

describe('readerCopy (FC-18 §8.2)', () => {
  it('[K.37] readerCopy validates and normalizes: undefined, null and false are none; true and {} the kit\'s words ({}); { notice } keeps the notice with its spaces collapsed and trimmed; an unknown key, a notice that is not a string, empty, longer than 300 characters or holding a control character, an array or another type throw; readReaderCopy reads the same without throwing (null); the parser-free entry has the API; the kit\'s words are the student-plain default', () => {
    for (const none of [undefined, null, false]) expect(readerCopy(none)).toBeNull();
    expect(readerCopy(true)).toEqual({});
    expect(readerCopy({})).toEqual({});
    expect(readerCopy({ notice: undefined })).toEqual({});
    expect(readerCopy({ notice: '  Edits stay\n\tyours.  ' })).toEqual({ notice: 'Edits stay yours.' });
    expect(readerCopy({ notice: 'x'.repeat(READER_COPY_NOTICE_MAX) })!.notice!.length).toBe(300);
    const bad: unknown[] = [{ notice: '' }, { notice: '  \n ' }, { notice: 7 }, { notice: null }, { notice: 'x'.repeat(301) }, { notice: 'a\u0000b' }, { notice: 'a\u2028b' }, { notice: 'a\u007fb' }, { text: 'x' }, ['x'], 'yes', 1];
    for (const b of bad) {
      expect(() => readerCopy(b), JSON.stringify(b)).toThrow(TypeError);
      expect(readReaderCopy(b)).toBeNull();
    }
    expect(READER_COPY_NOTICE).toBe(NOTICE);
    expect(readerCopyNotice({})).toBe(NOTICE);
    expect(readerCopyNotice(null)).toBe(NOTICE);
    expect(readerCopyNotice({ notice: 'Mine.' })).toBe('Mine.');
    // the parser-free entry carries only the rule (audit MEDIUM-1: reader-copy.ts stays out of it)
    for (const name of ['readReaderCopy', 'READER_COPY_NOTICE_MAX']) expect(name in read, name).toBe(true);
    for (const name of ['readerCopy', 'readerCopyNotice', 'READER_COPY_NOTICE']) expect(name in read, name).toBe(false);
    expect(read.readReaderCopy).toBe(readReaderCopy);
  });

  it('[K.37] (audit LOW-2) a notice must show something: format characters (bidi overrides, zero-width spaces, BOM, soft hyphen), unpaired surrogates and text with nothing visible (no-break or ideographic spaces, a lone joiner or combining mark) are refused — readerCopy throws, readReaderCopy and extract read none — while the zero-width joiner and non-joiner inside real text (an emoji sequence, Persian) are kept; the length is counted in UTF-16 code units; readerCopy and readReaderCopy always agree', () => {
    const refused = ['abc\u202edef', 'a\u200bb', 'No\ufeffte', 'soft\u00adhyphen', 'a\u2066b\u2069', 'lone \ud800 half', 'x\udc00', '\u00a0', '\u3000\u3000', '\u200d', '\u200c', '\u0301', ' \u00a0\u200d '];
    for (const notice of refused) {
      expect(() => readerCopy({ notice }), JSON.stringify(notice)).toThrow(TypeError);
      expect(readReaderCopy({ notice }), JSON.stringify(notice)).toBeNull();
    }
    for (const notice of ['Edits stay yours 👩\u200d💻.', 'می\u200cخواهم', 'Café — naïve “quotes”.', '日本語のコピーです。']) {
      expect(readerCopy({ notice }), notice).toEqual({ notice });
      expect(readReaderCopy({ notice })).toEqual({ notice });
    }
    // UTF-16 code units: 150 astral characters are 300 units (accepted), 151 are 302 (refused)
    expect(readerCopy({ notice: '😀'.repeat(150) })!.notice!.length).toBe(300);
    expect(() => readerCopy({ notice: '😀'.repeat(151) })).toThrow(/UTF-16/);
    const forged = assembleEnvelope(corpus[0].text, parts('md', { readerCopy: true })).replace('"readerCopy":{}', '"readerCopy":{"notice":"\\u202e"}');
    expect(extract(forged)!.readerCopy).toBeUndefined();
    for (const v of [true, {}, { notice: 'x' }, { notice: ' \u00a0 ' }, { notice: 'a\u200bb' }, { notice: 3 }, { other: 1 }, [], 'x', 0, NaN, { notice: undefined }]) {
      let thrown = false;
      let got: unknown = null;
      try { got = readerCopy(v); } catch { thrown = true; }
      expect(thrown ? null : got, JSON.stringify(v)).toEqual(readReaderCopy(v));
    }
  });

  it('[K.37] without readerCopy (absent, false, null) every corpus file is byte for byte what the kit assembled before, with no "readerCopy" in #orz-shell; with it the setting is stored normalized as #orz-shell "readerCopy" (after delivery and links), extract gives it back, and assemble → extract → assemble with it is byte-identical (FC-18 laws 1–3); the notice is JSON-escaped in the island; a file whose "readerCopy" is invalid extracts without it; an invalid setting throws', () => {
    for (const f of corpus) {
      for (const delivery of ['inline', 'cdn'] as const) {
        const base = assembleEnvelope(f.text, parts(f.kind, { delivery }));
        expect(shellOf(base)).not.toContain('readerCopy');
        for (const none of [undefined, false, null]) expect(assembleEnvelope(f.text, parts(f.kind, { delivery, readerCopy: none })) === base, `${f.path} ${String(none)}`).toBe(true);
        const html = assembleEnvelope(f.text, parts(f.kind, { delivery, readerCopy: true }));
        expect(html.replace(',"readerCopy":{}', '') === base).toBe(true);
        const x = extract(html)!;
        expect(x.text === f.text).toBe(true);
        expect(x.readerCopy).toEqual({});
        expect(assembleEnvelope(x.text, parts(f.kind, { delivery, readerCopy: x.readerCopy })) === html).toBe(true);
        expect(extract(base)!.readerCopy).toBeUndefined();
      }
    }
    const text = corpus[0].text;
    const linked = assembleEnvelope(text, parts('md', { twinLinks: { md: '{stem}.html' }, readerCopy: { notice: ' A </script> <b>note</b> ' } }));
    expect(shellOf(linked)).toBe('{"kind":"md","format":1,"shell":"1.2.3","delivery":"inline","links":{"md":"{stem}.html"},"readerCopy":{"notice":"A \\u003c/script> \\u003cb>note\\u003c/b>"}}');
    expect(extract(linked)!.readerCopy).toEqual({ notice: 'A </script> <b>note</b>' });
    expect(extract(linked)!.twinLinks).toEqual({ md: '{stem}.html' });
    const forged = assembleEnvelope(text, parts('md', { readerCopy: true })).replace('"readerCopy":{}', '"readerCopy":{"notice":7}');
    expect(extract(forged)!.readerCopy).toBeUndefined();
    expect(() => assembleEnvelope(text, parts('md', { readerCopy: { notice: '' } }))).toThrow(TypeError);
    expect(() => assembleEnvelope(text, parts('md', { readerCopy: 'yes' as never }))).toThrow(TypeError);
  });
});

// ── the host's words (D-144, D-149) ──────────────────────────────────────

const TEXT = '{{nyml\nkind: document\ntitle: Words\nuid: doc-wordswordswords01\n}}\n\n# Words\n\nText.\n';

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } };
}

let HappyWindow: typeof import('happy-dom').Window;
beforeAll(async () => {
  ({ Window: HappyWindow } = await import('happy-dom'));
});

type Mounted = { shell: EditorShell; root: ShadowRoot; win: InstanceType<typeof HappyWindow> };
function mount(opts: Partial<EditorShellOptions> = {}): Mounted {
  const win = new HappyWindow({ url: 'https://app.example/edit' });
  const document = win.document as unknown as Document;
  const div = document.createElement('div');
  document.body.appendChild(div);
  const shell = createEditorShell(div as unknown as EdElement, {
    text: TEXT,
    render: (t) => renderMarkdownPreview(t),
    adapter: textareaAdapter(),
    storage: memoryStorage(),
    preview: { assets: false, debounceMs: 10 },
    ...opts,
  });
  return { shell, root: shell.root as unknown as ShadowRoot, win };
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const saveOf = (m: Mounted) => {
  const b = m.root.querySelector('.orz-editor__save') as HTMLElement;
  return { label: b.querySelector('.orz-editor__label')!.textContent, aria: b.getAttribute('aria-label'), title: b.title };
};
const noteOf = (m: Mounted) => {
  const n = m.root.querySelector('#orz-host-note');
  return n ? { text: n.querySelector('.orz-editor__notice-text')!.textContent, role: n.getAttribute('role'), html: n.querySelector('.orz-editor__notice-text')!.innerHTML } : null;
};
const statusOf = (m: Mounted) => ({ text: m.root.querySelector('.orz-editor__status-text')?.textContent ?? null, tone: m.root.querySelector('.orz-editor')?.getAttribute('data-save-tone') ?? null });
const toasts = (m: Mounted) => [...m.root.querySelectorAll('.orz-toast__message')].map((n) => n.textContent ?? '');
const edit = (m: Mounted) => {
  const ta = m.root.querySelector('textarea')!;
  ta.value += '!';
  ta.dispatchEvent(new m.win.InputEvent('input', { inputType: 'insertText', data: '!', bubbles: true }) as unknown as Event);
};

describe('the host\'s words (FC-19 §3/§4, D-144, D-149)', () => {
  it('[E.56] words.save names the Save button (label, accessible name, title with the shortcut) and setWords changes it later (null: the default, "Save" or "Save now" with hooks.saveStatus); words.saved is the toast after a save that worked ("" no toast; null the default); a key left out keeps its word; without words nothing changes', async () => {
    const plain = mount({ hooks: { save: async () => undefined } });
    expect(saveOf(plain).label).toBe('Save');
    expect(noteOf(plain)).toBeNull();
    edit(plain);
    await plain.shell.save();
    expect(toasts(plain)).toEqual(['Saved.']);
    plain.shell.destroy();

    const m = mount({ hooks: { save: async () => undefined }, words: { save: '  Download\n a copy ', saved: 'Kept on this device.' } });
    expect(saveOf(m)).toEqual({ label: 'Download a copy', aria: 'Download a copy', title: expect.stringMatching(/^Download a copy \((⌘|Ctrl\+)S\)$/) as unknown as string });
    edit(m);
    await m.shell.save();
    expect(toasts(m)).toEqual(['Kept on this device.']);
    m.shell.setWords({ saved: '' });
    expect(saveOf(m).label).toBe('Download a copy'); // left out: kept
    edit(m);
    expect(await m.shell.save()).toMatchObject({ ok: true });
    expect(toasts(m)).toEqual(['Kept on this device.']); // no second toast
    m.shell.setWords({ save: null, saved: null });
    expect(saveOf(m)).toMatchObject({ label: 'Save', aria: 'Save' });
    edit(m);
    await m.shell.save();
    expect(toasts(m).at(-1)).toBe('Saved.');
    m.shell.setWords({ save: '   ' }); // empty: the default
    expect(saveOf(m).label).toBe('Save');
    m.shell.destroy();
    m.shell.setWords({ save: 'After' }); // nothing after destroy
    expect(saveOf(m).label).toBe('Save');

    // (audit LOW-4) a key given as undefined is a key left out: it keeps its word
    const u = mount({ hooks: { save: async () => undefined }, words: { save: 'Keep me', saved: 'Kept.', notice: 'Stays.' } });
    u.shell.setWords({ save: undefined, saved: undefined, notice: undefined });
    expect([saveOf(u).label, noteOf(u)?.text]).toEqual(['Keep me', 'Stays.']);
    edit(u);
    await u.shell.save();
    expect(toasts(u)).toEqual(['Kept.']);
    u.shell.destroy();

    const s = mount({ hooks: { save: async () => undefined, saveStatus: () => null } });
    expect(saveOf(s).label).toBe('Save now');
    s.shell.setWords({ save: 'Download a copy' });
    expect(saveOf(s).label).toBe('Download a copy');
    s.shell.setWords({ save: null });
    expect(saveOf(s).label).toBe('Save now');
    s.shell.destroy();
  });

  it('[E.56] (audit LOW-5) words.saved is the toast only for a save that went through the host (hooks.save or the host protocol): a save that fell back to a download keeps "Download started." and a file save "Saved."', async () => {
    const assemble = (t: string) => `<!doctype html><script id="orz-src">${t}</script>`;
    const withSaver = (via: 'host' | 'file' | 'download') => mount({
      assemble, standalone: true, words: { saved: 'Saved to your workspace.' },
      saver: {
        save: async () => (via === 'download' ? { via, ok: true, confirmed: false } : via === 'file' ? { via, ok: true, picked: false, opened: true } : { via, ok: true }),
        download: async () => ({ via: 'download', ok: true, confirmed: false }),
        handleKey: () => null,
      } as never,
    });
    for (const [via, said] of [['host', 'Saved to your workspace.'], ['download', 'Download started.'], ['file', 'Saved.']] as const) {
      const m = withSaver(via);
      edit(m);
      expect(await m.shell.save(), via).toMatchObject({ ok: true, via });
      expect(toasts(m), via).toEqual([said]);
      m.shell.destroy();
    }
  });

  it('[E.57] (2.10.0, D-154) words.status names the save status the shell says itself: clean words replace "Saved" with a neutral dot (pending, never the green saved), dirty words replace "Unsaved changes" (amber); a key empty, null or left out keeps that state\'s default; setWords changes them at once (null: both defaults; undefined: kept); hooks.saveStatus still wins; without them nothing changes', async () => {
    const plain = mount({ hooks: { save: async () => undefined } });
    expect(statusOf(plain)).toEqual({ text: 'Saved', tone: 'saved' });
    plain.shell.destroy();

    const m = mount({ hooks: { save: async () => undefined }, words: { status: { clean: '  Not saved:\n download to keep ', dirty: 'Not saved: download to keep' } } });
    expect(statusOf(m)).toEqual({ text: 'Not saved: download to keep', tone: 'pending' });
    edit(m);
    expect(statusOf(m)).toEqual({ text: 'Not saved: download to keep', tone: 'unsaved' });
    await m.shell.save();
    expect(statusOf(m)).toEqual({ text: 'Not saved: download to keep', tone: 'pending' });
    m.shell.setWords({ status: { clean: 'Copy downloaded', dirty: 'Not saved: download to keep' } });
    expect(statusOf(m)).toEqual({ text: 'Copy downloaded', tone: 'pending' });
    m.shell.setWords({ save: 'Download a copy' }); // status left out: kept
    expect(statusOf(m).text).toBe('Copy downloaded');
    m.shell.setWords({ status: undefined });
    expect(statusOf(m).text).toBe('Copy downloaded');
    m.shell.setWords({ status: { clean: '  ' } }); // empty clean: the default; dirty left out: the default
    expect(statusOf(m)).toEqual({ text: 'Saved', tone: 'saved' });
    m.shell.setWords({ status: { dirty: 'Edits not kept' } });
    edit(m);
    expect(statusOf(m)).toEqual({ text: 'Edits not kept', tone: 'unsaved' });
    m.shell.setWords({ status: null });
    expect(statusOf(m)).toEqual({ text: 'Unsaved changes', tone: 'unsaved' });
    m.shell.destroy();

    // the host's hook wins; when it gives nothing, the words are the base
    const h = mount({ hooks: { save: async () => undefined, saveStatus: ({ dirty }) => (dirty ? 'Saving soon' : null) }, words: { status: { clean: 'Copy downloaded' } } });
    expect(statusOf(h)).toEqual({ text: 'Copy downloaded', tone: 'pending' });
    edit(h);
    expect(statusOf(h)).toEqual({ text: 'Saving soon', tone: 'pending' });
    h.shell.destroy();
  });

  it('[E.56] words.notice shows a notice above the panes (role status, plain text — never markup — with Dismiss); Dismiss hides it until it changes; setWords replaces it or (null, empty) removes it; the same notice again stays dismissed', async () => {
    const m = mount({ hooks: { save: async () => undefined }, words: { notice: 'Your <b>own</b> copy.' } });
    expect(noteOf(m)).toEqual({ text: 'Your <b>own</b> copy.', role: 'status', html: 'Your &lt;b&gt;own&lt;/b&gt; copy.' });
    const slot = m.root.querySelector('#orz-host-note')!.parentElement!;
    expect(slot.hidden).toBe(false);
    // above the panes
    const order = [...m.root.querySelector('.orz-editor')!.children];
    expect(order.indexOf(slot)).toBeLessThan(order.indexOf(m.root.querySelector('.orz-editor__panes')!));
    (m.root.querySelector('#orz-host-note button') as HTMLElement).click();
    expect([noteOf(m), slot.hidden]).toEqual([null, true]);
    m.shell.setWords({ notice: 'Your <b>own</b> copy.' }); // unchanged: stays dismissed
    expect(noteOf(m)).toBeNull();
    m.shell.setWords({ notice: 'Changed.' });
    expect(noteOf(m)?.text).toBe('Changed.');
    m.shell.setWords({ notice: 'Again.' });
    expect(m.root.querySelectorAll('#orz-host-note').length).toBe(1);
    m.shell.setWords({ notice: null });
    expect([noteOf(m), slot.hidden]).toEqual([null, true]);
    m.shell.setWords({ notice: 'Back.' });
    expect(noteOf(m)?.text).toBe('Back.');
    m.shell.setWords({ notice: '  ' });
    expect(noteOf(m)).toBeNull();
    await tick();
    m.shell.destroy();
  });
});
