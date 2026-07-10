import { describe, it, expect } from 'vitest';
import {
  DOC_META_ISLAND_ID,
  extractDocMeta,
  mergeDocMeta,
  parseDocMetaIsland,
  renderDocMetaHead,
  renderDocMetaIsland,
  type DocMeta,
} from '../src/doc-meta';
import { md } from '../src/index';

const SOURCE = `{{nyml
kind: meta
title: Introduction to Polymers
author: Dr. Yu Wang
description: Chain growth and step growth.
license: CC-BY-4.0
license_name: CC BY 4.0
license_url: https://creativecommons.org/licenses/by/4.0/
source: https://github.com/wangyu16/chem320-oer
date: 2026-09-01
keywords: polymers, chemistry
}}

# Introduction to Polymers

Body text.
`;

describe('extractDocMeta', () => {
  it('reads every field out of a kind: meta block', () => {
    const { meta } = extractDocMeta(SOURCE);
    expect(meta.title).toBe('Introduction to Polymers');
    expect(meta.author).toBe('Dr. Yu Wang');
    expect(meta.description).toBe('Chain growth and step growth.');
    expect(meta.source).toBe('https://github.com/wangyu16/chem320-oer');
    expect(meta.date).toBe('2026-09-01');
    expect(meta.keywords).toEqual(['polymers', 'chemistry']);
    expect(meta.license).toEqual({
      spdx: 'CC-BY-4.0',
      name: 'CC BY 4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
    });
  });

  it('removes the block from the body', () => {
    const { body } = extractDocMeta(SOURCE);
    expect(body).not.toContain('{{nyml');
    expect(body.startsWith('# Introduction to Polymers')).toBe(true);
    expect(body).toContain('Body text.');
  });

  it('leaves the body untouched when there is no meta block', () => {
    const plain = '# Title\n\nText.\n';
    const { meta, body } = extractDocMeta(plain);
    expect(meta).toEqual({});
    expect(body).toBe(plain);
  });

  it('leaves OTHER nyml blocks alone', () => {
    const src = `{{nyml
kind: meta
author: A
}}

{{nyml
kind: document
page_size: A4
}}

# T
`;
    const { meta, body } = extractDocMeta(src);
    expect(meta.author).toBe('A');
    expect(body).toContain('kind: document');
    expect(body).toContain('page_size: A4');
  });

  it('never renders the metadata into the visible body', () => {
    // The whole point of using nyml: metadata is saved in the file, not shown.
    const { body } = extractDocMeta(SOURCE);
    const html = md.render(body);
    expect(html).not.toContain('Dr. Yu Wang');
    expect(html).not.toContain('CC-BY-4.0');
    // And no stray nyml-data script from the meta block (its id is fixed, so a
    // second one would duplicate the id).
    expect(html).not.toContain('nyml-data');
  });
});

describe('mergeDocMeta — the host wins', () => {
  it('overrides a stale source field with the host value', () => {
    const source: DocMeta = { author: 'Stale', license: { spdx: 'CC0-1.0' } };
    const host: DocMeta = { author: 'Real', license: { spdx: 'CC-BY-4.0', url: 'u' } };
    const merged = mergeDocMeta(source, host);
    expect(merged.author).toBe('Real');
    expect(merged.license?.spdx).toBe('CC-BY-4.0');
    expect(merged.license?.url).toBe('u');
  });

  it('falls through to the source for fields the host leaves unset', () => {
    const merged = mergeDocMeta({ author: 'A', description: 'D' }, { author: 'B' });
    expect(merged.author).toBe('B');
    expect(merged.description).toBe('D');
  });

  it('returns the source unchanged when no host metadata is supplied', () => {
    const source: DocMeta = { author: 'A' };
    expect(mergeDocMeta(source)).toEqual(source);
  });
});

describe('renderDocMetaHead', () => {
  it('emits rel=license and the machine-readable tags', () => {
    const { meta } = extractDocMeta(SOURCE);
    const head = renderDocMetaHead(meta);
    expect(head).toContain('<meta name="author" content="Dr. Yu Wang">');
    expect(head).toContain('<link rel="license" href="https://creativecommons.org/licenses/by/4.0/">');
    expect(head).toContain('<meta name="dcterms.license" content="CC-BY-4.0">');
    expect(head).toContain('<link rel="canonical" href="https://github.com/wangyu16/chem320-oer">');
  });

  it('asserts no copyright — a CC0 document must not carry a © claim', () => {
    const head = renderDocMetaHead({
      author: 'A',
      license: { spdx: 'CC0-1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
    });
    expect(head).not.toContain('©');
    expect(head).not.toContain('copyright');
  });

  it('escapes attribute values rather than injecting markup', () => {
    const head = renderDocMetaHead({ author: '"><script>x</script>' });
    expect(head).not.toContain('<script>x</script>');
    expect(head).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('emits nothing at all for empty metadata', () => {
    expect(renderDocMetaHead({})).toBe('');
    expect(renderDocMetaIsland({})).toBe('');
  });
});

describe('the JSON island', () => {
  it('round-trips through parseDocMetaIsland', () => {
    const { meta } = extractDocMeta(SOURCE);
    const html = `<head>${renderDocMetaIsland(meta)}</head>`;
    expect(parseDocMetaIsland(html)).toEqual(meta);
  });

  it('cannot break out of the script element', () => {
    const island = renderDocMetaIsland({ description: 'a</script><script>evil()' });
    expect(island).not.toContain('</script><script>evil()');
    expect(island).toContain('<\\/script>');
  });

  it('survives the save round-trip that every tool performs', () => {
    // Each tool's serializeDoc() clones documentElement and overwrites ONLY the
    // source island's text. This models that: everything else must come through
    // byte-for-byte. If a future tool moved metadata out of <head>, this fails.
    const { meta } = extractDocMeta(SOURCE);
    const built = [
      '<!DOCTYPE html>',
      '<html><head>',
      renderDocMetaHead(meta),
      renderDocMetaIsland(meta),
      '</head><body>',
      '<script type="text/markdown" id="orz-src">\n# Old\n</script>',
      '</body></html>',
    ].join('\n');

    const saved = built.replace(
      /(<script type="text\/markdown" id="orz-src">)[\s\S]*?(<\/script>)/,
      '$1\n# Edited by the reader\n$2',
    );

    expect(saved).toContain('# Edited by the reader');
    expect(saved).toContain('<link rel="license"');
    expect(saved).toContain(`id="${DOC_META_ISLAND_ID}"`);
    expect(parseDocMetaIsland(saved)).toEqual(meta);
  });
});
