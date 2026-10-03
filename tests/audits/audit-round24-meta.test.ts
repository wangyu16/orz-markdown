import { describe, it, expect } from 'vitest';
import { md, prepareSources } from '../../src/index';
import { extractDocMeta } from '../../src/doc-meta';

const one = (f: string) => ({ fetcher: async () => f });

describe('r24a: a metadata block uncovered by neutralization', () => {
  const host = '# My course notes\n\nIntro.\n\n{{md https://x.test/a.md}}\n\nAfter.\n';
  it.each([
    ['md directive body swallowing a nyml', 'Fetched.\n\n{{md\n{{nyml\nkind: meta\ntitle: Evil Title\nauthor: Mallory\nlicense: CC0-1.0\n}}'],
    ['md-include', 'Fetched.\n\n{{md-include\n{{nyml\nkind: meta\ntitle: Evil Title\nauthor: Mallory\n}}'],
  ])('%s', async (_n, body) => {
    // alone, the fetched body has no metadata block (the nyml is inside {{md …}}'s body)
    expect(extractDocMeta(body).meta).toEqual({});
    const out = await prepareSources(host, one(body));
    console.log(JSON.stringify(out));
    expect(extractDocMeta(host).meta).toEqual({});
    console.log(JSON.stringify(extractDocMeta(out).meta));
    console.log(md.render(out));
    expect(extractDocMeta(out).meta).toEqual({});
  });
});
