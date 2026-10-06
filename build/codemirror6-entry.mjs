/* Entry of vendor/codemirror6.js — the ONE pinned CodeMirror 6 bundle the
 * editor shell (src/carrier/editor/codemirror6.ts) loads by default. Built by
 * `npm run build:codemirror` (scripts/build-codemirror.ts) from the exact
 * devDependency versions, as an IIFE that sets `globalThis.OrzCodeMirror6`.
 *
 * One bundle, not per-package jsDelivr `+esm` URLs: those resolve
 * `@codemirror/state` to a different version per package (measured
 * 2026-10-05: 6.7.0 … 6.7.6), and CodeMirror 6 breaks with two copies of
 * `@codemirror/state`. Only what the adapter uses is exported (the shape of
 * `CodeMirror6Modules`), and `markdownLanguage` instead of `markdown()`, which
 * would pull in lang-html/css/javascript (543 KB instead of ~355 KB). */
import { EditorState, Compartment, EditorSelection } from '@codemirror/state';
import { EditorView, keymap, drawSelection, highlightActiveLine, highlightSpecialChars, dropCursor } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap, indentWithTab, undo, redo, isolateHistory } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, LanguageSupport } from '@codemirror/language';
import { markdownLanguage, markdownKeymap } from '@codemirror/lang-markdown';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';

/* global __CM_VERSIONS__ */
export const versions = __CM_VERSIONS__;
export const state = { EditorState, Compartment, EditorSelection };
export const view = { EditorView, keymap, drawSelection, highlightActiveLine, highlightSpecialChars, dropCursor };
export const commands = { history, defaultKeymap, historyKeymap, indentWithTab, undo, redo, isolateHistory };
export const language = { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, LanguageSupport };
export const markdown = { markdownLanguage, markdownKeymap };
export const search = { searchKeymap, highlightSelectionMatches };
