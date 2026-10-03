import { it, expect } from 'vitest';
import { md, prepareSources } from '../../src/index';

it('fw-letter rule vs ー', () => {
  for (const s of ['サーバｗｗｗ.example.com', 'サーバーｗｗｗ.example.com', 'データＡＢＣ.jp', 'データーＡＢＣ.jp', 'コーヒーｗｗｗ.example.com']) console.log(JSON.stringify(s), JSON.stringify(md.render(s)));
  // expected: same decision with or without the trailing ー (both prose glued onto a full-width host)
  expect(md.render('サーバーｗｗｗ.example.com').includes('<a')).toBe(md.render('サーバｗｗｗ.example.com').includes('<a'));
});
it('hasLocalInclude: renderer-inert spellings do not gate', async () => {
  const f = { fetcher: async () => 'Body.' };
  for (const extra of ['{{md}}', '{{md ftp://h/x}}', '{{md file:///etc/x}}', '`{{md ./x}}`', '\\{{md ./x}}', 'text {{md ./x}} text']) {
    const out = await prepareSources(`${extra}\n\n{{md https://x.test/a.md}}\n`, f);
    expect(out, extra).toContain('Body.');
  }
  expect(await prepareSources('{{md ./x.md}}\n\n{{md https://x.test/a.md}}\n', f)).not.toContain('Body.');
});
it('M.21: no fetch in Node without allowedHosts/fetcher; fetch with document', async () => {
  const host = '{{md https://x.test/a.md}}\n';
  expect(await prepareSources(host)).toBe(host);
  expect(await prepareSources(host, { allowedHosts: [] })).toBe(host);
});
