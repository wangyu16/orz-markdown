/**
 * Text-level facts that decide whether a text round-trips through an HTML
 * file exactly (FC-18 §2 law 1): its line-ending style, mixed line endings,
 * lone surrogates. Browser-clean, deterministic.
 */
/** The line-ending style of a text, as recorded in `data-orz-eol`. */
export type EolStyle = 'lf' | 'crlf' | 'cr';
/** The style of a text's FIRST line break (`lf` when it has none). */
export declare function eolStyle(text: string): EolStyle;
/** True when the text uses more than one line-ending style (it cannot round-trip exactly). */
export declare function hasMixedEol(text: string): boolean;
/** True when the text holds an unpaired UTF-16 surrogate (not representable in a UTF-8 file). */
export declare function hasLoneSurrogate(text: string): boolean;
/**
 * Decode a file's bytes as UTF-8 text EXACTLY: a leading BOM is kept (as
 * U+FEFF), which `File.text()`, `Blob.text()`, `Response.text()` and a default
 * `TextDecoder` all strip. Invalid UTF-8 sequences become U+FFFD. Use this
 * (with `file.arrayBuffer()`) to read a text twin so the round trip stays exact.
 */
export declare function decodeText(bytes: Uint8Array | ArrayBuffer): string;
//# sourceMappingURL=text.d.ts.map