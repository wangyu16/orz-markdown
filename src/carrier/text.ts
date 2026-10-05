/**
 * Text-level facts that decide whether a text round-trips through an HTML
 * file exactly (FC-18 §2 law 1): its line-ending style, mixed line endings,
 * lone surrogates. Browser-clean, deterministic.
 */

/** The line-ending style of a text, as recorded in `data-orz-eol`. */
export type EolStyle = 'lf' | 'crlf' | 'cr';

/** The style of a text's FIRST line break (`lf` when it has none). */
export function eolStyle(text: string): EolStyle {
  const m = /\r\n|\r|\n/.exec(text);
  return !m || m[0] === '\n' ? 'lf' : m[0] === '\r\n' ? 'crlf' : 'cr';
}

/** True when the text uses more than one line-ending style (it cannot round-trip exactly). */
export function hasMixedEol(text: string): boolean {
  const crlf = text.includes('\r\n');
  const cr = /\r(?!\n)/.test(text);
  const lf = /(^|[^\r])\n/.test(text);
  return Number(crlf) + Number(cr) + Number(lf) > 1;
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** True when the text holds an unpaired UTF-16 surrogate (not representable in a UTF-8 file). */
export function hasLoneSurrogate(text: string): boolean {
  return LONE_SURROGATE.test(text);
}


interface TextDecoderLike {
  decode(input: ArrayBuffer | ArrayBufferView): string;
}

/**
 * Decode a file's bytes as UTF-8 text EXACTLY: a leading BOM is kept (as
 * U+FEFF), which `File.text()`, `Blob.text()`, `Response.text()` and a default
 * `TextDecoder` all strip. Invalid UTF-8 becomes U+FFFD, or — with
 * `{ fatal: true }` — throws (a tool that must not save a damaged text back
 * uses it). Use this (with `file.arrayBuffer()`) to read a text twin.
 */
export function decodeText(bytes: Uint8Array | ArrayBuffer, options?: { fatal?: boolean }): string {
  const Ctor = (globalThis as { TextDecoder?: new (label: string, opts: { ignoreBOM: boolean; fatal: boolean }) => TextDecoderLike }).TextDecoder;
  if (!Ctor) throw new Error('orz carrier: decodeText needs TextDecoder');
  return new Ctor('utf-8', { ignoreBOM: true, fatal: options?.fatal === true }).decode(bytes);
}
