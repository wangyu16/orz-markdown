"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inlineDispatcher = inlineDispatcher;
const registry_js_1 = require("../registry.js");
/**
 * Inline dispatcher rule for {{name[args] body}} constructs.
 * Registered after 'escape' so \{{ is handled by the built-in escape rule.
 */
function inlineDispatcher(state, silent) {
    const src = state.src;
    const pos = state.pos;
    const max = state.posMax;
    // Must start with {{
    if (pos + 1 > max || src[pos] !== '{' || src[pos + 1] !== '{') {
        return false;
    }
    // Extract plugin name: alphanumeric + hyphens
    let nameEnd = pos + 2;
    while (nameEnd <= max) {
        const ch = src[nameEnd];
        if (!/[a-zA-Z0-9-]/.test(ch))
            break;
        nameEnd++;
    }
    const name = src.slice(pos + 2, nameEnd);
    if (!name || !(0, registry_js_1.hasInline)(name)) {
        return false;
    }
    // Extract optional [args] — only if '[' immediately follows name (no space)
    let args = null;
    let cursor = nameEnd;
    if (src[cursor] === '[') {
        const argsStart = cursor + 1;
        // The next `]` after a position is the same for every opener before it:
        // remember the last search, so N `{{name[` openers cost O(N) (round 8, H6).
        const memoB = state;
        const known = memoB.__orzBracket;
        const bracketEnd = known && argsStart >= known.from && (known.at < 0 || argsStart <= known.at)
            ? known.at
            : src.indexOf(']', argsStart);
        memoB.__orzBracket = { from: Math.min(argsStart, known && known.at === bracketEnd ? known.from : argsStart), at: bracketEnd };
        if (bracketEnd === -1) {
            return false; // unclosed [
        }
        args = src.slice(argsStart, bracketEnd);
        cursor = bracketEnd + 1;
    }
    // Skip horizontal whitespace before body
    while (cursor <= max && (src[cursor] === ' ' || src[cursor] === '\t')) {
        cursor++;
    }
    // Find closing '}}' within the current inline buffer (no line crossing).
    // Remember where no closer follows, so N unclosed openers cost O(N), not O(N²).
    const memo = state;
    if (memo.__orzNoCloseFrom !== undefined && cursor >= memo.__orzNoCloseFrom)
        return false;
    const closingIdx = src.indexOf('}}', cursor);
    if (closingIdx === -1) {
        memo.__orzNoCloseFrom = Math.min(memo.__orzNoCloseFrom ?? Infinity, cursor);
        return false; // no closing — leave as literal text
    }
    const bodyContent = src.slice(cursor, closingIdx).trim();
    // Always advance state.pos (required even in silent mode for skipToken)
    state.pos = closingIdx + 2;
    if (silent) {
        return true;
    }
    const token = state.push('plugin_inline', '', 0);
    token.info = name;
    token.meta = { args };
    token.content = bodyContent;
    return true;
}
//# sourceMappingURL=inline-dispatcher.js.map