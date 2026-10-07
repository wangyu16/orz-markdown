import 'katex/contrib/mhchem';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import container from 'markdown-it-container';
import footnote from 'markdown-it-footnote';
import { footnoteTail } from './rules/footnote-tail.js';
import { taskLists as taskListsLinear } from './rules/task-lists.js';
import { inlineEnv, rootEnv } from './env.js';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import ins from 'markdown-it-ins';
import taskLists from 'markdown-it-task-lists';
import katexPlugin from '@traptitech/markdown-it-katex';
import cjkBreaks from 'markdown-it-cjk-breaks';
import { blockDispatcher } from './rules/block-dispatcher.js';
import { inlineDispatcher } from './rules/inline-dispatcher.js';
import { getDefinition } from './registry.js';
import { escapeAttr, escapeHtml } from './html.js';
import { parseAttrs } from './plugins/attrs.js';
import { parseNymlBody } from './nyml-body.js';
import { registerSpan } from './plugins/span.js';
import { registerToc } from './plugins/toc.js';
import { registerAttrs } from './plugins/attrs.js';
import { registerMarkdownInclude } from './plugins/markdown-include.js';
import { registerImsize } from './plugins/imsize.js';
import { registerCjk } from './plugins/cjk.js';
import './plugins/test.js';
import './plugins/emoji.js';
import './plugins/space.js';
import './plugins/youtube.js';
import './plugins/mermaid.js';
import './plugins/smiles.js';
import './plugins/chart.js';
import './plugins/qrcode.js';
import './plugins/yaml.js';
import './plugins/nyml.js';

export { register } from './registry.js';
export type { PluginDefinition } from './registry.js';
export { prepareSources } from './prepare-sources.js';
export { THEMES, DEFAULT_THEME, isThemeId, themeInfo } from './themes.js';
export type { ThemeInfo, ThemeScheme } from './themes.js';
export type { PrepareSourcesOptions } from './prepare-sources.js';

/**
 * TeX characters rendered per document, and of them inside `\ce{…}`/`\pu{…}`
 * arguments (4,000 small reactions are ~80,000).
 */
export const MAX_TEX_TOTAL = 1_000_000;
export const MAX_CHEM_TOTAL = 100_000;
/**
 * KaTeX HTML per document: cost follows output (1 MB of arrays was 204 MB in
 * 52 s: round 21, H7). 5,000 display formulas of a textbook are ~45 MB.
 */
export const MAX_KATEX_OUTPUT = 64_000_000;

/**
 * Build an orz-markdown parser/renderer: a markdown-it instance with exactly
 * the configuration of the shared `md` (options, plugins, containers, rules).
 * Each instance has its own options and rule chains, so `md.set()` / `md.use()`
 * by a host change only that instance. The `{{name}}` plugin registry
 * (`register()`) is global by design: plugins registered by a host apply to
 * every instance. `registerPlugins: false` builds a parser that leaves the
 * registry's definitions bound to the shared `md` (the carrier kit's private
 * parser).
 */
export function createMarkdown(registerPlugins = true): MarkdownIt {
  const md = new MarkdownIt({
    // allow raw HTML tags in source text. disabling this (the default) causes
    // tags like `<div>...</div>` to be escaped into `&lt;div&gt;`.
    html: true,
    linkify: true,
    typographer: true,
  });

  // Official plugins (anchor must be first: TOC depends on its id generation)
  // A heading with no text (`## {{emoji smile}}`) got `id=""` and then `id="-1"`;
  // it gets "section" (numbered like any repeat). Every other id is unchanged.
  const anchorSlug = (anchor as unknown as { defaults: { slugify(s: string): string } }).defaults.slugify;
  // Unique ids in O(1) per heading: anchor tries base-1, base-2, … from 1 for
  // every duplicate, so many headings with one title were quadratic (also in
  // 1.6.3; round 18, H1). This returns the same id anchor would — the first free
  // base-k — from a per-render "next k", and anchor's own check then passes at once.
  type SlugState = { taken: Set<string>; assigned: Set<string>; next: Map<string, number>; nextOwn: Map<string, number> };
  const slugState = new WeakMap<object, SlugState>();
  function uniqueSlug(state: MarkdownIt.StateCore, base: string, hasOwnId = false): string {
    const st = slugsFor(state);
    // Taken: assigned already, or reserved by an {{attrs}} id. A heading with its
    // own attrs id never shows its automatic slug; it spends one as 1.6.3 did —
    // the first free among assigned slugs only — so later same-titled headings
    // keep their numbering (round 20, B-M1; round 21, B-M1a). Each predicate has
    // its own "next k": both only grow, so every heading is O(1) amortised
    // (an own-id heading that never advanced was quadratic: round 21, B-H1).
    const taken = hasOwnId ? (s: string) => st.assigned.has(s) : (s: string) => st.assigned.has(s) || st.taken.has(s);
    const next = hasOwnId ? st.nextOwn : st.next;
    let slug = base;
    if (taken(base)) {
      let k = next.get(base) ?? 1;
      while (taken(`${base}-${k}`)) k++;
      next.set(base, k + 1);
      slug = `${base}-${k}`;
    }
    st.assigned.add(slug);
    return slug;
  }
  function slugsFor(state: MarkdownIt.StateCore): SlugState {
    let st = slugState.get(state);
    if (!st) {
      st = { taken: new Set(), assigned: new Set(), next: new Map(), nextOwn: new Map() };
      slugState.set(state, st);
      // Ids `{{attrs[#…]}}` will set later are taken already, so an automatic id
      // never duplicates one (round 19, M1) — only ids that will be written: the
      // last id of each marker run, on a block that renders a tag (a tight
      // list's paragraph is hidden: round 21, B-M1b).
      const tokens = state.tokens;
      for (let i = 0; i < tokens.length; i++) {
        const id = ownAttrsId(tokens, i);
        if (id != null) st.taken.add(id);
      }
    }
    return st;
  }
  /** The id `attrs_resolve` will give the block opened before inline token `i`, if any. */
  function ownAttrsId(tokens: MarkdownIt.Token[], i: number): string | null {
    const t = tokens[i];
    const target = tokens[i - 1];
    if (t?.type !== 'inline' || !target || target.nesting !== 1 || target.hidden) return null;
    let id: string | null = null;
    for (const c of t.children ?? []) {
      const args = c.type === 'plugin_inline' && c.info === 'attrs' ? (c.meta as { args?: string | null } | null)?.args : null;
      if (args) for (const [k, v] of parseAttrs(args)) if (k === 'id') id = v;
    }
    return id;
  }
  md.use(anchor);
  // markdown-it-anchor's core rule, ported for the options used here (no
  // permalink, no callback): its per-heading `tokens.indexOf(heading)` was
  // quadratic even for distinct titles (100,000 headings: 21 s, in 1.6.3 too;
  // round 19, H1). Same ids: the first free base-k; tabindex "-1".
  md.core.ruler.at('anchor', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type !== 'heading_open') continue;
      const title = (tokens[i + 1]?.children ?? [])
        .filter((t) => t.type === 'text' || t.type === 'code_inline')
        .map((t) => t.content)
        .join('');
      // A heading with its own {{attrs[#…]}} id still spends its automatic slug,
      // as in 1.6.3 (later same-titled headings keep their -1, -2 numbering, so
      // existing links hold); the attrs id overrides it afterwards.
      const preset = token.attrGet('id');
      const slug = uniqueSlug(state, preset ?? (anchorSlug(title) || 'section'), ownAttrsId(tokens, i + 1) != null);
      token.attrSet('id', slug);
      // Recorded so prepareSources can tell an automatic id from an authored one.
      token.meta = { ...(token.meta ?? {}), orzAutoId: slug };
      token.attrSet('tabindex', '-1');
    }
  });
  /** A CSS length with its unit (`30%`, `12em`, `200px`): `max-width: 12` is invalid CSS the browser drops. */
  const CSS_LENGTH = /^\d+(\.\d+)?(px|em|rem|%|ch|ex|vw|vh|vmin|vmax|pt|pc|cm|mm|in)$/;
  /** A CSS grid track size: a length, `fr`, `auto`, `min-content`, `max-content`. */
  const TRACK = '(?:\\d+(?:\\.\\d+)?(?:px|em|rem|%|ch|ex|vw|vh|vmin|vmax|pt|pc|cm|mm|in|fr)?|auto|min-content|max-content)';
  const CSS_TRACK = new RegExp(`^(${TRACK}|minmax\\(${TRACK},${TRACK}\\)|repeat\\(\\d{1,2},(?:${TRACK}|minmax\\(${TRACK},${TRACK}\\))\\))$`);

  // Semantic color containers
  md.use(container, 'success');
  md.use(container, 'info');
  md.use(container, 'warning');
  md.use(container, 'danger');
  // Layout containers
  md.use(container, 'left', {
    render(tokens: MarkdownIt.Token[], idx: number) {
      if (tokens[idx].nesting === 1) {
        const width = tokens[idx].info.trim().slice('left'.length).trim();
        if (width) {
          const w = escapeAttr(width);
          // Only a CSS length reaches the style attribute: `1px;position:fixed`
          // would otherwise add declarations of its own (round 12).
          if (!CSS_LENGTH.test(width)) return `<div class="left" data-orz-container="left ${w}">\n`;
          return `<div class="left" style="max-width: ${w}; width: ${w}" data-orz-container="left ${w}">\n`;
        }
        return '<div class="left">\n';
      }
      return '</div>\n';
    },
  });
  md.use(container, 'right');
  md.use(container, 'center');
  // Interactive containers
  md.use(container, 'spoil', {
    render(tokens: MarkdownIt.Token[], idx: number, _options?: unknown, env?: object) {
      if (tokens[idx].nesting === 1) {
        // Extract label from params: "::: spoil My Title" → "My Title". The label
        // is inline Markdown (emphasis, math, code), rendered in its own env (the
        // document env would make markdown-it-footnote repeat its list here).
        const label = tokens[idx].info.trim().slice('spoil'.length).trim();
        if (!label) return '<details class="spoil"><summary>Show/hide</summary>\n';
        // data-orz-container keeps the raw label so copy-as-Markdown can restore
        // formatting the rendered <summary> no longer shows as source.
        // (On <summary>, the label element, so <details class="spoil"> stays
        // byte-identical for hosts that match it.)
        return `<details class="spoil"><summary data-orz-container="spoil ${escapeAttr(label)}">${md.renderInline(label, inlineEnv(env))}</summary>\n`;
      }
      return '</details>\n';
    },
  });
  md.use(container, 'tabs');
  md.use(container, 'tab', {
    render(tokens: MarkdownIt.Token[], idx: number) {
      if (tokens[idx].nesting === 1) {
        // Extract label from params: "::: tab Python" → "Python"
        const label = tokens[idx].info.trim().slice('tab'.length).trim();
        return `<div class="tab" data-label="${escapeAttr(label)}">\n`;
      }
      return '</div>\n';
    },
  });
  md.use(container, 'cols', {
    render(tokens: MarkdownIt.Token[], idx: number) {
      if (tokens[idx].nesting === 1) {
        const rest = tokens[idx].info.trim().slice('cols'.length).trim();
        if (rest) {
          // Plain numbers become fr units; CSS lengths (%, px, em, …) pass through as-is
          // Spaces inside `repeat(6, 1fr)` / `minmax(…)` do not separate tracks.
          const parts = rest.replace(/\s*([(,])\s*/g, '$1').replace(/\s+\)/g, ')').split(/\s+/);
          // Plain numbers and CSS track sizes only (see `::: left`).
          if (!parts.every((p) => /^\d+(\.\d+)?$/.test(p) || CSS_TRACK.test(p))) return `<div class="cols" data-orz-container="cols ${escapeAttr(rest)}">\n`;
          const cols = parts.map(p => /^\d+(\.\d+)?$/.test(p) ? `${p}fr` : p).join(' ');
          return `<div class="cols" style="grid-template-columns: ${escapeAttr(cols)}" data-orz-container="cols ${escapeAttr(rest)}">\n`;
        }
        return '<div class="cols">\n';
      }
      return '</div>\n';
    },
  });
  md.use(container, 'col');
  // Catch-all: ::: ClassName → <div class="ClassName"> for any identifier not already registered
  const RESERVED_CONTAINERS = new Set([
    'success', 'info', 'warning', 'danger',
    'left', 'right', 'center',
    'spoil', 'tabs', 'tab',
    'cols', 'col',
  ]);
  md.use(container, 'div', {
    validate: (params: string) => {
      const name = params.trim().split(/\s+/)[0];
      return /^[A-Za-z][A-Za-z0-9_-]*$/.test(name) && !RESERVED_CONTAINERS.has(name);
    },
    render(tokens: MarkdownIt.Token[], idx: number) {
      const info = tokens[idx].info.trim();
      const name = info.split(/\s+/)[0];
      if (tokens[idx].nesting === 1) return `<div class="${name}" data-orz-container="${escapeAttr(info)}">\n`;
      return '</div>\n';
    },
  });
  md.use(footnote);
  // The same footnote list, appended in place (the plugin's own tail rule is quadratic).
  md.core.ruler.at('footnote_tail', footnoteTail);
  // Inline renders inside the document (span bodies, spoil labels) carry no
  // footnotes of their own (see env.ts).
  for (const name of ['footnote_inline', 'footnote_ref']) {
    const rule = (md.inline.ruler as unknown as { __rules__: Array<{ name: string; fn: (state: MarkdownIt.StateInline, silent: boolean) => boolean }> }).__rules__.find((r) => r.name === name);
    if (rule) {
      const fn = rule.fn;
      rule.fn = (state, silent) => ((state.env as Record<string, unknown> | undefined)?.['__orzNoFootnotes'] ? false : fn(state, silent));
    }
  }
  // Footnote breadcrumbs for copy-as-Markdown: the rendered "[1]" has lost the
  // author's label, so the reference carries its directive (`[^note]`, or
  // `^[text]` for an inline footnote) and each definition its label.
  {
    type Rule = NonNullable<MarkdownIt.Renderer.RenderRuleRecord[string]>;
    type FootnoteEnv = { footnotes?: { list?: Array<{ label?: string; content?: string }> } };
    const rules = md.renderer.rules;
    const ref = rules['footnote_ref'] as Rule;
    rules['footnote_ref'] = (tokens, idx, options, env, self) => {
      const html = ref(tokens, idx, options, env, self);
      const meta = tokens[idx].meta as { id: number; label?: string };
      const entry = (env as FootnoteEnv).footnotes?.list?.[meta.id];
      const directive = meta.label !== undefined ? `[^${meta.label}]` : entry?.content !== undefined ? `^[${entry.content}]` : null;
      return directive ? html.replace('<sup class="footnote-ref"', `<sup class="footnote-ref" data-md="${escapeAttr(directive)}"`) : html;
    };
    const open = rules['footnote_open'] as Rule;
    rules['footnote_open'] = (tokens, idx, options, env, self) => {
      const html = open(tokens, idx, options, env, self);
      const label = (env as FootnoteEnv).footnotes?.list?.[(tokens[idx].meta as { id: number }).id]?.label;
      return label !== undefined ? html.replace('class="footnote-item"', `class="footnote-item" data-footnote-label="${escapeAttr(label)}"`) : html;
    };
  }
  registerImsize(md);
  md.use(mark);
  md.use(sub);
  md.use(sup);
  md.use(ins);
  md.use(taskLists);
  md.core.ruler.at('github-task-lists', taskListsLinear); // the same output, linear (rules/task-lists.ts)
  // katex is pinned exactly in package.json, and the plugin's own `^0.16.0` is
  // satisfied by that version, so one KaTeX copy renders and KATEX_VERSION (and the
  // preview-frame stylesheet) match it (round 16, L6). Passing an instance via the
  // plugin's `katex` option is avoided: ESM and CJS loaders resolve `katex` and
  // `katex/contrib/mhchem` to different builds, and `\ce` would land on the other.
  md.use(katexPlugin, { enableMhchem: true, strict: 'ignore' }); // 'ignore': no console line per "\\\\" (round 19)
  // KaTeX's builder is quadratic in formula length, and macro definitions expand
  // a short formula without a bound `maxExpand` enforces (a 4 KB \def chain took
  // 267 s; round 19, H6). A formula over MAX_TEX characters, or one that defines
  // macros, renders as KaTeX renders an error: its source, escaped.
  const MAX_TEX = 10_000;
  const TEX_DEFINES = /\\(def|gdef|edef|xdef|let|futurelet|newcommand|renewcommand|providecommand|DeclareMathOperator|newenvironment)(?![A-Za-z])/;
  /**
   * What mhchem expands: the length of every `\ce{…}` / `\pu{…}` argument (not
   * the whole formula that mentions one: round 21, B-L1). An unclosed argument
   * runs to the end. Linear: one pass, a depth counter.
   */
  function chemLength(tex: string): number {
    let total = 0;
    // A nested `\ce` is inside the outer argument: the scan resumes after it.
    const re = /\\(?:ce|pu)(?![A-Za-z])\s*\{/g;
    for (let m = re.exec(tex); m; m = re.exec(tex)) {
      let depth = 1, i = m.index + m[0].length;
      const start = i;
      for (; i < tex.length && depth > 0; i++) {
        const c = tex[i];
        if (c === '\\') i++;
        else if (c === '{') depth++;
        else if (c === '}') depth--;
      }
      total += i - start;
      re.lastIndex = i;
    }
    return total;
  }
  for (const rule of ['math_inline', 'math_block'] as const) {
    const original = md.renderer.rules[rule];
    if (!original) continue;
    md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
      const tex = tokens[idx].content;
      // Per render, total TeX (and mhchem `\ce`/`\pu`, which expands ~500×) is
      // bounded too: one 10 KB `\ce` was 5 MB of output, 1 MB took 227 s (round 20, H5).
      const root = rootEnv(env);
      const used = (root['__orzTex'] as number | undefined) ?? 0;
      const chem = chemLength(tex);
      const usedChem = (root['__orzChem'] as number | undefined) ?? 0;
      const usedOut = (root['__orzKatexOut'] as number | undefined) ?? 0;
      const overBudget = used + tex.length > MAX_TEX_TOTAL || usedChem + chem > MAX_CHEM_TOTAL || usedOut > MAX_KATEX_OUTPUT;
      if (tex.length <= MAX_TEX && !TEX_DEFINES.test(tex) && !overBudget) {
        root['__orzTex'] = used + tex.length;
        root['__orzChem'] = usedChem + chem;
        const html = original(tokens, idx, options, env, self);
        root['__orzKatexOut'] = usedOut + html.length;
        return html;
      }
      const why = tex.length > MAX_TEX ? 'formula too long' : overBudget ? 'too much math in one document' : 'macro definitions are not supported';
      const span = `<span class="katex-error" title="${escapeAttr(why)}">${escapeHtml(tex)}</span>`;
      return rule === 'math_block' ? `<p class="katex-block">${span}</p>\n` : span;
    };
  }
  // Chinese/Japanese/Korean: no stray space where a line wraps between two CJK
  // characters, emphasis that works next to CJK punctuation, and bare URLs that
  // stop before CJK text (see plugins/cjk.ts).
  md.use(cjkBreaks);
  registerCjk(md);

  // Custom dispatchers
  md.block.ruler.after(
    'blockquote',
    'plugin_block_dispatcher',
    blockDispatcher,
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] }
  );

  md.inline.ruler.after('escape', 'plugin_inline_dispatcher', inlineDispatcher);

  // Register plugins that need access to the md instance.
  // Order matters: attrs must register before toc so the `attrs_resolve` core
  // rule runs before `toc_resolve` — TOC links must use the final heading ids,
  // including custom ids set via {{attrs[#...]}} (which override the
  // markdown-it-anchor slug).
  registerSpan(md, registerPlugins);
  registerAttrs(md, registerPlugins);
  registerToc(md, registerPlugins);
  registerMarkdownInclude(md, registerPlugins);

  // A UTF-8 byte-order mark (files saved by Windows Notepad) is not content: left
  // in place it hides a directive or heading on the first line from the parser.
  md.core.ruler.after('normalize', 'orz_strip_bom', (state) => {
    if (state.src.charCodeAt(0) === 0xfeff) state.src = state.src.slice(1);
  });

  // Per-document render state. A host may reuse one `env` object across renders,
  // so counters that must be unique per document (the nyml island ids) are reset
  // at the start of every top-level parse (file includes are spliced into the
  // same parse, so they keep counting).
  // Reference links repeat their definition's URL and title at every use: one
  // 10 KB definition used 80,000 times was 401 MB of output (markdown-it and
  // 1.6.3 alike; round 19, H7). Link and image targets may total at most 4× the
  // source plus 1 MB; past that, links render as their text.
  // After footnote_tail, so links inside footnotes (`^[…]`) count too (round 20,
  // H3); included files count toward the base (M3).
  md.core.ruler.after('footnote_tail', 'orz_link_budget', (state) => {
    let budget = 4 * (state.src.length + ((state.env as Record<string, unknown> | undefined)?.['__orzIncluded'] as number | undefined ?? 0)) + 1_000_000;
    for (const block of state.tokens) {
      if (block.type !== 'inline' || !block.children) continue;
      for (const t of block.children) {
        if (t.type !== 'link_open' && t.type !== 'image') continue;
        budget -= (t.attrGet('href') ?? t.attrGet('src') ?? '').length + (t.attrGet('title') ?? '').length;
        if (budget >= 0) continue;
        if (t.type === 'image') { t.attrSet('src', ''); t.attrs = (t.attrs ?? []).filter(([k]) => k !== 'title'); }
        else { t.attrSet('href', ''); t.attrs = (t.attrs ?? []).filter(([k]) => k !== 'title'); }
      }
    }
  });

  // Link references the host seeded in `env.references` (a markdown-it idiom)
  // stay; those a previous render defined go (round 21, B-M3). Each render
  // records the keys it added, and the next render on that object deletes only
  // those, so a key the host adds between renders survives too (round 22, L4).
  const renderRefs = new WeakMap<object, Map<string, unknown>>();
  const refsBefore = new WeakMap<object, Set<string>>();
  md.core.ruler.before('normalize', 'orz_render_state', (state) => {
    // Inline renders (a span body, a spoil label) share the document's env and
    // must not reset it.
    if (state.inlineMode) return;
    const env = state.env as Record<string, unknown> | undefined;
    // Footnotes too: a reused env listed the previous document's notes (round 19, L5).
    if (env) { delete env['__orzNymlCount']; delete env['__orzQrOutput']; delete env['__orzIncluded']; delete env['__orzIncludeCache']; delete env['__orzTex']; delete env['__orzChem']; delete env['__orzKatexOut']; delete env['__orzIncludeRead']; delete env['footnotes'];
      const refs = env['references'] as Record<string, unknown> | undefined;
      if (refs && typeof refs === 'object') {
        // Only while a key still holds what the render put there: a value the
        // host replaced is the host's (round 23, F5).
        for (const [k, v] of renderRefs.get(refs) ?? []) if (refs[k] === v) delete refs[k];
        refsBefore.set(refs, new Set(Object.keys(refs)));
      }
    }
  });
  md.core.ruler.push('orz_render_state_end', (state) => {
    const refs = (state.env as Record<string, unknown> | undefined)?.['references'];
    if (state.inlineMode || !refs || typeof refs !== 'object') return;
    const before = refsBefore.get(refs) ?? new Set<string>();
    const r = refs as Record<string, unknown>;
    renderRefs.set(refs, new Map(Object.keys(r).filter((k) => !before.has(k)).map((k) => [k, r[k]])));
  });

  // Renderer for plugin_block tokens
  md.renderer.rules['plugin_block'] = (
    tokens: MarkdownIt.Token[],
    idx: number,
    _options: MarkdownIt.Options,
    env: object
  ): string => {
    const token = tokens[idx];
    const def = getDefinition(token.info);
    if (!def) return '';
    // FC-18 §5: a nyml block whose kind is `document` (the document header)
    // renders nothing and takes no `nyml-data` number. The kind is read from the
    // same raw body `scanNymlBlocks` reads, so renderer and readHeader agree.
    if (token.info === 'nyml') {
      const raw = (token.meta as { rawBody?: string } | null)?.rawBody ?? token.content ?? '';
      if (parseNymlBody(raw).kind === 'document') return '';
    }
    const args = token.meta?.args ?? null;
    return def.render(args, token.content || null, env);
  };

  // Renderer for plugin_inline tokens
  md.renderer.rules['plugin_inline'] = (
    tokens: MarkdownIt.Token[],
    idx: number,
    _options: MarkdownIt.Options,
    env: object
  ): string => {
    const token = tokens[idx];
    const def = getDefinition(token.info);
    if (!def) return '';
    const args = token.meta?.args ?? null;
    const html = def.render(args, token.content || null, env);
    // A QR code alone in its paragraph is a "scan me" code: full size. One inside
    // a sentence is drawn at text size (common.css) and expands on tap.
    if ((token.info === 'qr' || token.info === 'qrcode') && tokens.every((t, i) => i === idx || t.type === 'softbreak' || (t.type === 'text' && !t.content.trim()))) {
      return html.replace('<span class="qrcode"', '<span class="qrcode qrcode--standalone"');
    }
    return html;
  };
  return md;
}

const md = createMarkdown();

export default md;
export { md };

// Document metadata (license, author, …) for the self-contained formats. The
// one implementation shared by orz-mdhtml / orz-slides / orz-paged.
export * from './doc-meta.js';
export * from './nyml-blocks.js';
export { maskInertMarkdown } from './source-scan.js';
export type { MarkdownMaskOptions } from './source-scan.js';
export { resolveIncludePath } from './plugins/markdown-include.js';
export type { IncludeEnv } from './plugins/markdown-include.js';
export { VERSION, KATEX_VERSION } from './version.js';
