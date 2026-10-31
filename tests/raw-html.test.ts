/**
 * D-127: the raw-HTML allowlist render setting (`env.orzRawHtml`). Probe inputs
 * include the ones Alembic's interim cleaner missed in its rounds 3–4 audits.
 * Oracle: the output is parsed by a DOM (happy-dom) and must hold no element
 * that runs or embeds anything, no event handler and no script URL.
 */
import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import { md, createMarkdown } from '../src/index';
import { allowlistHtml } from '../src/raw-html';

const strict = (src: string) => md.render(src, { orzRawHtml: 'allowlist' });
const BAD_ELEMENTS = 'script,iframe,object,embed,style,svg,math,base,meta,link,form,textarea,template,frame,frameset,noscript,xmp,plaintext,title';

function dangers(html: string): string[] {
  const doc = new Window().document;
  doc.body.innerHTML = html;
  const out: string[] = [];
  for (const el of doc.body.querySelectorAll('*')) {
    if (el.matches(BAD_ELEMENTS)) out.push(`<${el.tagName.toLowerCase()}>`);
    for (const a of Array.from(el.attributes)) {
      if (/^on/i.test(a.name)) out.push(`${a.name}=`);
      if (/^(href|src|action|formaction|xlink:href|poster|cite)$/i.test(a.name) && /^\s*(javascript|vbscript|data):/i.test(a.value.replace(/[\u0000- ]/g, ''))) out.push(`${a.name}=${a.value}`);
    }
  }
  return out;
}

const PROBES: Record<string, string> = {
  'script block': '<script>alert(1)</script>',
  'inline img onerror': 'a <img src=x onerror=alert(1)> b',
  'img slash form': '<img/src=x onerror=alert(1)>',
  'newline before handler': '<img src=x\nonerror=alert(1)>',
  'bogus comment': '<?x><img src=x onerror=alert(1)>',
  'early comment end': '<!--x--!><img src=x onerror=alert(1)>-->',
  'cdata': '<![CDATA[<img src=x onerror=alert(1)>]]>',
  'entity scheme': '<a href="&#106;avascript:alert(1)">x</a>',
  'tab in scheme': '<a href="java&#9;script:alert(1)">x</a>',
  'svg': '<svg onload=alert(1)><circle r=1></svg>',
  'iframe': '<iframe src="https://example.com" srcdoc="<script>alert(1)</script>"></iframe>',
  'style': '<style>body{display:none}</style>',
  'form': '<form action="https://x"><button formaction="javascript:alert(1)">go</button></form>',
  'table cell': '| a | b |\n|---|---|\n| <img src=x onerror=alert(1)> | <script>alert(1)</script> |',
  'spoil label': '::: spoil <img src=x onerror=alert(1)>\nbody\n:::',
  'span body': 'x {{sp <img src=x onerror=alert(1)>}} y',
  'span body nested html': 'x {{sp[red] <b onclick=alert(1)>hi</b>}} y',
  'attrs handler': 'para {{attrs[onclick="alert(1)"]}}',
  'attrs href': '[link](https://x.org){{attrs[href="javascript:alert(1)"]}}',
  'textarea breakout': '<textarea><img src=x onerror=alert(1)></textarea>',
  'uppercase': '<SCRIPT>alert(1)</SCRIPT><IMG SRC=x ONERROR=alert(1)>',
  'base and meta': '<base href="https://evil"><meta http-equiv="refresh" content="0;url=https://evil">',
  'img data url': '<img src="data:image/svg+xml,<svg onload=alert(1)>">',
  'object embed': '<object data="x.swf"></object><embed src="x.swf">',
};

describe('raw HTML allowlist render setting (D-127)', () => {
  for (const [name, src] of Object.entries(PROBES)) {
    it(`[M.45] refuses ${name}`, () => {
      const html = strict(src);
      expect(dangers(html)).toEqual([]);
    });
  }

  it('[M.45] the refused HTML is shown as text', () => {
    expect(strict('<script>alert(1)</script>')).toContain('&lt;script>alert(1)&lt;/script>');
    expect(strict('a <img src=x onerror=alert(1)> b')).toContain('a &lt;img src=x onerror=alert(1)> b');
  });

  it('[M.45] keeps the harmless HTML authors use', () => {
    const html = strict([
      'H<sub>2</sub>O and x<sup>2</sup><br>line',
      '',
      '<span style="color:red" class="note" title="t">red</span>',
      '',
      '<details><summary>More</summary>',
      '',
      'hidden',
      '',
      '</details>',
      '',
      '<!-- slide -->',
      '',
      '<a href="https://example.com" target="_blank" rel="noopener">site</a>',
      '',
      '<img src="assets/x.png" alt="x" width="200">',
      '',
      '- [ ] todo',
      '- [x] done',
    ].join('\n'));
    for (const piece of ['<sub>2</sub>', '<sup>2</sup>', '<br>', '<span style="color:red" class="note" title="t">', '<details><summary>More</summary>', '<!-- slide -->', '<a href="https://example.com" target="_blank" rel="noopener">', '<img src="assets/x.png" alt="x" width="200">', 'type="checkbox"']) {
      expect(html).toContain(piece);
    }
    expect(html).not.toContain('&lt;');
  });

  it('[M.45] a document with no raw HTML renders byte for byte the same', () => {
    const src = '# T\n\nSome *text* with $x^2$ and a [link](https://x.org).\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n::: spoil Show\nbody\n:::\n\n{{sp[red] **red**}} {{attrs[.c #id1]}}\n';
    expect(strict(src)).toBe(md.render(src));
  });

  it('[M.45] the default trusts the author (unchanged); any other setting is the allowlist', () => {
    expect(md.render('<script>x</script>')).toContain('<script>x</script>');
    expect(md.render('<script>x</script>', { orzRawHtml: 'allow' })).toContain('<script>x</script>');
    expect(md.render('<script>x</script>', { orzRawHtml: 'allowList' })).not.toContain('<script>');
    expect(md.render('<script>x</script>', { orzRawHtml: true })).not.toContain('<script>');
  });

  it('[M.45] a fresh parser instance has the setting too', () => {
    expect(createMarkdown().render('<script>x</script>', { orzRawHtml: 'allowlist' })).not.toContain('<script>');
  });

  it('[M.45] attrs keep safe attributes and drop the rest', () => {
    const html = strict('para {{attrs[.c #ok onclick="x" style="color:red"]}}');
    expect(html).toContain('class="c"');
    expect(html).toContain('id="ok"');
    expect(html).toContain('style="color:red"');
    expect(html).not.toContain('onclick');
    expect(strict('para {{attrs[#orzRuntime]}}')).not.toContain('orzRuntime');
  });

  it('[M.45] linear in the number of "<"', () => {
    const big = "<".repeat(100_000) + "<a".repeat(100_000) + "<!--".repeat(100_000) + "<!--x--!>".repeat(50_000);
    const t = performance.now();
    const out = allowlistHtml(big, { unescapeAll: (s) => s, validateLink: () => true });
    expect(performance.now() - t).toBeLessThan(2000);
    expect(out.startsWith('&lt;&lt;')).toBe(true);
  });
});
