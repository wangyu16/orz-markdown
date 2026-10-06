/**
 * The conformance checks: stable ids (a carrier's claims bind to them), what
 * each one proves and where it runs. spec/conformance.md is the prose form of
 * this table.
 */

export interface CheckInfo {
  id: string;
  title: string;
  /** Runs in real Chrome (skipped, with a reason, when no browser can be launched). */
  chrome: boolean;
  /** The spec text it enforces. */
  spec: string;
}

export const CHECKS: readonly CheckInfo[] = [
  // FC-18 laws
  { id: 'C.law.round-trip', chrome: false, spec: 'FC-18 §2 law 1', title: 'extract(assemble(T)).text === T for every corpus, hazard and sample text, inline and cdn, with kind, format, shell and delivery recorded' },
  { id: 'C.law.determinism', chrome: true, spec: 'FC-18 §2 law 2', title: 'assemble gives the same bytes twice in Node, and the browser bundle gives the Node bytes in Chrome' },
  { id: 'C.law.idempotence', chrome: false, spec: 'FC-18 §2 law 3', title: 'assemble(extract(F).text) === F' },
  { id: 'C.law.eol-bom', chrome: true, spec: 'FC-18 §2, §8.1', title: 'CR LF, CR and a BOM are recorded on the island and come back exactly — from the file, from its DOM in Chrome and from a mounted editor' },
  { id: 'C.law.content-independence', chrome: true, spec: 'FC-18 §2 law 4, FD-03', title: 'the text-derived parts of the file (lang, title, head metadata, #orz-meta, island) are the kit envelope\'s, and equal across shells (previous / next) — as is renderPreview' },
  { id: 'C.law.refusals', chrome: false, spec: 'FC-18 §2, §8.4', title: 'assemble refuses a text holding NUL or a lone surrogate, and a header format above 1' },
  // bundle rule
  { id: 'C.bundle.script-safe', chrome: false, spec: 'spec/shell-runtime.md §6', title: 'the bundle is script-safe (no <script or </script, any case, after any backslashes), strict UTF-8, with no CR or NUL, so it inlines byte for byte' },
  { id: 'C.bundle.global', chrome: true, spec: 'FC-19 §2', title: 'loading the bundle sets globalThis.OrzCarrier { kind, version, formats, assemble, extract, readDocument, mountEditor, renderPreview? } — and assemble works in an opaque-origin sandbox from the bundle alone' },
  { id: 'C.bundle.release', chrome: false, spec: 'spec/shell-runtime.md §6', title: 'release.json is a valid manifest of the kind and version, and its integrity is the SHA-384 of the bundle bytes' },
  // create
  { id: 'C.create.header', chrome: false, spec: 'FC-18 §3, §5, §10', title: 'a new document has a kind: document header (lint-clean) naming the carrier, with a freshly minted uid doc-[0-9a-z]{16}' },
  { id: 'C.create.newest-shell', chrome: false, spec: 'FC-18 §8.1', title: 'a new document assembles with the newest shell: the generator meta and #orz-shell name this kind, format 1, this version, inline delivery' },
  { id: 'C.create.island', chrome: false, spec: 'FC-18 §8.1', title: 'one #orz-src island with data-orz-format, data-orz-eol and data-orz-bom as the text demands' },
  { id: 'C.create.meta', chrome: false, spec: 'FC-18 §8.1', title: '#orz-meta and the head metadata are derived from the header only: the kit\'s, unchanged by body edits' },
  // edit
  { id: 'C.edit.exact', chrome: true, spec: 'FC-19 §4, §5.5, §8.3', title: 'an opened file mounts the editor with the exact text; typing keeps the BOM and line-ending style; dirty tracks the saved text; undo returns the exact original' },
  { id: 'C.edit.set-header', chrome: true, spec: 'FC-18 §9, FC-19 §8.7', title: 'setHeader applies the kit\'s editHeader as one undoable edit' },
  // save
  { id: 'C.save.served-notice', chrome: true, spec: 'spec/shell-runtime.md §1 step 2', title: 'a served page shows the #orz-served-note notice: no picker, no download, still dirty' },
  { id: 'C.save.file-system-access', chrome: true, spec: 'spec/shell-runtime.md §0, §1 step 3', title: 'a file: page saves through File System Access exactly the assembled text (not the live DOM); a second save reuses the handle' },
  { id: 'C.save.download', chrome: true, spec: 'spec/shell-runtime.md §0, §1 step 4', title: 'without File System Access the save downloads exactly the assembled text (not the live DOM) under the kind\'s file name' },
  // update
  { id: 'C.update.indicator', chrome: true, spec: 'spec/shell-runtime.md §7.3', title: 'a file of an older shell shows the quiet indicator: no dialog, no modal, no focus taken, no content change' },
  { id: 'C.update.reassemble', chrome: true, spec: 'spec/shell-runtime.md §7.2', title: 'Update now writes the newer release\'s re-assembly of the exact text (extract gives back the text, shell = the new version)' },
  { id: 'C.update.tampered', chrome: true, spec: 'spec/shell-runtime.md §7.2 step 1', title: 'a bundle whose bytes do not match the manifest integrity is refused: nothing written or downloaded, the page unchanged' },
  { id: 'C.update.offline', chrome: true, spec: 'spec/shell-runtime.md §7.1', title: 'offline, the update check is silent: no indicator, no dialog, no error' },
  { id: 'C.update.from-previous', chrome: true, spec: 'FC-19 §6', title: 'a file of the previous release updates to this one: the written file is exactly this release\'s assemble of the text' },
  // host protocols
  { id: 'C.host.save', chrome: true, spec: 'spec/host-protocols.md §3, §7', title: 'orz-host-save@1 across origins: ready with the kind; saves go to the host first (no picker) with source = the exact text and html = its assembled file; dirty is reported' },
  { id: 'C.host.ai', chrome: true, spec: 'spec/host-protocols.md §4', title: 'orz-host-ai@1: the file answers the hello (version 1) when it offers AI, and never answers when it declines' },
  { id: 'C.host.include', chrome: true, spec: 'spec/host-protocols.md §5', title: 'orz-host-include@1: the file answers the hello with its kind when it offers includes, and never answers when it declines' },
  { id: 'C.host.silent', chrome: true, spec: 'spec/host-protocols.md §1, §6', title: 'embedded in a page that never says hello, the file posts nothing to it and saves as a standalone file' },
  { id: 'C.host.no-ack', chrome: true, spec: 'spec/host-protocols.md §3 step 4', title: 'a host that never acknowledges a save: the save fails after the timeout and the document stays dirty, with nothing downloaded' },
  // reader preferences
  { id: 'C.prefs.local', chrome: true, spec: 'FC-18 §6, spec/shell-runtime.md §2', title: 'reader preferences are stored per browser under the document uid, never in the text: the text and its file are unchanged' },
];

export const CHECK_IDS: readonly string[] = CHECKS.map((c) => c.id);

export function checkInfo(id: string): CheckInfo {
  const c = CHECKS.find((x) => x.id === id);
  if (!c) throw new Error(`orz conformance: unknown check ${id}`);
  return c;
}
