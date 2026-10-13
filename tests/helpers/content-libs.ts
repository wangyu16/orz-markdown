/**
 * The real content libraries (Chart.js, Mermaid, SmilesDrawer) at their
 * pinned URLs, for tests that must see them draw (2.4.0: themed charts and
 * diagrams, visible-only drawing, SMILES sizing). Fetched once into
 * node_modules/.cache/orz-content-libs/ and served from there through
 * Playwright routes; null when they cannot be fetched (offline), and the
 * tests that need them then skip.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PREVIEW_CDN } from '../../src/preview-frame';

const DIR = join('node_modules', '.cache', 'orz-content-libs');
export const REAL_LIBS = [PREVIEW_CDN.chartJs, PREVIEW_CDN.mermaidJs, PREVIEW_CDN.smilesJs] as const;

export async function contentLibs(): Promise<Record<string, string> | null> {
  mkdirSync(DIR, { recursive: true });
  const out: Record<string, string> = {};
  for (const url of REAL_LIBS) {
    const file = join(DIR, url.replace(/[^a-z0-9.]+/gi, '_'));
    if (!existsSync(file)) {
      try {
        const r = await fetch(url);
        if (!r.ok) return null;
        writeFileSync(file, await r.text(), 'utf8');
      } catch { return null; }
    }
    out[url] = readFileSync(file, 'utf8');
  }
  return out;
}
