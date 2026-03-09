/**
 * NYML V2 Parser implementation.
 *
 * V2 introduces list-based output where:
 * - Root is always a list of entries
 * - Multi-value fields create nested lists
 * - Mixed content (strings + key/value pairs) is supported
 * - No comments (# is allowed in values)
 */
declare class ParseError extends Error {
    code: string;
    line: number;
    column: number | null;
    constructor(code: string, message: string, line: number, column?: number | null);
}
/**
 * Parse NYML V2 text into a list structure.
 *
 * @param {string} text - The NYML V2 content to parse
 * @returns {Array} - A list representing the parsed data
 */
declare function parseNymlV2(text: string): any[];
/**
 * Serialize a V2 data structure back to NYML format.
 *
 * @param {Array} data - List structure as returned by parseNymlV2()
 * @param {number} indent - Current indentation level (spaces)
 * @returns {string} - NYML formatted string
 */
declare function serializeNymlV2(data: any[], indent?: number): string;
export { parseNymlV2, serializeNymlV2, ParseError };
//# sourceMappingURL=nyml_parser.d.ts.map