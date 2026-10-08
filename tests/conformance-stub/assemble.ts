/**
 * The stub carrier's `assemble` (test scaffolding, not a product): one
 * function shared by its Node entry and its browser bundle, so Node and
 * Chrome write the same bytes (FC-18 law 2). The envelope is the kit's
 * `assembleEnvelope`; the shell parts are the read view's article, the
 * chrome's mount point (`orz-markdown/carrier/app` fills both) and the
 * engine — inlined (`delivery: "inline"`, the bundle's exact text) or loaded
 * from the hard-coded jsDelivr URL (`cdn`).
 *
 * `variant` exists for the harness's mutation tests (H.5 in
 * tests/conformance.test.ts): `crlf` normalises line endings before
 * assembling — the bug the round-trip law must catch; `date-stamp`,
 * `no-generator`, `no-eol-attr` and `meta-from-body` are assembly bugs
 * too; the other variants are bugs of the bundle (carrier.ts).
 */
import { assembleEnvelope } from '../../src/carrier';
import { bundleUrl } from '../../src/carrier/shell/update';

export type StubVariant =
  | 'good' | 'script-close' | 'crlf' | 'accept-tampered' | 'live-dom' | 'steal-focus'
  // round 1 of closed loop 2: the kit mutants that survived the harness, re-made as carrier bugs
  | 'preview-same-origin' | 'ungated-keys' | 'no-roundtrip' | 'no-version-check' | 'any-source' | 'copy-overwrite'
  | 'offer-prerelease' | 'no-once-a-day' | 'shared-prefs' | 'cdn-to-inline' | 'update-in-frame'
  // design audit round 2: new mutants
  | 'hook-save-lf' | 'ignore-hook-save' | 'crlf-after-edit' | 'extract-strip-bom' | 'standalone-same-origin' | 'formats-wrong'
  | 'browser-shell-lie' | 'frame-silent-update' | 'no-dirty-post' | 'css-leak' | 'shared-undo' | 'indicator-in-app'
  | 'prefs-in-file' | 'setheader-two-steps' | 'date-stamp' | 'browser-no-refusal' | 'global-mode-key' | 'update-download'
  | 'update-stale-text' | 'download-fixed-name' | 'readonly-ignored' | 'silent-refusal'
  // closed loop 2 round 2 (harness sub-probe): more subtly non-conformant carriers
  | 'meta-from-body' | 'no-eol-attr' | 'no-generator' | 'update-any-format' | 'note-when-hosted' | 'prefs-in-text' | 'name-handle'
  // closed loop 2 round 3: carriers that passed the harness (the claims adversary's r3-* and the save/update gaps)
  | 'r3-reload-picked' | 'r3-readonly-stuck' | 'r3-hook-markSaved' | 'r3-readonly-save-key' | 'r3-ungated-view-key'
  // option B (2026-10-06): the preview's port without the frame secret
  | 'port-without-secret'
  | 'save-to-inline' | 'save-drops-includes' | 'update-drops-includes'
  // 2.2.0: a file that fetches a bundle before the reader asks for the update
  | 'prefetch-bundle'
  // round 2 of the carrier-app loop: a save that writes over a file changed on disk without asking
  | 'save-ignores-conflict';

export const STUB_BUNDLE_PATH = 'orz-stub.browser.js';

export interface StubAssembleOptions {
  version: string;
  variant: StubVariant;
  delivery?: 'inline' | 'cdn';
  /** The bundle's exact text (required for inline delivery). */
  engineSource?: string | null;
  /** Resolved includes, stored in `#orz-includes` as given (FC-18 §8.3, D4). */
  includes?: Record<string, string>;
}

const HEAD = '<style>body{margin:0;font:16px/1.5 system-ui,sans-serif}#orz-app{min-height:60vh;padding:24px}</style>';

/** The shell markup of the body: the read view's article (carrier/app renders into it) and the chrome's mount point. */
export const STUB_BODY = '<main id="orz-app" class="orz-view"><article id="orz-doc" class="markdown-body"></article></main>\n<div id="orz-chrome"></div>';

export function stubAssemble(text: string, o: StubAssembleOptions): string {
  const delivery = o.delivery ?? 'inline';
  if (delivery !== 'inline' && delivery !== 'cdn') throw new Error(`orz stub: unknown delivery ${String(delivery)}`);
  const source = o.variant === 'crlf' ? text.replace(/\r\n?/g, '\n') : text;
  let engine: string;
  if (delivery === 'inline') {
    if (typeof o.engineSource !== 'string' || o.engineSource === '') throw new Error('orz stub: inline delivery needs the engine source');
    engine = `<script id="orz-engine">${o.engineSource}</script>`;
  } else {
    engine = `<script id="orz-engine" src="${bundleUrl({ kind: 'md', version: o.version, bundle: { path: STUB_BUNDLE_PATH, integrity: '' } })}"></script>`;
  }
  const html = assembleEnvelope(source, {
    kind: 'md',
    shellVersion: o.version,
    delivery,
    ...(o.includes && Object.keys(o.includes).length > 0 ? { includes: o.includes } : {}),
    headHtml: HEAD,
    bodyHtml: (o.variant === 'date-stamp' ? `<!-- assembled ${new Date().toISOString().slice(0, 10)} -->\n` : '') + `${STUB_BODY}\n${engine}`, // BUG (mutation) date-stamp
  });
  if (o.variant === 'no-generator') return html.replace(/<meta name="generator" content="[^"]*">\n/, ''); // BUG (mutation): no generator meta
  if (o.variant === 'no-eol-attr') return html.replace(/(<script type="text\/markdown" id="orz-src"[^>]*?) data-orz-eol="[a-z]+"/, '$1'); // BUG (mutation): the island does not say its line endings
  if (o.variant === 'meta-from-body') {
    // BUG (mutation): the title in <title> and #orz-meta comes from the body's first heading, not the header
    const heading = /^# +(.+?)\s*$/m.exec(source.replace(/^[\s\S]*?\n\}\}/, ''))?.[1];
    if (heading) return html.replace(/<title>[^<]*<\/title>/, () => `<title>${heading.replace(/[<&]/g, '')}</title>`).replace(/("title": )"(?:[^"\\]|\\.)*"/, (_m, k: string) => `${k}${JSON.stringify(heading)}`);
  }
  return html;
}
