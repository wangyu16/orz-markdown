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
import { askSaveConflict, focusConflictQuestion } from './chrome.js';
import type { Saver, SaveInput, SaveResult } from './save.js';
import type { ShadowRootLike, UiElement } from './types.js';

/** What a caller of {@link answerSaveConflict} learns. */
export type SaveConflictAnswer =
  /** The reader chose Replace it: `result` is the saver's outcome of writing `input` (`stale-conflict`: nothing written). */
  | { choice: 'replace'; input: SaveInput; result: SaveResult }
  /** The reader chose Download a copy instead: `result` is the download's outcome; the file on disk is unchanged. */
  | { choice: 'download'; input: SaveInput; result: SaveResult }
  /** Dismissed (Escape, Dismiss), or the question went away with its root: nothing written. */
  | { choice: null }
  /** A newer save of the same saver now owns the question: this caller's text is never written. */
  | { choice: 'superseded' };

export interface SaveConflictRequest {
  /** The saver the page and its editors share: the question is one per saver object. */
  saver: Saver;
  /** Where the question is shown when none is open (the caller's chrome root). */
  root: ShadowRootLike | UiElement;
  /** What this save writes if the reader replaces the file. */
  input: SaveInput;
  /** The saver's `conflict` outcome of this save; absent when the save called no saver (a question was open). */
  result?: SaveResult;
  /** `false`: an editor with no opened file (`SAVE_CONFLICT_PICKED_MESSAGE`). Taken from the save that opens the question. */
  opened?: boolean;
  /** The element focused before this save: the focus goes back there after the answer (a save from another root re-targets it). */
  returnFocus?: { focus?(options?: { preventScroll?: boolean }): void } | null;
}

/** Said when Replace it found the conflict no longer pending (the saver refused: nothing written). */
export const SAVE_CONFLICT_STALE = 'Nothing was written: the file was checked again since this question. Save again.';

interface Pending {
  root: ShadowRootLike | UiElement;
  input: SaveInput;
  token?: number;
  name?: string;
  opened?: boolean;
  returnFocus: SaveConflictRequest['returnFocus'];
  settle(answer: SaveConflictAnswer): void;
  asks: number;
}

const questions = new WeakMap<object, Pending>();

/** A conflict question of this saver is open: a save must not call the saver but {@link answerSaveConflict}. */
export function saveConflictOpen(saver: object): boolean {
  return questions.has(saver);
}

/**
 * Focus the open conflict question of `saver`, wherever it is shown (round 5
 * of the carrier-app loop, B4: Update now while it is open refuses and points
 * the reader at it). False when none is open.
 */
export function focusSaveConflict(saver: object): boolean {
  const q = questions.get(saver);
  return !!q && focusConflictQuestion(q.root);
}

/**
 * Ask the reader about a save of `saver` that found the file changed on disk
 * — or, while that saver's question is open, re-target the open question to
 * this newer text (focused, in the root it is shown in). Resolves this
 * caller's answer; never rejects.
 */
export function answerSaveConflict(req: SaveConflictRequest): Promise<SaveConflictAnswer> {
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
        if (found.name) q.name = found.name;
      }
      // a save from another surface (an editor over the page's question): the focus goes back there
      if (req.root !== q.root && req.returnFocus) q.returnFocus = req.returnFocus;
    } else {
      q = { root: req.root, input: req.input, ...(found?.conflictToken !== undefined ? { token: found.conflictToken } : {}), ...(found?.name ? { name: found.name } : {}), ...(req.opened === false ? { opened: false } : {}), returnFocus: req.returnFocus ?? null, settle: resolve, asks: 0 };
      questions.set(saver, q);
    }
    const entry = q;
    const ask = ++entry.asks;
    void askSaveConflict(entry.root, entry.name, entry.opened === false ? { opened: false } : {}).then(async (choice) => {
      // a later ask of this question answers (askSaveConflict resolved this one null), or it was dropped
      if (ask !== entry.asks || questions.get(saver) !== entry) return;
      questions.delete(saver);
      const settle = entry.settle;
      entry.settle = () => undefined;
      try { entry.returnFocus?.focus?.({ preventScroll: true }); } catch { /* gone */ }
      try {
        if (choice === 'replace') {
          const result = await saver.save(entry.input, { overwrite: true, ...(entry.token !== undefined ? { conflictToken: entry.token } : {}) });
          settle({ choice: 'replace', input: entry.input, result });
        } else if (choice === 'download') {
          settle({ choice: 'download', input: entry.input, result: await saver.download({ html: entry.input.html }) });
        } else settle({ choice: null });
      } catch (e) {
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
export function dropSaveConflict(saver: object, root?: ShadowRootLike | UiElement): void {
  const q = questions.get(saver);
  if (!q || (root !== undefined && q.root !== root)) return;
  questions.delete(saver);
  const settle = q.settle;
  q.settle = () => undefined;
  settle({ choice: null });
}
