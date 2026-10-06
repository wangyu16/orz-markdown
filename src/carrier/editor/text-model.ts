/**
 * The exact text behind an editing surface (FC-19 invariant 5, FC-18 §2).
 *
 * Editors work on LF text without a BOM (CodeMirror splits on CR, CR LF and
 * LF and joins with LF; a `<textarea>` normalises line breaks to LF). The
 * model keeps the document's own form: its byte-order mark and its
 * line-ending style (that of its first line break, FC-18 §8.1), and the exact
 * strings it was given. Reading back:
 *
 * - an editor text equal to the LF form of a text the model was given
 *   (`setText`, the initial text, a header edit) gives back THAT exact text —
 *   so an unedited document, or one undone back to a known state, reads back
 *   byte for byte, mixed line endings included;
 * - any other editor text is written in the document's style: the BOM in
 *   front, every LF as the document's line ending.
 *
 * Pure and deterministic; no browser API.
 */
import { eolStyle } from '../text.js';

const BOM = '﻿';
const EOLS = { lf: '\n', crlf: '\r\n', cr: '\r' } as const;
/** How many exact texts are remembered for exact read-back (most recent first). */
const REMEMBERED = 16;

/** The editor (LF, no BOM) form of an exact text. */
export function toEditorText(text: string): string {
  const body = text.startsWith(BOM) ? text.slice(1) : text;
  return body.indexOf('\r') < 0 ? body : body.replace(/\r\n?/g, '\n');
}

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

export function createTextModel(initial: string): TextModel {
  let bom = false;
  let eol: '\n' | '\r\n' | '\r' = '\n';
  /** editor form → exact text, most recent first. */
  let known: Array<[string, string]> = [];
  const model: TextModel = {
    adopt(text) {
      bom = text.startsWith(BOM);
      eol = EOLS[eolStyle(text)];
      const editor = toEditorText(text);
      known = [[editor, text] as [string, string], ...known.filter(([e]) => e !== editor)].slice(0, REMEMBERED);
      return editor;
    },
    toExact(editorText) {
      for (const [e, exact] of known) if (e === editorText) return exact;
      const body = eol === '\n' ? editorText : editorText.replace(/\n/g, eol);
      return bom ? BOM + body : body;
    },
    toExactOffset(editorText, offset) {
      const at = Math.max(0, Math.min(offset, editorText.length));
      let shift = bom ? 1 : 0;
      if (eol === '\r\n') for (let i = editorText.indexOf('\n'); i >= 0 && i < at; i = editorText.indexOf('\n', i + 1)) shift++;
      return at + shift;
    },
    get eol() { return eol; },
    get bom() { return bom; },
  };
  model.adopt(initial);
  return model;
}

/** The smallest single replacement turning `a` into `b` (common prefix and suffix kept). */
export function minimalChange(a: string, b: string): { from: number; to: number; insert: string } | null {
  if (a === b) return null;
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  // never split a surrogate pair
  if (start > 0 && start < max && isHigh(a.charCodeAt(start - 1))) start--;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) { endA--; endB--; }
  if (endA < a.length && endA > start && isLow(a.charCodeAt(endA))) { endA++; endB++; }
  return { from: start, to: endA, insert: b.slice(start, endB) };
}

const isHigh = (c: number): boolean => c >= 0xd800 && c <= 0xdbff;
const isLow = (c: number): boolean => c >= 0xdc00 && c <= 0xdfff;
