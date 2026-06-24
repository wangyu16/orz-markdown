// Tests the copy-as-markdown DOM->Markdown walker shipped in
// browserRuntimeScript. We execute the runtime IIFE (which exposes
// OrzMarkdownRuntime.elementToMarkdown), parse rendered Markdown into a DOM
// with happy-dom, then convert selected elements back to Markdown.
//
// happy-dom is an optional devDependency: if it isn't installed (e.g. an
// offline CI run), the whole suite is skipped rather than failing.
import { describe, it, expect, beforeAll } from 'vitest';
import { createRequire } from 'node:module';
import { md } from '../src/index.js';
import { browserRuntimeScript } from '../src/runtime.js';

const require = createRequire(import.meta.url);
let hasHappyDom = false;
try {
  require.resolve('happy-dom');
  hasHappyDom = true;
} catch {
  // happy-dom not installed — block is skipped below.
}

type ElementToMarkdown = (node: unknown) => string;

const suite = hasHappyDom ? describe : describe.skip;

suite('copy-as-markdown walker', () => {
  let win: { document: Document };
  let elementToMarkdown: ElementToMarkdown;

  beforeAll(async () => {
    const { Window } = await import('happy-dom');
    win = new Window() as unknown as { document: Document };
    // The runtime IIFE binds OrzMarkdownRuntime onto globalThis. It only touches
    // global.document at load (guarded), so it runs fine without a DOM here; we
    // just need the exported elementToMarkdown.
    (0, eval)(browserRuntimeScript);
    elementToMarkdown = (globalThis as unknown as {
      OrzMarkdownRuntime: { elementToMarkdown: ElementToMarkdown };
    }).OrzMarkdownRuntime.elementToMarkdown;
  });

  /** Render `source`, select `selector` (or the whole doc), return copied Markdown. */
  function copyOf(source: string, selector?: string): string {
    const doc = win.document;
    const root = doc.createElement('div');
    root.className = 'markdown-body';
    root.innerHTML = md.render(source);
    const el = selector ? root.querySelector(selector) : root;
    if (!el) throw new Error('selector not found: ' + selector);
    const wrap = doc.createElement('div');
    wrap.appendChild(el.cloneNode(true));
    return elementToMarkdown(wrap);
  }

  it('headings', () => {
    expect(copyOf('# Title', 'h1')).toBe('# Title');
    expect(copyOf('### Deep', 'h3')).toBe('### Deep');
  });

  it('inline emphasis, code, links', () => {
    expect(copyOf('A **bold** and *italic* and `code`.', 'p'))
      .toBe('A **bold** and *italic* and `code`.');
    expect(copyOf('See [the site](https://example.com).', 'p'))
      .toBe('See [the site](https://example.com).');
  });

  it('mark / ins / del / sub / sup', () => {
    expect(copyOf('==hi==', 'p')).toBe('==hi==');
    expect(copyOf('++ins++', 'p')).toBe('++ins++');
    expect(copyOf('~~del~~', 'p')).toBe('~~del~~');
    expect(copyOf('H~2~O', 'p')).toBe('H~2~O');
    expect(copyOf('x^2^', 'p')).toBe('x^2^');
  });

  it('bullet and ordered lists', () => {
    expect(copyOf('- a\n- b\n- c', 'ul')).toBe('- a\n- b\n- c');
    expect(copyOf('1. one\n2. two', 'ol')).toBe('1. one\n2. two');
  });

  it('nested lists', () => {
    expect(copyOf('- a\n  - a1\n  - a2\n- b', 'ul'))
      .toBe('- a\n  - a1\n  - a2\n- b');
  });

  it('task lists', () => {
    expect(copyOf('- [ ] todo\n- [x] done', 'ul')).toBe('- [ ] todo\n- [x] done');
  });

  it('tables', () => {
    expect(copyOf('| A | B |\n|:--|--:|\n| 1 | 2 |', 'table'))
      .toBe('| A | B |\n| :--- | ---: |\n| 1 | 2 |');
  });

  it('blockquotes', () => {
    expect(copyOf('> quoted line', 'blockquote')).toBe('> quoted line');
  });

  it('fenced code blocks keep the language', () => {
    expect(copyOf('```js\nconsole.log(1);\n```', 'pre'))
      .toBe('```js\nconsole.log(1);\n```');
  });

  it('inline math via the KaTeX annotation', () => {
    expect(copyOf('Euler $e^{i\\pi}+1=0$ here.', 'p'))
      .toBe('Euler $e^{i\\pi}+1=0$ here.');
  });

  it('display math', () => {
    const out = copyOf('$$\n\\int_0^1 x\\,dx\n$$', '.katex-display');
    expect(out.startsWith('$$')).toBe(true);
    expect(out).toContain('\\int_0^1');
  });

  it('data-md breadcrumb: mermaid', () => {
    expect(copyOf('{{mermaid\ngraph TD;\nA-->B;\n}}', '.mermaid'))
      .toBe('{{mermaid\ngraph TD;\nA-->B;\n}}');
  });

  it('data-md breadcrumb: youtube', () => {
    expect(copyOf('{{youtube dQw4w9WgXcQ}}', '.youtube-embed'))
      .toBe('{{youtube dQw4w9WgXcQ}}');
  });

  it('data-md breadcrumb: inline qr copies the directive, not the SVG', () => {
    expect(copyOf('Scan {{qr https://example.com}} now.', 'p'))
      .toBe('Scan {{qr https://example.com}} now.');
  });

  it('data-md breadcrumb: smiles', () => {
    expect(copyOf('{{smiles CCO}}', '.smiles-render')).toBe('{{smiles CCO}}');
  });

  it('whole-document multi-block selection', () => {
    expect(copyOf('# T\n\nPara **x**.\n\n- a\n- b'))
      .toBe('# T\n\nPara **x**.\n\n- a\n- b');
  });
});
