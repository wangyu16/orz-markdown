import type { Saver, SaveInput, SaveResult } from './save.js';
import type { ShadowRootLike, UiElement } from './types.js';
/** What a caller of {@link answerSaveConflict} learns. */
export type SaveConflictAnswer = 
/** The reader chose Replace it: `result` is the saver's outcome of writing `input` (`stale-conflict`: nothing written). */
{
    choice: 'replace';
    input: SaveInput;
    result: SaveResult;
}
/** The reader chose Download a copy instead: `result` is the download's outcome; the file on disk is unchanged. */
 | {
    choice: 'download';
    input: SaveInput;
    result: SaveResult;
}
/** Dismissed (Escape, Dismiss), or the question went away with its root: nothing written. */
 | {
    choice: null;
}
/** A newer save of the same saver now owns the question: this caller's text is never written. */
 | {
    choice: 'superseded';
};
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
    returnFocus?: {
        focus?(options?: {
            preventScroll?: boolean;
        }): void;
    } | null;
}
/** Said when Replace it found the conflict no longer pending (the saver refused: nothing written). */
export declare const SAVE_CONFLICT_STALE = "Nothing was written: the file was checked again since this question. Save again.";
/** A conflict question of this saver is open: a save must not call the saver but {@link answerSaveConflict}. */
export declare function saveConflictOpen(saver: object): boolean;
/**
 * Ask the reader about a save of `saver` that found the file changed on disk
 * — or, while that saver's question is open, re-target the open question to
 * this newer text (focused, in the root it is shown in). Resolves this
 * caller's answer; never rejects.
 */
export declare function answerSaveConflict(req: SaveConflictRequest): Promise<SaveConflictAnswer>;
/**
 * The question's root goes away (an editor destroyed, the app disposed): its
 * open question of `saver` — shown in `root`, or any when `root` is omitted —
 * is dropped and its caller told `null` (nothing written). The next save asks again.
 */
export declare function dropSaveConflict(saver: object, root?: ShadowRootLike | UiElement): void;
//# sourceMappingURL=conflict.d.ts.map