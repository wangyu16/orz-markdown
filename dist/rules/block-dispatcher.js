"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockDispatcher = blockDispatcher;
const registry_js_1 = require("../registry.js");
/**
 * Block dispatcher rule for {{name[args] body}} constructs.
 * Registered after 'blockquote' so it runs before 'paragraph' but after 'fence'/'code_block'.
 */
function blockDispatcher(state, startLine, endLine, silent) {
    // Skip if this line is at indented-code-block level
    if (state.sCount[startLine] - state.blkIndent >= 4) {
        return false;
    }
    const src = state.src;
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const lineMax = state.eMarks[startLine];
    // Must start with {{
    if (pos + 1 >= lineMax || src[pos] !== '{' || src[pos + 1] !== '{') {
        return false;
    }
    // Extract plugin name: alphanumeric + hyphens
    let nameEnd = pos + 2;
    while (nameEnd < lineMax) {
        const ch = src[nameEnd];
        if (!/[a-zA-Z0-9-]/.test(ch))
            break;
        nameEnd++;
    }
    const name = src.slice(pos + 2, nameEnd);
    if (!name || !(0, registry_js_1.hasBlock)(name)) {
        return false;
    }
    // Extract optional [args] — only if '[' immediately follows name (no space)
    let args = null;
    let cursor = nameEnd;
    if (src[cursor] === '[') {
        const argsStart = cursor + 1;
        const bracketEnd = src.indexOf(']', argsStart);
        if (bracketEnd === -1 || bracketEnd > lineMax) {
            return false; // unclosed [
        }
        args = src.slice(argsStart, bracketEnd);
        cursor = bracketEnd + 1;
    }
    // Skip horizontal whitespace before body
    while (cursor < lineMax && (src[cursor] === ' ' || src[cursor] === '\t')) {
        cursor++;
    }
    // Check for closing '}}' on the same line (compact / single-line form)
    const firstLineRest = src.slice(cursor, lineMax);
    const closingOnFirstLine = firstLineRest.indexOf('}}');
    let bodyContent;
    let nextLine;
    if (closingOnFirstLine !== -1) {
        // Single-line form: {{name[args] body}}
        bodyContent = firstLineRest.slice(0, closingOnFirstLine).trim();
        nextLine = startLine + 1;
    }
    else {
        // Multiline form: scan forward across lines for closing '}}'
        let found = false;
        let lastLine = startLine;
        let lastPos = -1;
        for (let line = startLine + 1; line < endLine; line++) {
            const lineStart = state.bMarks[line];
            const lineEnd = state.eMarks[line];
            // A non-empty line with negative indent breaks the block
            if (lineStart < lineEnd &&
                state.tShift[line] < state.blkIndent) {
                break;
            }
            const lineContent = src.slice(lineStart, lineEnd);
            const closingIdx = lineContent.indexOf('}}');
            if (closingIdx !== -1) {
                lastLine = line;
                lastPos = lineStart + closingIdx;
                found = true;
                break;
            }
        }
        if (!found) {
            return false; // unclosed — leave as literal text
        }
        nextLine = lastLine + 1;
        // Body is: everything from cursor (on first line) through closing line, trimmed
        // First-line body part
        const firstLinePart = src.slice(cursor, lineMax);
        // Middle lines
        const middlePart = lastLine > startLine + 1
            ? state.getLines(startLine + 1, lastLine, state.tShift[startLine], true)
            : '';
        // Last-line body part (before the closing }})
        const lastLinePart = src.slice(state.bMarks[lastLine] + state.tShift[lastLine], lastPos);
        bodyContent = (firstLinePart + '\n' + middlePart + lastLinePart).trim();
    }
    if (silent) {
        return true;
    }
    const token = state.push('plugin_block', '', 0);
    token.info = name;
    token.meta = { args };
    token.content = bodyContent;
    token.map = [startLine, nextLine];
    token.block = true;
    state.line = nextLine;
    return true;
}
//# sourceMappingURL=block-dispatcher.js.map