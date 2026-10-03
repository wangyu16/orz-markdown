import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { skillTemplate } from '../scripts/build-skill-template';
import { getBrowserRuntimeScript } from '../src/runtime';

describe('skill assets/template.html', () => {
  it('is regenerated from the current preview-frame assets (run `npm run build`)', () => {
    expect(readFileSync('orz-markdown-skills/assets/template.html', 'utf8')).toBe(skillTemplate());
  });

  it('embeds the current runtime', () => {
    expect(skillTemplate()).toContain(getBrowserRuntimeScript().replace(/<\/(script)/gi, '<\\/$1'));
  });
});
