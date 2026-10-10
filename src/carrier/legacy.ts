/**
 * Reading the source island of a carrier's legacy 0.x file (2.3.0): the
 * kind-independent part of orz-mdhtml's and orz-paged's `readLegacy`
 * (REBUILD §3a/§3b KIT GAP), so each carrier keeps only what its own 0.x
 * writer added (its config's fields, its theme attribute, its notes' wording).
 *
 * Every 0.x carrier wrote the same island: `<script type="text/markdown"
 * id="orz-src">` holding `"\n" + source + "\n"` with every `</script` (any
 * case) written `<\/script` and nothing else escaped; a generator meta
 * (`orz-<x>[ <version>]`), no `#orz-shell`, and a config script
 * `window.__ORZ_<X>__ = {…}`. {@link readLegacyIsland} finds the island with
 * a raw-text scan (comments and other raw-text elements skipped, so a
 * `<script` written inside a script string is not taken for a tag), restores
 * `</script`, removes the writer's wrapping line breaks (`\n…\n`, or
 * `\r\n…\r\n` after a line-ending conversion) and reads the generator, the
 * config (JSON), the engine's delivery, the `<title>` and `#orz-meta`.
 *
 * Isomorphic and deterministic: no Node built-ins, no clock, no randomness;
 * parser-free.
 */
import { asciiLower } from '../ascii.js';
import { parseDocMetaIsland, type DocMeta } from '../doc-meta.js';

/** A raw-text element (`script`, `style`, `title`, `textarea`) of an HTML file. */
export interface RawElement {
  /** Its tag name, ASCII lower case. */
  name: string;
  /** The start tag's attribute text (after the name, before `>`). */
  attrs: string;
  /** Offset of its content. */
  start: number;
  /** Offset just past its content (the file's end when it is not closed). */
  end: number;
}

const RAW_TEXT = new Set(['script', 'style', 'title', 'textarea']);

/**
 * The raw-text elements of an HTML file in document order (comments and other
 * raw-text content skipped). An element that is not closed runs to the end
 * of the file and ends the scan.
 */
export function rawElements(html: string): RawElement[] {
  const lower = asciiLower(html);
  const out: RawElement[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) break;
    if (html.startsWith('<!--', lt)) {
      const e = html.indexOf('-->', lt + 4);
      if (e < 0) break;
      i = e + 3;
      continue;
    }
    const m = /^<([A-Za-z][A-Za-z0-9-]*)/.exec(html.slice(lt, lt + 64));
    if (!m) {
      i = lt + 1;
      continue;
    }
    const name = asciiLower(m[1]);
    const gt = html.indexOf('>', lt);
    if (gt < 0) break;
    if (!RAW_TEXT.has(name)) {
      i = gt + 1;
      continue;
    }
    let close = -1;
    for (let at = lower.indexOf(`</${name}`, gt + 1); at >= 0; at = lower.indexOf(`</${name}`, at + 1)) {
      const c = lower.charAt(at + name.length + 2);
      if (c === '' || c === '>' || c === '/' || /\s/.test(c)) {
        close = at;
        break;
      }
    }
    out.push({ name, attrs: html.slice(lt + 1 + m[1].length, gt), start: gt + 1, end: close < 0 ? html.length : close });
    if (close < 0) break;
    const end = html.indexOf('>', close);
    i = end < 0 ? html.length : end + 1;
  }
  return out;
}

const attrName = (name: string): string => {
  if (!/^[A-Za-z_:][A-Za-z0-9_:.-]*$/.test(name)) throw new Error(`orz carrier: ${JSON.stringify(name)} is not an attribute name`);
  return name.replace(/[.]/g, '\\.');
};

/** An attribute's value in a start tag's attribute text (quoted or not; null when absent). */
export function rawAttr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${attrName(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

/** Whether a start tag's attribute text has the attribute (with or without a value). */
export function hasRawAttr(attrs: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${attrName(name)}(?=[\\s=/]|$)`, 'i').test(attrs);
}

function safeCodePoint(n: number): string | null {
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : null;
}

/**
 * Decode the entities a writer or a browser's serializer puts in raw-text
 * content such as `<title>`: numeric references (a surrogate, zero or an
 * out-of-range one stays as written) and `&lt; &gt; &quot; &apos; &nbsp; &amp;`.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, h: string) => safeCodePoint(parseInt(h, 16)) ?? m)
    .replace(/&#([0-9]+);/g, (m, d: string) => safeCodePoint(parseInt(d, 10)) ?? m)
    .replace(/&(lt|gt|quot|apos|nbsp|amp);/g, (_m, n: string) => ({ lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', amp: '&' })[n] ?? '');
}

/** The generator meta of a file's head (`<meta name="generator" content="…">` before `<body>`), or null. */
export function generatorOf(html: string): string | null {
  const head = html.slice(0, Math.max(0, html.search(/<body[\s>]/i)));
  return /<meta\s+name=["']generator["']\s+content=["']([^"']*)["']/i.exec(head)?.[1] ?? null;
}

/** How a carrier recognises its own 0.x files ({@link readLegacyIsland}). */
export interface LegacyWriter {
  /** The 0.x generator meta (`/^orz-paged(\s|$)/`, `/^orz-mdhtml$/`). */
  generator: RegExp;
  /** The 0.x config global (`__ORZ_PAGED__`, `__ORZ_MDHTML__`): a script `window.<name> = {…}`. */
  config: string;
}

/** What {@link readLegacyIsland} reads from a 0.x file. */
export interface LegacyIsland {
  /** The source: the island with `<\/script` restored to `</script`, without the writer's wrapping line breaks. */
  text: string;
  /** Whether the island had the 0.x writer's `\n…\n` wrapper (or `\r\n…\r\n`; otherwise its content is kept exactly). */
  wrapped: boolean;
  /** How many `<\/script` the island held (restored to `</script` in `text`). */
  scriptEscapes: number;
  /** The generator meta, if any. */
  generator: string | null;
  /**
   * The config object (`window.<config> = {…}` read as JSON): `{}` when the
   * file has no config script or it is not a JSON object (see `configError`).
   */
  config: Record<string, unknown>;
  /** True when a config script exists but is not readable JSON (the carrier says so in its own words; a JSON value that is not an object reads as `{}`). */
  configError: boolean;
  /** `inline` / `cdn` from the engine script (`data-orz-asset="engine"`), if found. */
  delivery: 'inline' | 'cdn' | null;
  /** The `<title>` text (entities decoded, trimmed), if any. */
  title: string | null;
  /** DocMeta from `#orz-meta` in the head, if any. */
  meta: DocMeta | null;
  /**
   * Things found but not understood, in the words both carriers use: the
   * island lacks the wrapper; its `type` is not `text/markdown`.
   */
  notes: string[];
  /** The file's raw-text elements (for a carrier's own reads). */
  elements: RawElement[];
}

/**
 * Read the source island of a carrier's legacy 0.x file; `null` when `html`
 * is not one of `writer`'s 0.x files (no `#orz-src` island, a format-1
 * `#orz-shell`, or neither the writer's generator nor its config script).
 */
export function readLegacyIsland(html: string, writer: LegacyWriter): LegacyIsland | null {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(writer.config)) throw new Error(`orz carrier: ${JSON.stringify(writer.config)} is not a config global name`);
  const els = rawElements(html);
  const scripts = els.filter((e) => e.name === 'script');
  if (scripts.some((e) => rawAttr(e.attrs, 'id') === 'orz-shell')) return null;
  const island = scripts.find((e) => rawAttr(e.attrs, 'id') === 'orz-src');
  if (!island) return null;
  const gen = generatorOf(html);
  const configRe = new RegExp(`^\\s*window\\.${writer.config.replace(/\$/g, '\\$')}\\s*=`);
  const configEl = scripts.find((e) => configRe.test(html.slice(e.start, e.end)));
  if (!(gen !== null && writer.generator.test(gen)) && !configEl) return null;

  const notes: string[] = [];
  let config: Record<string, unknown> = {};
  let configError = false;
  if (configEl) {
    const js = html.slice(configEl.start, configEl.end).replace(configRe, '').replace(/;\s*$/, '');
    try {
      const parsed = JSON.parse(js) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed as Record<string, unknown>;
    } catch {
      configError = true;
    }
  }

  const island0 = html.slice(island.start, island.end);
  const scriptEscapes = (island0.match(/<\\\/script/gi) ?? []).length;
  // the inverse of the 0.x writer's escape (`</script` → `<\/script`, any case)
  const raw = island0.replace(/<\\\/(script)/gi, '</$1');
  // The 0.x writer wrapped the source in "\n…\n"; a file whose line breaks were
  // converted to CR LF afterwards (an editor, a git checkout) has "\r\n…\r\n".
  const lead = raw.startsWith('\r\n') ? 2 : raw.startsWith('\n') ? 1 : 0;
  const trail = lead === 2 && raw.endsWith('\r\n') ? 2 : raw.endsWith('\n') ? 1 : 0;
  const wrapped = lead > 0 && trail > 0 && raw.length >= lead + trail;
  if (!wrapped) notes.push('the source island lacks the 0.x writer\'s "\\n…\\n" wrapper; its content is kept exactly');
  if (rawAttr(island.attrs, 'type') !== 'text/markdown') notes.push(`the source island's type is ${JSON.stringify(rawAttr(island.attrs, 'type'))}, not text/markdown`);

  const titleEl = els.find((e) => e.name === 'title');
  const engine = scripts.find((e) => rawAttr(e.attrs, 'data-orz-asset') === 'engine');
  return {
    text: wrapped ? raw.slice(lead, raw.length - trail) : raw,
    wrapped,
    scriptEscapes,
    generator: gen,
    config,
    configError,
    delivery: engine ? (hasRawAttr(engine.attrs, 'src') ? 'cdn' : 'inline') : null,
    title: titleEl ? decodeEntities(html.slice(titleEl.start, titleEl.end)).trim() : null,
    meta: parseDocMetaIsland(html),
    notes,
    elements: els,
  };
}
