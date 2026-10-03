import { describe, it, expect } from 'vitest';
import { md, prepareSources } from '../../src/index';

const one = (f: string) => ({ fetcher: async () => f });

describe('r24a: the split re-reads the tail at a line start', () => {
  it.each([
    'Intro {{md https://x.test/a.md}} # Not a heading\n\nAfter.\n',
    'Intro {{md https://x.test/a.md}} ```\n\n# Host heading\n\nHost text.\n',
    'Intro {{md https://x.test/a.md}} {{toc}}\n\n# Host heading\n',
    'Intro {{md https://x.test/a.md}} - not a list\n\nAfter.\n',
  ])('%j', async (host) => {
    const out = await prepareSources(host, one('Harmless fetched text.'));
    const strip = (h: string) => h.replace(/<p>Harmless fetched text.<\/p>\n/, '');
    const alone = md.render(host);
    const got = strip(md.render(out));
    console.log(JSON.stringify(alone), '\n=>', JSON.stringify(got));
    expect(got.replace(/<\/?p>|\n/g, ' ').replace(/\s+/g, ' ')).toBe(alone.replace(/\{\{md https:\/\/x.test\/a.md\}\}/, '').replace(/<\/?p>|\n/g, ' ').replace(/\s+/g, ' '));
  });
});
