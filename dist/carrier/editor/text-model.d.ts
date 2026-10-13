type Eol = '\n' | '\r\n' | '\r';
/** The editor (LF, no BOM) form of an exact text. */
export declare function toEditorText(text: string): string;
/**
 * An offset in an exact text → the offset in its editor form (2.4.0): the
 * BOM and the CR of every CR LF before it do not count. An offset between
 * the CR and the LF of a pair maps to the pair's line break.
 */
export declare function toEditorOffset(exact: string, offset: number): number;
/**
 * A copy of a string that shares no storage with the string it was cut
 * from. V8 keeps a slice of 13 or more characters as a view on its parent,
 * so a short patch cut from a 1 MB text would keep the whole text alive;
 * concatenating and slicing again makes V8 flatten into a fresh string.
 */
export declare function detachString(s: string): string;
export interface TextModel {
    /** Adopt an exact text: its BOM and line-ending style become the document's; returns its editor form. */
    adopt(text: string): string;
    /**
     * The exact text for an editor text. When it is the editor form of a
     * remembered text, that text's BOM and line-ending style become the
     * document's again.
     */
    toExact(editorText: string): string;
    /** When the editor text is that of a remembered text, make that text's BOM and line-ending style the document's again (cheap: compares lengths first). */
    recall(editorText: string): void;
    /** An offset in the editor text → the offset in the exact text (BOM and CR LF counted). */
    toExactOffset(editorText: string, offset: number): number;
    /** Remember `text` as the saved text (kept outside the window of recent texts). */
    markSaved(text: string): void;
    /** True when this editor text reads back as exactly the saved text (no style change). */
    isSaved(editorText: string): boolean;
    /** The saved text, exact. */
    savedText(): string;
    /** Forget every remembered text (the shell's `destroy`). */
    clear(): void;
    /** The document's line ending and BOM. */
    readonly eol: Eol;
    readonly bom: boolean;
}
export declare function createTextModel(initial: string): TextModel;
/** The smallest single replacement turning `a` into `b` (common prefix and suffix kept). */
export declare function minimalChange(a: string, b: string): {
    from: number;
    to: number;
    insert: string;
} | null;
export {};
//# sourceMappingURL=text-model.d.ts.map