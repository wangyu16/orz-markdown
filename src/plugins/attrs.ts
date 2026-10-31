import type MarkdownIt from 'markdown-it';
import { register } from '../registry.js';
import { rootEnv } from '../env.js';
import { authorAttrOk, rawHtmlMode } from '../raw-html.js';

export function parseAttrs(attrString: string): Array<[string, string]> {
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

export function registerAttrs(md: MarkdownIt, registry = true): void {
  // The inline token acts as a marker; actual work is done in the core rule
  // `registry: false` for a second, private instance (the carrier kit's parser):
  // the global plugin registry keeps the shared `md`'s definitions.
  if (registry) {
    register({
      type: 'inline',
      aliases: ['attrs'],
      render(_args, _body, _env) {
        // Rendered content is empty — the core rule removes this token and
        // applies the attributes to the preceding block token instead
        return '';
      },
    });
  }

  // One pass per inline token (a splice per marker, and an attrSet walk per
  // distinct key, were quadratic: round 18, M1).
  md.core.ruler.push('attrs_resolve', (state) => {
    // Allowlist mode (D-127, M.45): an attribute that could run script or load a page is dropped.
    const strict = rawHtmlMode(rootEnv(state.env)) === 'allowlist';
    const check = { unescapeAll: (t: string) => md.utils.unescapeAll(t), validateLink: (u: string) => md.validateLink(u) };
    for (let i = 0; i < state.tokens.length; i++) {
      const blockToken = state.tokens[i];
      if (blockToken.type !== 'inline') continue;
      const children = blockToken.children ?? [];
      if (!children.some((c) => c.type === 'plugin_inline' && c.info === 'attrs')) continue;

      const prevToken = state.tokens[i - 1];
      const target = prevToken && prevToken.nesting === 1 ? prevToken : null;
      const merged = new Map<string, string>(target?.attrs ?? []);
      let changed = false;
      const kept: MarkdownIt.Token[] = [];
      for (const child of children) {
        if (child.type !== 'plugin_inline' || child.info !== 'attrs') { kept.push(child); continue; }
        const attrString = child.meta?.args as string | null;
        if (attrString && target) {
          for (const [key, val] of parseAttrs(attrString)) {
            if (strict && !authorAttrOk(target.tag, key, val, check)) continue;
            merged.set(key, val); changed = true;
          }
        }
      }
      if (target && changed) target.attrs = Array.from(merged);
      // `## Title {{attrs[#x]}}` would otherwise leave a trailing space in the
      // heading text (and in TOC entries): trim it when markers ended the line.
      const last = children[children.length - 1];
      if (last.type === 'plugin_inline' && last.info === 'attrs') {
        const prevChild = kept[kept.length - 1];
        if (prevChild && prevChild.type === 'text') prevChild.content = prevChild.content.replace(/\s+$/, '');
      }
      blockToken.children = kept;
    }
  });
}
