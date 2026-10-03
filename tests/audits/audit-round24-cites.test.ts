import { describe, it, expect } from 'vitest';
import { md, prepareSources } from '../../src/index';

const one = (f: string) => ({ fetcher: async () => f });
const h = 'Intro.\n\n{{md https://x.test/a.md}}\n\nHost cites first[^a] and second[^b].\n\n[^a]: A.\n[^b]: B.\n';

describe('r24a: citations hidden from the cite scan', () => {
  it.each([
    ['plain (control, refused in r21)', 'Fetched paragraph cites[^b].'],
    ['inside an inline note', 'Fetched paragraph^[see [^b]].'],
    ['inside image alt', 'Fetched ![x [^b]](https://img.example/p.png) paragraph.'],
  ])('%s', async (_n, body) => {
    const out = await prepareSources(h, one(body));
    const html = md.render(out);
    console.log(JSON.stringify(_n), out === h ? 'KEPT' : 'SPLICED');
    console.log(html);
    expect(out).toBe(h);
  });
});
