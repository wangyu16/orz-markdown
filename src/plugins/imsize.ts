/**
 * `![alt](src =WxH)` image sizes — `=300x200`, `=300x`, `=x200`, `=50%x`.
 *
 * Ported from markdown-it-imsize 2.0.1 (MIT, © tatsy) without its `autofill`
 * option. Autofill read image files from disk, so the package statically
 * required `fs` and per-format size detectors; every browser bundle of
 * orz-markdown needed a stub for it. orz-markdown never enabled autofill, so
 * the port keeps exactly the parsing behavior and drops the file access.
 */
import type MarkdownIt from 'markdown-it';

type StateInline = MarkdownIt.StateInline;

const SPACE = 0x20;
const NEWLINE = 0x0a;

function isSpace(code: number): boolean {
  return code === SPACE || code === NEWLINE;
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

/** Read a run of digits / `%` starting at `pos`. */
function parseNextNumber(str: string, pos: number, max: number): { pos: number; value: string } {
  const start = pos;
  while (pos < max && (isDigit(str.charCodeAt(pos)) || str.charCodeAt(pos) === 0x25 /* % */)) pos++;
  return { pos, value: str.slice(start, pos) };
}

/** Parse `=WxH` at `pos`. Either side may be empty, but the `x` is required. */
export function parseImageSize(
  str: string,
  pos: number,
  max: number,
): { ok: boolean; pos: number; width: string; height: string } {
  const fail = { ok: false, pos: 0, width: '', height: '' };
  if (pos >= max || str.charCodeAt(pos) !== 0x3d /* = */) return fail;
  pos++;
  const first = str.charCodeAt(pos);
  if (first !== 0x78 /* x */ && !isDigit(first)) return fail;
  const w = parseNextNumber(str, pos, max);
  pos = w.pos;
  if (str.charCodeAt(pos) !== 0x78 /* x */) return fail;
  pos++;
  const h = parseNextNumber(str, pos, max);
  return { ok: true, pos: h.pos, width: w.value, height: h.value };
}

function normalizeReference(str: string): string {
  return str.trim().replace(/\s+/g, ' ').toUpperCase();
}

function imageWithSize(md: MarkdownIt) {
  return function image(state: StateInline, silent: boolean): boolean {
    const src = state.src;
    const oldPos = state.pos;
    const max = state.posMax;
    let href = '';
    let title = '';
    let width = '';
    let height = '';

    if (src.charCodeAt(state.pos) !== 0x21 /* ! */) return false;
    if (src.charCodeAt(state.pos + 1) !== 0x5b /* [ */) return false;

    const labelStart = state.pos + 2;
    const labelEnd = md.helpers.parseLinkLabel(state, state.pos + 1, false);
    if (labelEnd < 0) return false;

    let pos = labelEnd + 1;
    if (pos < max && src.charCodeAt(pos) === 0x28 /* ( */) {
      // Inline: ![label](  <href>  "title" =WxH  )
      pos++;
      while (pos < max && isSpace(src.charCodeAt(pos))) pos++;
      if (pos >= max) return false;

      let res = md.helpers.parseLinkDestination(src, pos, state.posMax);
      if (res.ok) {
        href = state.md.normalizeLink(res.str);
        if (state.md.validateLink(href)) pos = res.pos;
        else href = '';
      }

      const afterDest = pos;
      while (pos < max && isSpace(src.charCodeAt(pos))) pos++;

      res = md.helpers.parseLinkTitle(src, pos, state.posMax);
      if (pos < max && afterDest !== pos && res.ok) {
        title = res.str;
        pos = res.pos;
        while (pos < max && isSpace(src.charCodeAt(pos))) pos++;
      }

      // The size needs at least one space before it.
      if (pos - 1 >= 0 && src.charCodeAt(pos - 1) === SPACE) {
        const size = parseImageSize(src, pos, state.posMax);
        if (size.ok) {
          width = size.width;
          height = size.height;
          pos = size.pos;
          while (pos < max && isSpace(src.charCodeAt(pos))) pos++;
        }
      }

      if (pos >= max || src.charCodeAt(pos) !== 0x29 /* ) */) {
        state.pos = oldPos;
        return false;
      }
      pos++;
    } else {
      // Reference: ![label][ref] / ![label][] / ![label]
      const references = (state.env as { references?: Record<string, { href: string; title: string }> }).references;
      if (typeof references === 'undefined') return false;
      while (pos < max && isSpace(src.charCodeAt(pos))) pos++;

      let label: string | undefined;
      if (pos < max && src.charCodeAt(pos) === 0x5b /* [ */) {
        const start = pos + 1;
        pos = md.helpers.parseLinkLabel(state, pos);
        if (pos >= 0) label = src.slice(start, pos++);
        else pos = labelEnd + 1;
      } else {
        pos = labelEnd + 1;
      }
      if (!label) label = src.slice(labelStart, labelEnd);

      const ref = references[normalizeReference(label)];
      if (!ref) {
        state.pos = oldPos;
        return false;
      }
      href = ref.href;
      title = ref.title;
    }

    if (!silent) {
      state.pos = labelStart;
      state.posMax = labelEnd;
      const children: MarkdownIt.Token[] = [];
      const inner = new state.md.inline.State(src.slice(labelStart, labelEnd), state.md, state.env, children);
      inner.md.inline.tokenize(inner);
      // markdown-it's text_join core rule never reaches an image's children, so
      // escaped characters (text_special) would vanish from the alt text:
      // "![Tom\\'s dog]" rendered alt="Toms dog". Join them here.
      for (const child of children) if (child.type === 'text_special') child.type = 'text';

      const token = state.push('image', 'img', 0);
      const attrs: Array<[string, string]> = [['src', href], ['alt', '']];
      token.attrs = attrs;
      token.children = children;
      if (title) attrs.push(['title', title]);
      if (width !== '') attrs.push(['width', width]);
      if (height !== '') attrs.push(['height', height]);
    }

    state.pos = pos;
    state.posMax = max;
    return true;
  };
}

/** Same rule name and position as markdown-it-imsize, so behavior is unchanged. */
export function registerImsize(md: MarkdownIt): void {
  md.inline.ruler.before('emphasis', 'image', imageWithSize(md));
}
