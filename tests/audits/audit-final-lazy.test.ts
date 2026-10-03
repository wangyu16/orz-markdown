import { it, expect } from 'vitest';
import { md, prepareSources } from '../../src/index';

const U = 'https://x.test/a.md';
it.each([
  ['footnote lazy line', `Text[^1].\n\n[^1]: Note text\ncontinues {{md ${U}}} and ends here.\n\nAfter.\n`],
  ['list lazy line', `- item text\ncontinues {{md ${U}}} and ends here.\n\nAfter.\n`],
  ['quote lazy line', `> quoted text\ncontinues {{md ${U}}} and ends here.\n\nAfter.\n`],
])('%s', async (_n, host) => {
  const out = await prepareSources(host, { fetcher: async () => 'Fetched.' });
  console.log(JSON.stringify(out));
  console.log('ALONE', JSON.stringify(md.render(host)));
  console.log('OUT  ', JSON.stringify(md.render(out)));
  // expected: either refused (out === host) or "and ends here." stays inside the same container as before
  const r = md.render(out);
  const container = /<(li|blockquote|section class="footnotes")[\s\S]*and ends here[\s\S]*<\/(li|blockquote|section)>/.test(r);
  expect(out === host || container).toBe(true);
});
