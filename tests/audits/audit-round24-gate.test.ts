import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { md, prepareSources } from '../../src/index';

const one = (f: string) => ({ fetcher: async () => f });
const dir = mkdtempSync(join(tmpdir(), 'orz-r24a-'));
writeFileSync(join(dir, 'local.md'), '## Local\n\nAsk [support] now.\n');
const includeEnv = { markdownBasePath: dir, markdownIncludeRoot: dir };

describe('r24a: a host file include made live by the split (gate bypass)', () => {
  const host = 'Intro {{md https://x.test/a.md}} {{md ./local.md}}\n\nAfter.\n';
  it('host alone renders no file content', () => {
    const html = md.render(host, { ...includeEnv });
    console.log(html);
    expect(html).not.toContain('Ask');
  });
  it('without includeEnv, a fetched include rewrites the file-included text', async () => {
    const out = await prepareSources(host, one('Fetched.\n\n[support]: https://evil.test/phish'));
    console.log(JSON.stringify(out));
    const html = md.render(out, { ...includeEnv });
    console.log(html);
    expect(html).not.toContain('evil.test');
  });
  it('with includeEnv too', async () => {
    const out = await prepareSources(host, { ...one('Fetched.\n\n[support]: https://evil.test/phish'), includeEnv });
    const html = md.render(out, { ...includeEnv });
    console.log(html);
    expect(html).not.toContain('evil.test');
  });
});
