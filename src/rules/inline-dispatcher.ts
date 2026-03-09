import type MarkdownIt from 'markdown-it';
import { hasInline } from '../registry.js';

type StateInline = MarkdownIt.StateInline;

/**
 * Inline dispatcher rule for {{name[args] body}} constructs.
 * Registered after 'escape' so \{{ is handled by the built-in escape rule.
 */
export function inlineDispatcher(state: StateInline, silent: boolean): boolean {
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
    if (!/[a-zA-Z0-9-]/.test(ch)) break;
    nameEnd++;
  }
  const name = src.slice(pos + 2, nameEnd);

  if (!name || !hasInline(name)) {
    return false;
  }

  // Extract optional [args] — only if '[' immediately follows name (no space)
  let args: string | null = null;
  let cursor = nameEnd;

  if (src[cursor] === '[') {
    const argsStart = cursor + 1;
    const bracketEnd = src.indexOf(']', argsStart);
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

  // Find closing '}}' within the current inline buffer (no line crossing)
  const closingIdx = src.indexOf('}}', cursor);
  if (closingIdx === -1) {
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
