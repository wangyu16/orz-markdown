import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

describe('Phase 11 — SMILES plugin', () => {
  it('renders SMILES string in data attribute', () => {
    const html = md.render('{{smiles C1=CC=CC=C1}}');
    expect(html).toContain('data-smiles="C1=CC=CC=C1"');
    expect(html).toContain('smiles-render');
  });

  it('renders with alias {{sm}}', () => {
    const html = md.render('{{sm C1=CC=CC=C1}}');
    expect(html).toContain('data-smiles="C1=CC=CC=C1"');
  });

  it('HTML-escapes special characters in SMILES', () => {
    const html = md.render('{{smiles C[C@@H](N)C(=O)O}}');
    expect(html).toContain('data-smiles=');
    // The SMILES should be present (no < or > to escape here, but quotes are fine)
    expect(html).toContain('C[C@@H](N)C(=O)O');
  });

  it('escapes double-quote in SMILES data attribute', () => {
    const html = md.render('{{smiles has"quote}}');
    expect(html).not.toContain('data-smiles="has"quote"');
    expect(html).toContain('&quot;');
  });
});
