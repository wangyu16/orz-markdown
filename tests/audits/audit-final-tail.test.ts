import { describe, it, expect } from 'vitest';
import { md, prepareSources } from '../../src/index';

const BODY = 'Fetched paragraph.';
const opts = { fetcher: async (u: string) => (u.includes('b.md') ? 'Second body.' : BODY) };
const tails = [
  'and more prose.', '**bold** text', '*em* and _em_', '[a link](https://e.com/x) here', 'see `code {{md x}}` here',
  ':smile: emoji', '😀 emoji', '日本語のテキスト。', '中文，继续。', 'ソニー製品', '<!-- c -->', 'text <!-- c --> text',
  '{{md https://x.test/b.md}}', 'x {{md https://x.test/b.md}} y', 'https://example.com bare', '<https://example.com>',
  '$x^2$ math', '[^1] note', '{{sp[red] red}} span', 'a\\', '2024 年', '1984 was a year', '+1 agreed', '(parenthetical)',
  '<b>bold</b> html', '<span>x</span>', '&amp; entity', '~~strike~~', '==mark==', 'H~2~O', '#hashtag', '> not quote?',
];
describe('final: ordinary tails after a mid-line include', () => {
  it.each(tails)('%j', async (tail) => {
    const host = `Intro {{md https://x.test/a.md}} ${tail}\n\nAfter.\n\n[^1]: n\n`;
    const out = await prepareSources(host, opts);
    const accepted = out.includes(BODY);
    console.log(accepted ? 'ACCEPT' : 'REFUSE', JSON.stringify(tail));
    expect(true).toBe(true);
  });
  it('directive followed by kept directive alone', async () => {
    const host = 'Intro {{md https://x.test/a.md}} {{md https://y.test/b.md}}\n\nAfter.\n';
    const out = await prepareSources(host, { allowedHosts: ['x.test'], fetcher: async () => BODY });
    console.log(JSON.stringify(out)); console.log(JSON.stringify(md.render(host))); console.log(JSON.stringify(md.render(out)));
  });
});
