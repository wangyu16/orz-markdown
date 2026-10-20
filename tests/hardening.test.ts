/**
 * 2.0.0 hardening — escaping, inert-region scanning, render state, the shared
 * carrier helpers, version constants, and browser-bundle cleanliness. Each test
 * pins a defect that downstream projects would otherwise inherit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { md, scanNymlBlocks, extractDocMeta, mergeDocMeta, prepareSources, maskInertMarkdown, VERSION, KATEX_VERSION } from '../src/index';
import { escapeScriptText, unescapeScriptText, jsonForScript } from '../src/carrier';
import { PREVIEW_CDN, PREVIEW_LIB_VERSIONS } from '../src/preview-frame';
import { parseImageSize } from '../src/plugins/imsize';

const require = createRequire(import.meta.url);

describe('attribute and text escaping', () => {
  it('escapes a quote in a tab label', () => {
    const html = md.render('::: tabs\n::: tab Say "hi"\nx\n:::\n:::\n');
    expect(html).toContain('data-label="Say &quot;hi&quot;"');
  });

  it('escapes a span class', () => {
    const html = md.render('{{sp[a" onclick="x] text}}');
    expect(html).toContain('class="a&quot; onclick=&quot;x"');
    expect(html).not.toContain('onclick="x"');
  });

  it('escapes cols and left values', () => {
    // Since round 12 a value that is not a CSS length never reaches style at
    // all; the copy breadcrumb still carries it, escaped.
    for (const src of ['::: cols 1 2"x\nA\n:::\n', '::: left 40%"x\nA\n:::\n']) {
      const html = md.render(src);
      expect(html).not.toContain('style=');
      expect(html).toContain('&quot;x"');
      expect(html).not.toContain('"x"');
    }
  });

  it('URL-encodes a youtube id', () => {
    // Since round 20 an id must be [A-Za-z0-9_-]: no embed at all for this one
    // (since round 21 it shows as escaped text).
    const html = md.render('{{youtube abc" onload="x}}');
    expect(html).not.toContain('<iframe');
    expect(html.slice(0, html.indexOf('>'))).not.toContain('onload="'); // as text, not an attribute
  });

  it('escapes an unknown emoji name in the fallback', () => {
    expect(md.renderInline('{{emoji <b>}}')).toContain('{{emoji &lt;b&gt;}}');
  });

  it('escapes heading text in a TOC', () => {
    const html = md.render('{{toc}}\n\n## Use `<div>` here\n');
    expect(html).toContain('">Use &lt;div&gt; here</a></li>');
    expect(html).not.toContain('<li style="padding-left:1.25em"><a href="#use-%3Cdiv%3E-here">Use <div>');
  });

  it('renders a spoil label as inline Markdown', () => {
    const html = md.render('::: spoil **Answer** $x$\nhidden\n:::\n');
    expect(html).toContain('<details class="spoil"><summary data-orz-container="spoil **Answer** $x$"><strong>Answer</strong>');
    expect(html).toContain('class="katex"');
  });
});

describe('inline renders stay isolated from the document env', () => {
  it('emits the footnote list exactly once with spans and spoil labels present', () => {
    const html = md.render('Text[^1] {{sp[red] red}}.\n\n::: spoil **Hint**\nx\n:::\n\n[^1]: Note.\n');
    expect(html.match(/class="footnotes"/g)).toHaveLength(1);
    expect(html).toContain('<span class="red">red</span>');
  });
});

describe('nyml render state', () => {
  it('gives each nyml island a unique id', () => {
    const html = md.render('{{nyml\na: 1\n}}\n\n{{nyml\nb: 2\n}}\n');
    expect(html).toContain('id="nyml-data"');
    expect(html).toContain('id="nyml-data-2"');
  });

  it('restarts numbering per document even when the env object is reused', () => {
    const env = {};
    md.render('{{nyml\na: 1\n}}\n', env);
    const second = md.render('{{nyml\na: 1\n}}\n', env);
    expect(second).toContain('id="nyml-data"');
    expect(second).not.toContain('nyml-data-2');
  });

  it('writes nyml JSON that cannot leave its script element', () => {
    const html = md.render('{{nyml\nnote: <!-- <script> </script>\n}}\n');
    const body = html.slice(html.indexOf('>') + 1, html.lastIndexOf('</script>'));
    expect(body).not.toContain('<');
  });
});

describe('inert regions (code, comments) are never scanned as directives', () => {
  const doc = [
    '# How to add metadata',
    '',
    '```markdown',
    '{{nyml',
    'kind: meta',
    'author: Example Person',
    '}}',
    '```',
    '',
    'Inline: `{{nyml kind: meta}}` is the syntax.',
    '',
    '{{nyml',
    'kind: meta',
    'author: Real Author',
    '}}',
  ].join('\n');

  it('scanNymlBlocks skips fenced and inline-code examples', () => {
    const blocks = scanNymlBlocks(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].fields.author).toBe('Real Author');
  });

  it('extractDocMeta keeps the documentation example in the body', () => {
    const { meta, body } = extractDocMeta(doc);
    expect(meta.author).toBe('Real Author');
    expect(body).toContain('author: Example Person');
  });

  it('agrees with the renderer about nyml inside a raw HTML block (not a block there)', () => {
    // Round 5: scanning now masks HTML blocks like the renderer (orz-paged's
    // 38 template blocks and its suite are unaffected).
    const inHtml = '<div class="x">\n{{nyml\nkind: element\nname: a\n}}\n</div>\n';
    expect(scanNymlBlocks(inHtml)).toHaveLength(0);
    expect(md.render(inHtml)).not.toContain('nyml-data');
    expect(scanNymlBlocks('<div class="x"></div>\n\n{{nyml\nkind: element\n}}\n')).toHaveLength(1);
  });

  it('still skips commented-out blocks', () => {
    expect(scanNymlBlocks('<!--\n{{nyml\nkind: meta\n}}\n-->\n')).toHaveLength(0);
  });

  it('does not let a stray backtick hide a later block', () => {
    const src = 'An apostrophe-like ` here.\n\n{{nyml\nkind: meta\nauthor: A\n}}\n\nAnd ` there.\n';
    expect(scanNymlBlocks(src)).toHaveLength(1);
  });

  it('maskInertMarkdown preserves length and line breaks', () => {
    const masked = maskInertMarkdown(doc);
    expect(masked.length).toBe(doc.length);
    expect(masked.split('\n').length).toBe(doc.split('\n').length);
  });

  it('prepareSources does not fetch URLs inside code', async () => {
    const fetched: string[] = [];
    const src = '```\n{{md-include https://a.test/x.md}}\n```\n\n`{{markdown https://a.test/y.md}}`\n\n{{md-include https://a.test/z.md}}\n';
    const out = await prepareSources(src, { fetcher: async (u) => { fetched.push(u); return '## Z'; } });
    expect(fetched).toEqual(['https://a.test/z.md']);
    expect(out).toContain('{{md-include https://a.test/x.md}}');
    expect(out).toContain('## Z');
  });

  it('prepareSources survives a throwing fetcher', async () => {
    const src = '{{md-include https://a.test/x.md}}\n';
    const out = await prepareSources(src, { fetcher: async () => { throw new Error('boom'); } });
    expect(out).toBe(src);
  });
});

describe('mergeDocMeta ignores blank host values', () => {
  it('does not let empty strings or arrays erase the source', () => {
    const merged = mergeDocMeta(
      { author: 'A', keywords: ['k'], license: { spdx: 'CC-BY-4.0' } },
      { author: '', keywords: [], description: '  ', license: { spdx: '', url: 'u' }, uid: 'doc-1' },
    );
    expect(merged).toEqual({ author: 'A', keywords: ['k'], license: { spdx: 'CC-BY-4.0', url: 'u' }, uid: 'doc-1' });
  });
});

describe('carrier escaping helpers', () => {
  const cases = [
    'plain',
    'a </script> b',
    'a <script> b <SCRIPT src=x>',
    'already <\\/script> escaped',
    'deep <\\\\/script> and <\\script>',
    '<!-- comment --> stays',
  ];

  it('escapeScriptText is reversible for every input', () => {
    for (const c of cases) expect(unescapeScriptText(escapeScriptText(c))).toBe(c);
  });

  it('leaves no raw </script or <script in the escaped text', () => {
    for (const c of cases) expect(escapeScriptText(c)).not.toMatch(/<\/?script/i);
  });

  it('reads files written by the old one-way escape', () => {
    // Before 2.0.0 carriers stored `</script` as `<\/script` and nothing else.
    expect(unescapeScriptText('x <\\/script> y')).toBe('x </script> y');
  });

  it('jsonForScript round-trips and never emits a raw <', () => {
    const value = { a: '</script><!--<script>', b: ' ' };
    const json = jsonForScript(value);
    expect(json).not.toContain('<');
    expect(JSON.parse(json)).toEqual(value);
  });
});

describe('image size syntax (internal port of markdown-it-imsize)', () => {
  it('parses every size form', () => {
    expect(parseImageSize('=300x200', 0, 8)).toMatchObject({ ok: true, width: '300', height: '200' });
    expect(parseImageSize('=300x', 0, 5)).toMatchObject({ ok: true, width: '300', height: '' });
    expect(parseImageSize('=x200', 0, 5)).toMatchObject({ ok: true, width: '', height: '200' });
    expect(parseImageSize('=50%x', 0, 5)).toMatchObject({ ok: true, width: '50%', height: '' });
    expect(parseImageSize('=300', 0, 4).ok).toBe(false);
  });

  it('renders sizes on inline and reference images', () => {
    expect(md.render('![a](i.png =10x20)')).toContain('<img src="i.png" alt="a" width="10" height="20">');
    expect(md.render('![a](i.png "T" =x5)')).toContain('<img src="i.png" alt="a" title="T" height="5">');
    expect(md.render('![a][r]\n\n[r]: i.png')).toContain('<img src="i.png" alt="a">');
  });
});

describe('version constants', () => {
  it('VERSION matches package.json (run `npm run build` to regenerate)', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(VERSION).toBe(pkg.version);
  });

  it('KATEX_VERSION matches the installed KaTeX, and the preview CSS uses it', () => {
    expect(KATEX_VERSION).toBe(require('katex/package.json').version);
    expect(PREVIEW_CDN.katexCss).toContain(`katex@${KATEX_VERSION}/`);
  });

  it('pins every preview library to an exact version', () => {
    for (const v of Object.values(PREVIEW_LIB_VERSIONS)) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    for (const url of Object.values(PREVIEW_CDN)) expect(url).not.toMatch(/@\d+\//);
  });
});

describe('browser bundle needs no Node shims', () => {
  it('bundles with esbuild for the browser and renders without process/require', async () => {
    const { build } = await import('esbuild');
    const result = await build({
      entryPoints: ['src/index.ts'],
      bundle: true,
      platform: 'browser',
      format: 'iife',
      globalName: 'orzmd',
      write: false,
      logLevel: 'silent',
      target: ['es2020'],
    });
    const ctx: Record<string, unknown> = { console };
    ctx.globalThis = ctx;
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(result.outputFiles[0].text, ctx);
    const browserMd = (ctx.orzmd as { md: typeof md }).md;
    const html = browserMd.render('# T $x$\n\n![a](i.png =10x20)\n\n{{md /etc/hosts}}\n');
    expect(html).toContain('class="katex"');
    expect(html).toContain('width="10"');
    expect(html).not.toContain('localhost');
  }, 60_000);

  it('[M.43] prepublishOnly builds, runs the family release gate and the stamp check, never the suite; the tiers are scripts; the tooling is not shipped (family Phase 4)', async () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string>; files: string[] };
    expect(pkg.scripts['prepublishOnly']).toBe('npm run build && tsx scripts/release-check.ts --after-build && tsx scripts/test-release.ts --check');
    expect(pkg.scripts['release:check']).toBe('tsx scripts/release-check.ts');
    expect(pkg.scripts['test:release']).toBe('tsx scripts/test-release.ts');
    expect(pkg.scripts['test:fast']).toBe('tsx scripts/test-release.ts --fast');
    expect(pkg.scripts['test:changed']).toBe('tsx scripts/test-release.ts --changed');
    expect(readFileSync('.gitignore', 'utf8').split('\n')).toContain('.release/');
    for (const f of pkg.files) expect(f, 'the release tooling is never shipped').not.toMatch(/^(scripts|\.release|release\.config\.json)/);
    const config = JSON.parse(readFileSync('release.config.json', 'utf8')) as Record<string, unknown>;
    expect(config).toMatchObject({ browser: null, kit: null, bundles: ['dist'], checks: [['node', 'build/web-bundle.mjs', '--check']] });
    const { releaseProblems } = await import('../scripts/release-check');
    const ok = { name: 'orz-markdown', version: '2.4.0', browserVersion: null, kitRange: null, kitLinked: false, kitInstalled: null, kitLocked: null, bundledKit: [], manifestKit: null, changelog: '## [2.4.0] - 2026-10-17\n', head: 'abc', clean: true, dirty: [], checkFailures: [] };
    const cfg = { browser: null, kit: null, manifest: null, bundles: ['dist'], checks: [], build: ['npm', 'run', 'build'], changelog: 'CHANGELOG.md' };
    expect(releaseProblems(ok, cfg)).toEqual([]);
    expect(releaseProblems({ ...ok, clean: false, dirty: [' M dist/index.js'] }, cfg, { afterBuild: true })[0]).toMatch(/build changed tracked files/);
  });
});
