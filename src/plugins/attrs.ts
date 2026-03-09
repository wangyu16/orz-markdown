import type MarkdownIt from 'markdown-it';
import { register } from '../registry.js';

function parseAttrs(attrString: string): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  // Match: .classname, #idname, key="value", or bare key
  const re = /\.([^\s.#=]+)|#([^\s.#=]+)|([a-zA-Z][\w-]*)(?:="([^"]*)")?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrString)) !== null) {
    if (m[1]) {
      result.push(['class', m[1]]);
    } else if (m[2]) {
      result.push(['id', m[2]]);
    } else if (m[3]) {
      result.push([m[3], m[4] ?? '']);
    }
  }
  return result;
}

export function registerAttrs(md: MarkdownIt): void {
  // The inline token acts as a marker; actual work is done in the core rule
  register({
    type: 'inline',
    aliases: ['attrs'],
    render(_args, _body, _env) {
      // Rendered content is empty — the core rule removes this token and
      // applies the attributes to the preceding block token instead
      return '';
    },
  });

  md.core.ruler.push('attrs_resolve', (state) => {
    for (let i = 0; i < state.tokens.length; i++) {
      const blockToken = state.tokens[i];
      if (blockToken.type !== 'inline') continue;

      const children = blockToken.children ?? [];
      for (let j = 0; j < children.length; j++) {
        const child = children[j];
        if (child.type !== 'plugin_inline' || child.info !== 'attrs') continue;

        const attrString = child.meta?.args as string | null;
        if (attrString) {
          const prevToken = state.tokens[i - 1];
          if (prevToken && prevToken.nesting === 1) {
            for (const [key, val] of parseAttrs(attrString)) {
              prevToken.attrSet(key, val);
            }
          }
        }

        // Remove the marker token from inline children
        children.splice(j, 1);
        j--;
      }
    }
  });
}
