import { describe, it, expect } from 'vitest';
import { md, prepareSources } from '../../src/index';

const one = (f: string) => ({ fetcher: async () => f });

describe('r24a: TOC cap when the over-estimate already crosses for the host', () => {
  it('[M.16] a host chapter TOC keeps its entries next to an include adding headings (round 24, A-M2)', async () => {
    // A book: chapter TOC (h1 only), 3 chapters, 7,000 sections. Real host TOC = 3 entries.
    const secs = Array.from({ length: 7000 }, (_, i) => `### s${i}\n`).join('\n');
    const host = `{{toc 1,1}}\n\n{{toc 2,2}}\n\n{{toc 1,1}}\n\n# Chapter One\n\n${secs}\n\n{{md https://x.test/a.md}}\n`;
    const alone = md.render(host);
    expect(alone).toContain('href="#chapter-one"');
    const body = Array.from({ length: 20000 }, (_, i) => `# c${i}`).join('\n\n');
    const out = await prepareSources(host, one(body));
    const html = md.render(out);
    const n = (html.match(/href="#chapter-one"/g) ?? []).length;
    expect(n).toBe(2);
  }, 120_000);
});
