/** The editor (LF, no BOM) form of an exact text. */
export declare function toEditorText(text: string): string;
export interface TextModel {
    /** Adopt an exact text: its BOM and line-ending style become the document's; returns its editor form. */
    adopt(text: string): string;
    /** The exact text for an editor text. */
    toExact(editorText: string): string;
    /** An offset in the editor text → the offset in the exact text (BOM and CR LF counted). */
    toExactOffset(editorText: string, offset: number): number;
    /** The document's line ending and BOM. */
    readonly eol: '\n' | '\r\n' | '\r';
    readonly bom: boolean;
}
export declare function createTextModel(initial: string): TextModel;
/** The smallest single replacement turning `a` into `b` (common prefix and suffix kept). */
export declare function minimalChange(a: string, b: string): {
    from: number;
    to: number;
    insert: string;
} | null;
//# sourceMappingURL=text-model.d.ts.map