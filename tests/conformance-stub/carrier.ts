/**
 * The stub carrier's browser bundle (test scaffolding for the conformance
 * harness, spec/conformance.md; not a product). Kind `md`, built from the kit
 * alone — and, since 2.2.0, a small one: the standalone runtime is
 * `orz-markdown/carrier/app` (`startCarrier`), and this file is only the kind
 * behind its seam (spec/carrier-app.md §3): the assemble (assemble.ts), the
 * creation tool, `mountEditor` (the kit's editor shell with
 * `renderMarkdownPreviewWithIncludes`, the theme setting and the preview
 * following it), the read view (the document rendered in the page from the
 * file's includes) and one header setting, the theme.
 *
 * Built by build.ts with esbuild; `__STUB_VERSION__` and `__STUB_VARIANT__`
 * are compile-time constants. Variants other than `good` are deliberate bugs
 * for the harness's mutation tests (mutants.ts).
 */
import { readDocument, readHeader } from '../../src/carrier';
import { createEditorShell, renderMarkdownPreview, renderMarkdownPreviewWithIncludes, type EditorShell, type EditorShellOptions } from '../../src/carrier/editor';
import {
  attachAiMenu, attachSettings, captureEngineSource, followPresentation, startCarrier,
  type AppAssembleOptions, type AppDocument, type AppElement, type CarrierReadView, type KindEditorOptions, type SettingControl, type StandaloneContext, type StandaloneKind,
} from '../../src/carrier/app';
import { THEMES, themeInfo, type ThemeInfo } from '../../src/themes';
import { VERSION as ORZ_MARKDOWN_VERSION } from '../../src/version';
import { stubAssemble, type StubVariant } from './assemble';
import { createStubText } from './document';
import { stubBugs } from './mutants';

declare const __STUB_VERSION__: string;
declare const __STUB_VARIANT__: StubVariant;

const VERSION = __STUB_VERSION__;
const VARIANT = __STUB_VARIANT__;
const bugs = stubBugs(VARIANT, VERSION);

/** This bundle's own text when it runs inline (an assembled file, the update sandbox). */
const engine = captureEngineSource();

function assemble(text: string, o: AppAssembleOptions = {}): Promise<string> {
  try {
    return Promise.resolve(stubAssemble(text, { version: bugs.shellVersion(VERSION), variant: VARIANT, delivery: o.delivery ?? 'inline', engineSource: o.engineSource ?? engine.inline, ...(o.includes ? { includes: o.includes } : {}) }));
  } catch (e) {
    return bugs.refused(text, e, VERSION);
  }
}

// ── presentation: the header's theme ─────────────────────────────────────

const themeOf = (text: string): ThemeInfo => themeInfo(readHeader(text)?.fields['theme']?.trim());
const themeHref = (id: string): string => `https://cdn.jsdelivr.net/npm/orz-markdown@${ORZ_MARKDOWN_VERSION}/themes/${id}.css`;
const themeLink = (text: string): string => `<link rel="stylesheet" href="${themeHref(themeOf(text).id)}">`;

const SETTINGS: readonly SettingControl[] = [{
  key: 'theme',
  label: 'Theme',
  icon: 'theme',
  choices: THEMES.map((t) => ({ value: t.id, label: t.name })),
  current: (text) => themeOf(text).id,
}];

// ── the read view: the document in the page ──────────────────────────────

function createReadView(doc: AppDocument): CarrierReadView {
  let main = doc.getElementById('orz-app');
  if (!main) { main = doc.createElement('main'); main.id = 'orz-app'; doc.body.prepend(main); }
  let article = doc.getElementById('orz-doc');
  if (!article) { article = doc.createElement('article'); article.id = 'orz-doc'; article.className = 'markdown-body'; main.append(article); }
  const view = main;
  const body = article as AppElement & { innerHTML: string };
  let generation = 0;
  const present = (text: string): { scheme: 'light' | 'dark' } => {
    const t = themeOf(text);
    let link = doc.getElementById('orz-theme');
    if (!link) { link = doc.createElement('link'); link.id = 'orz-theme'; link.setAttribute('rel', 'stylesheet'); doc.head.append(link); }
    if (link.getAttribute('href') !== themeHref(t.id)) link.setAttribute('href', themeHref(t.id));
    view.setAttribute('data-orz-theme', t.id);
    return { scheme: t.scheme };
  };
  return {
    element: view,
    present,
    async render(text, ctx) {
      const mine = ++generation;
      present(text);
      const html = await renderMarkdownPreviewWithIncludes(text, { ...(ctx.includes ? { includes: ctx.includes } : {}), ...(ctx.fetchInclude ? { fetchInclude: ctx.fetchInclude } : {}) });
      if (mine === generation) body.innerHTML = html;
    },
  };
}

// ── the editor ───────────────────────────────────────────────────────────

let current: EditorShell | null = null;

function mountEditor(element: AppElement, options: KindEditorOptions, ctx?: StandaloneContext): EditorShell {
  const appHost = bugs.appHost(!!options.hooks?.save);
  const { save: _hookSave, ...otherHooks } = options.hooks ?? {};
  void _hookSave;
  const uid = readDocument(options.text, { kind: 'md' }).meta.uid;
  bugs.beforeMount({ appHost, current: () => current });
  const input: EditorShellOptions = bugs.editorInputs({
    text: options.text,
    render: renderMarkdownPreviewWithIncludes,
    kind: 'md',
    formats: [1],
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.readOnly ? { readOnly: true } : {}),
    ...(options.chrome ? { chrome: options.chrome } : {}),
    ...(options.nonce ? { nonce: options.nonce } : {}),
    ...(options.preferences ?? ctx?.preferences ? { preferences: options.preferences ?? ctx!.preferences! } : {}),
    ...(ctx?.adapter ? { adapter: ctx.adapter } : {}),
    // FC-19 §3 includes (an app's resolved includes); a file's own record (ctx) wins below
    ...(options.includes ? { includes: options.includes } : {}),
    hooks: appHost ? options.hooks! : { ...otherHooks, ...(ctx?.ai ? { ai: ctx.ai } : {}), ...(ctx?.fetchInclude ? { fetchInclude: ctx.fetchInclude } : {}) },
    ...(appHost ? {} : ctx ? {
      // the standalone file's context: its saver, host, delivery, includes and opened bytes (FC-19 §4)
      assemble: ctx.assemble,
      fileName: ctx.fileName,
      saver: ctx.saver,
      ...(ctx.host ? { host: ctx.host } : {}),
      ...(ctx.includes ? { includes: ctx.includes } : {}),
      ...(ctx.openedHtml ? { openedHtml: ctx.openedHtml } : {}),
      standalone: ctx.standalone,
    } : {
      // an app page without hooks.save: a file of the text, through the picker or a download — inline when
      // the page holds the engine, else cdn (the stub does not fetch its own bundle, as a carrier would)
      assemble: (t: string, o?: { includes?: Record<string, string> }) => assemble(t, { ...(engine.inline ? {} : { delivery: 'cdn' as const }), ...(o?.includes ? { includes: o.includes } : {}) }),
      ...(options.fileName ? { fileName: options.fileName } : {}),
    }),
    preview: { assets: false, head: themeLink(options.text), scheme: themeOf(options.text).scheme },
  }, { appHost, options, ...(ctx ? { ctx } : {}), ...(uid ? { uid } : {}) });
  const shell = createEditorShell(element as never, input);
  current = shell;
  const settings = attachSettings(shell, SETTINGS);
  // an app's own AI hook gets the AI menu here; the standalone file's host AI gets it from carrier/app
  const ai = !ctx && options.hooks?.ai ? attachAiMenu(shell, { operations: () => options.hooks?.ai?.operations ?? [] }) : null;
  const unfollow = followPresentation(shell, (t) => ({ head: themeLink(t), scheme: themeOf(t).scheme }));
  const destroy = shell.destroy.bind(shell);
  shell.destroy = () => { unfollow(); settings.destroy(); ai?.destroy(); destroy(); };
  return bugs.editor(shell, { appHost, element: element as unknown as HTMLElement, options, current: () => current });
}

// ── the kind behind carrier/app's seam ───────────────────────────────────

const STUB_KIND: StandaloneKind = {
  kind: 'md',
  version: VERSION,
  formats: bugs.formats,
  brand: 'orz stub',
  assemble,
  newDocument: () => createStubText(),
  mountEditor,
  createReadView,
  settings: SETTINGS,
  extract: (html) => bugs.extract(html),
  readDocument: (text) => readDocument(text, { kind: 'md' }),
  renderPreview: (text) => Promise.resolve(renderMarkdownPreview(text)),
};

const { app } = startCarrier(STUB_KIND, { services: bugs.services });
bugs.booted(app, VERSION);
