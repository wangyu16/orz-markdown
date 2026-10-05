/**
 * ASCII-only case mapping. HTML names (tags, attributes) are ASCII
 * case-insensitive, and a lowered copy of a document is safe to index into
 * the original ONLY when lowering keeps its length: `String#toLowerCase`
 * does not (`İ` U+0130 becomes two code units, so every offset after it
 * shifts). Use this whenever a lowered string's indices are applied to the
 * original, or an HTML name is compared.
 */
export declare function asciiLower(s: string): string;
//# sourceMappingURL=ascii.d.ts.map