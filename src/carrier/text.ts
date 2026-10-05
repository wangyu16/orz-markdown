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

