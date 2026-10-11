import { type TextEditorAdapter } from './adapter.js';
import type { EdDocument } from './types.js';
type Any = any;
/**
 * The CodeMirror 6 exports the adapter uses, grouped by package. Module
 * namespaces satisfy it: `{ state: await import('@codemirror/state'), view:
 * await import('@codemirror/view'), commands: …, language: …, markdown: await
 * import('@codemirror/lang-markdown'), search: … }` (search optional).
 */
export interface CodeMirror6Modules {
    state: {
        EditorState: Any;
        Compartment?: Any;
        EditorSelection?: Any;
    };
    view: {
        EditorView: Any;
        keymap: Any;
        drawSelection?: Any;
        highlightActiveLine?: Any;
        highlightSpecialChars?: Any;
        dropCursor?: Any;
    };
    commands: {
        history: Any;
        defaultKeymap: Any;
        historyKeymap: Any;
        indentWithTab?: Any;
        undo: Any;
        redo: Any;
        isolateHistory?: Any;
    };
    language: {
        syntaxHighlighting: Any;
        defaultHighlightStyle: Any;
        indentOnInput?: Any;
        bracketMatching?: Any;
        LanguageSupport?: Any;
    };
    markdown: {
        markdownLanguage: Any;
        markdownKeymap?: Any;
    };
    search?: {
        searchKeymap?: Any;
        highlightSelectionMatches?: Any;
    };
    /** Package versions (the pinned bundle sets it). */
    versions?: Record<string, string>;
}
/** Where the pinned bundle is served (the package version that ships it). */
export declare const CODEMIRROR6_URL = "https://cdn.jsdelivr.net/npm/orz-markdown@2.3.0/vendor/codemirror6.js";
/** How long the bundle may take to load before the textarea is kept. */
export declare const CODEMIRROR6_TIMEOUT_MS = 20000;
/**
 * How many of the textarea's undo steps the upgrade replays into CodeMirror
 * (CodeMirror's history keeps at least 100 by default). Replaying all 300 of a
 * 1.25 MB document took 20 s and 590 MB (MED cost-2).
 */
export declare const CODEMIRROR6_HISTORY_STEPS = 100;
export interface CodeMirror6Options {
    /** Supply the modules (an app that bundles CodeMirror 6); nothing is fetched. */
    loadModules?: () => CodeMirror6Modules | Promise<CodeMirror6Modules>;
    /**
     * Load the pinned bundle from another address (self-hosting, tests). A code
     * option, never read from a document; the bytes must still match the pinned
     * integrity.
     */
    url?: string;
    timeoutMs?: number;
    /**
     * A CSP nonce: stamped on the bundle's `<script>` (a page whose
     * `script-src` is nonce-based) and given to CodeMirror for the `<style>` it
     * adds (`EditorView.cspNonce`).
     */
    nonce?: string;
}
/** True when an object has the exports the adapter needs. */
export declare function isCodeMirror6Modules(m: unknown): m is CodeMirror6Modules;
/**
 * Load the pinned CodeMirror 6 bundle into a document: a `<script>` with the
 * pinned SRI integrity, appended to `<head>` once; resolves the bundle's
 * global. Rejects on a network or integrity failure, a timeout or a bundle
 * without the expected exports (a later call tries again).
 */
export declare function loadCodeMirror6(doc: EdDocument, options?: {
    url?: string;
    timeoutMs?: number;
    nonce?: string;
}): Promise<CodeMirror6Modules>;
/**
 * The editor's syntax highlighter (2.2.0): a CodeMirror `Highlighter` that
 * gives each Markdown token a class of {@link THEME}, whose colours are the
 * chrome's `--orz-chrome-syntax-*` tokens — so the editor's syntax follows the
 * chrome's light or dark scheme (`data-chrome`, `prefers-color-scheme`) with
 * no reconfiguration, at ≥ 4.5:1 on the editor background (E.27). It reads
 * the tag names `@lezer/highlight` sets on its `tags`; a tag without a known
 * name is not styled.
 */
export declare const ORZ_HIGHLIGHTER: {
    style(tags: readonly Any[]): string | null;
};
export declare function codemirror6Adapter(options?: CodeMirror6Options): TextEditorAdapter;
export {};
//# sourceMappingURL=codemirror6.d.ts.map