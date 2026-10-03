import { it, expect } from 'vitest';
import { md, prepareSources } from '../../src/index';

// A kept directive right after an accepted mid-line include starts the moved line and renders as nothing.
it.each([
  ['host not allowed', { allowedHosts: ['x.test'], fetcher: async () => 'Fetched.' }],
  ['fetch fails', { fetcher: async (u: string) => (u.includes('fail') ? null : 'Fetched.') }],
])('%s', async (_n, opts) => {
  const host = 'Intro {{md https://x.test/a.md}} {{md https://y.test/fail.md}}\n\nAfter.\n';
  const out = await prepareSources(host, opts);
  console.log(JSON.stringify(out), JSON.stringify(md.render(out)));
  // expected: the kept directive stays visible as in md.render(host)
  expect(md.render(out)).toContain('y.test/fail.md');
});
