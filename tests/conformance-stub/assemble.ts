/**
 * The stub carrier's `assemble` (test scaffolding, not a product): one
 * function shared by its Node entry and its browser bundle, so Node and
 * Chrome write the same bytes (FC-18 law 2). The envelope is the kit's
 * `assembleEnvelope`; the shell parts are a brand, an app root and the
 * engine — inlined (`delivery: "inline"`, the bundle's exact text) or loaded
 * from the hard-coded jsDelivr URL (`cdn`).
 *
 * `variant` exists for the harness's mutation tests (H.5 in
 * tests/conformance.test.ts): `crlf` normalises line endings before
 * assembling — the bug the round-trip law must catch; the other variants are
 * bugs of the bundle (carrier.ts).
 */
import { assembleEnvelope } from '../../src/carrier';
import { bundleUrl } from '../../src/carrier/shell/update';

export type StubVariant =
  | 'good' | 'script-close' | 'crlf' | 'accept-tampered' | 'live-dom' | 'steal-focus'
  // round 1 of closed loop 2: the kit mutants that survived the harness, re-made as carrier bugs
  | 'preview-same-origin' | 'ungated-keys' | 'no-roundtrip' | 'no-version-check' | 'any-source' | 'copy-overwrite'
  | 'offer-prerelease' | 'no-once-a-day' | 'shared-prefs' | 'cdn-to-inline' | 'update-in-frame';

export const STUB_BUNDLE_PATH = 'orz-stub.browser.js';

export interface StubAssembleOptions {
  version: string;
  variant: StubVariant;
  delivery?: 'inline' | 'cdn';
  /** The bundle's exact text (required for inline delivery). */
  engineSource?: string | null;
}

const HEAD = '<style>body{margin:0;font:16px/1.5 system-ui,sans-serif}.orz-stub-bar{display:flex;gap:8px;align-items:center;padding:6px 12px;border-bottom:1px solid #ddd}#orz-app{min-height:60vh}</style>';

export function stubAssemble(text: string, o: StubAssembleOptions): string {
  const delivery = o.delivery ?? 'inline';
  if (delivery !== 'inline' && delivery !== 'cdn') throw new Error(`orz stub: unknown delivery ${String(delivery)}`);
  const source = o.variant === 'crlf' ? text.replace(/\r\n?/g, '\n') : text;
  let engine: string;
  if (delivery === 'inline') {
    if (typeof o.engineSource !== 'string' || o.engineSource === '') throw new Error('orz stub: inline delivery needs the engine source');
    engine = `<script>${o.engineSource}</script>`;
  } else {
    engine = `<script src="${bundleUrl({ kind: 'md', version: o.version, bundle: { path: STUB_BUNDLE_PATH, integrity: '' } })}"></script>`;
  }
  return assembleEnvelope(source, {
    kind: 'md',
    shellVersion: o.version,
    delivery,
    headHtml: HEAD,
    bodyHtml: `<header class="orz-stub-bar"><span id="orz-brand" tabindex="-1">orz stub</span></header>\n<main id="orz-app"></main>\n${engine}`,
  });
}
