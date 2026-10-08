"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SAVE_CONFLICT_STALE = void 0;
exports.saveConflictOpen = saveConflictOpen;
exports.answerSaveConflict = answerSaveConflict;
exports.dropSaveConflict = dropSaveConflict;
/**
 * One conflict question per saver (round 4 of the carrier-app loop, F2;
 * spec/shell-runtime.md §1 step 3.4, spec/carrier-app.md §4.5). A page and
 * every editor of its file save through ONE saver; a save that finds the file
 * changed on disk asks the reader once, and every later save of that saver —
 * the page's or any editor's — while the question is open calls no saver (no
 * second picker): it focuses the open question, wherever it is shown, and
 * makes it answer for that newest text. The older caller is told
 * `superseded` and writes nothing. "Replace it" then calls `save(input, {
 * overwrite: true, conflictToken })` with the token of the conflict the saver
 * still has pending, so an answer to an outdated conflict writes nothing.
 *
 * Reads no page DOM: the caller passes where the focus goes back.
 */
const chrome_js_1 = require("./chrome.js");
/** Said when Replace it found the conflict no longer pending (the saver refused: nothing written). */
exports.SAVE_CONFLICT_STALE = 'Nothing was written: the file was checked again since this question. Save again.';
const questions = new WeakMap();
/** A conflict question of this saver is open: a save must not call the saver but {@link answerSaveConflict}. */
function saveConflictOpen(saver) {
    return questions.has(saver);
}
/**
 * Ask the reader about a save of `saver` that found the file changed on disk
 * — or, while that saver's question is open, re-target the open question to
 * this newer text (focused, in the root it is shown in). Resolves this
 * caller's answer; never rejects.
 */
function answerSaveConflict(req) {
    const { saver } = req;
    const found = req.result && req.result.via === 'file' && req.result.conflict === true ? req.result : undefined;
    return new Promise((resolve) => {
        let q = questions.get(saver);
        if (q) {
            const older = q.settle;
            q.settle = resolve;
            older({ choice: 'superseded' });
            q.input = req.input;
            if (found) {
                q.token = found.conflictToken;
                if (found.name)
                    q.name = found.name;
            }
            // a save from another surface (an editor over the page's question): the focus goes back there
            if (req.root !== q.root && req.returnFocus)
                q.returnFocus = req.returnFocus;
        }
        else {
            q = { root: req.root, input: req.input, ...(found?.conflictToken !== undefined ? { token: found.conflictToken } : {}), ...(found?.name ? { name: found.name } : {}), ...(req.opened === false ? { opened: false } : {}), returnFocus: req.returnFocus ?? null, settle: resolve, asks: 0 };
            questions.set(saver, q);
        }
        const entry = q;
        const ask = ++entry.asks;
        void (0, chrome_js_1.askSaveConflict)(entry.root, entry.name, entry.opened === false ? { opened: false } : {}).then(async (choice) => {
            // a later ask of this question answers (askSaveConflict resolved this one null), or it was dropped
            if (ask !== entry.asks || questions.get(saver) !== entry)
                return;
            questions.delete(saver);
            const settle = entry.settle;
            entry.settle = () => undefined;
            try {
                entry.returnFocus?.focus?.({ preventScroll: true });
            }
            catch { /* gone */ }
            try {
                if (choice === 'replace') {
                    const result = await saver.save(entry.input, { overwrite: true, ...(entry.token !== undefined ? { conflictToken: entry.token } : {}) });
                    settle({ choice: 'replace', input: entry.input, result });
                }
                else if (choice === 'download') {
                    settle({ choice: 'download', input: entry.input, result: await saver.download({ html: entry.input.html }) });
                }
                else
                    settle({ choice: null });
            }
            catch (e) {
                const error = e instanceof Error ? e.message : String(e);
                settle(choice === 'download'
                    ? { choice: 'download', input: entry.input, result: { via: 'download', ok: false, confirmed: false, error } }
                    : { choice: 'replace', input: entry.input, result: { via: 'file', ok: false, error, picked: false, opened: false } });
            }
        });
    });
}
/**
 * The question's root goes away (an editor destroyed, the app disposed): its
 * open question of `saver` — shown in `root`, or any when `root` is omitted —
 * is dropped and its caller told `null` (nothing written). The next save asks again.
 */
function dropSaveConflict(saver, root) {
    const q = questions.get(saver);
    if (!q || (root !== undefined && q.root !== root))
        return;
    questions.delete(saver);
    const settle = q.settle;
    q.settle = () => undefined;
    settle({ choice: null });
}
//# sourceMappingURL=conflict.js.map