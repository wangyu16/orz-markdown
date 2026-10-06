/**
 * Page-side code of the harness, as plain ES2017 source strings (they run in
 * Chrome, never in Node, and must not depend on how this file is compiled).
 */

/** The binding every frame reports through (`context.exposeBinding`). */
export const RECORD_BINDING = '__orzConformanceRecord';

export type PickerMode = 'stub' | 'none' | 'native' | 'opfs';

/**
 * The origin-private folder the `opfs` picker uses for a page path (one folder
 * per page, so two same-named files in two folders stay two files). ES5 source.
 */
export const OPFS_FOLDER = `function (pathname) {
  var h = 5381;
  for (var i = 0; i < pathname.length; i++) h = ((h * 33) ^ pathname.charCodeAt(i)) >>> 0;
  return 'orz-conformance-' + h.toString(36);
}`;

/**
 * Init script for every frame of a check's context: dialogs are recorded
 * (and never block), uncaught errors are recorded, and the File System Access
 * picker is a recording stub (`stub`), absent (`none`), the browser's
 * (`native`), or (`opfs`) a recording function that returns a REAL
 * `FileSystemFileHandle` from the origin-private file system, in a folder of
 * the page's path — so IndexedDB, the handle's structured clone, permission
 * checks and the writes are real (the native picker cannot be automated).
 */
export function initScript(picker: PickerMode): string {
  return `(() => {
  var picker = ${JSON.stringify(picker)};
  var rec = function (type, data) { try { window[${JSON.stringify(RECORD_BINDING)}]({ type: type, data: data, url: String(location.href) }); } catch (e) {} };
  ['alert', 'confirm', 'prompt'].forEach(function (n) {
    try { Object.defineProperty(window, n, { configurable: true, writable: true, value: function (m) { rec('dialog', { kind: n, message: String(m) }); return n === 'confirm' ? false : null; } }); } catch (e) {}
  });
  try {
    if (typeof HTMLDialogElement !== 'undefined') {
      var showModal = HTMLDialogElement.prototype.showModal;
      HTMLDialogElement.prototype.showModal = function () { rec('dialog', { kind: 'showModal' }); return showModal.apply(this, arguments); };
    }
  } catch (e) {}
  window.addEventListener('error', function (e) { rec('pageerror', String(e && e.message)); });
  window.addEventListener('unhandledrejection', function (e) { rec('pageerror', 'unhandled rejection: ' + String(e && e.reason && (e.reason.message || e.reason))); });
  if (picker === 'none') {
    try { Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, writable: true, value: undefined }); } catch (e) {}
  } else if (picker === 'stub') {
    var pick = function (opts) {
      var name = (opts && opts.suggestedName) || 'picked.html';
      rec('picker', { suggestedName: opts && opts.suggestedName, types: opts && opts.types ? JSON.parse(JSON.stringify(opts.types)) : null });
      var handle = {
        kind: 'file', name: name,
        queryPermission: function () { return Promise.resolve('granted'); },
        requestPermission: function () { return Promise.resolve('granted'); },
        createWritable: function () {
          var parts = [];
          return Promise.resolve({
            write: function (d) { return (typeof d === 'string' ? Promise.resolve(d) : new Blob([d]).text()).then(function (s) { parts.push(s); }); },
            close: function () { rec('write', { name: name, data: parts.join('') }); return Promise.resolve(); },
            abort: function () { return Promise.resolve(); },
          });
        },
      };
      return Promise.resolve(handle);
    };
    try { Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, writable: true, value: pick }); } catch (e) {}
  } else if (picker === 'opfs') {
    var folder = ${OPFS_FOLDER};
    var pickReal = function (opts) {
      var name = (opts && opts.suggestedName) || 'picked.html';
      rec('picker', { suggestedName: opts && opts.suggestedName, page: String(location.pathname) });
      return navigator.storage.getDirectory()
        .then(function (root) { return root.getDirectoryHandle(folder(String(location.pathname)), { create: true }); })
        .then(function (dir) { return dir.getFileHandle(name, { create: true }); });
    };
    try { Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, writable: true, value: pickReal }); } catch (e) {}
  }
})();`;
}

/** Page-side: the text of the file the `opfs` picker made for a page path and name (null when there is none). */
export const READ_OPFS = `async function (a) {
  var folder = ${OPFS_FOLDER};
  try {
    var root = await navigator.storage.getDirectory();
    var dir = await root.getDirectoryHandle(folder(a.pathname));
    return await (await (await dir.getFileHandle(a.name)).getFile()).text();
  } catch (e) { return null; }
}`;

/** Page-side helpers installed by the harness in a page it drives (deep queries, the island text, the editor). */
export const PAGE_HELPERS = `(() => {
  if (window.__orzC) return;
  var deepAll = function (root, sel, out) {
    out = out || [];
    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) deepAll(n.shadowRoot, sel, out); });
    return out;
  };
  window.__orzC = {
    deepAll: deepAll,
    fileText: function () {
      var C = globalThis.OrzCarrier;
      if (!C || typeof C.extract !== 'function') throw new Error('no globalThis.OrzCarrier.extract in the opened file');
      var x = C.extract('<!doctype html>\\n' + document.documentElement.outerHTML);
      if (!x) throw new Error('OrzCarrier.extract found no #orz-src island in the opened file');
      return x.text;
    },
    islandRaw: function () { var el = document.getElementById('orz-src'); return el ? [el.textContent, el.getAttribute('data-orz-eol'), el.hasAttribute('data-orz-bom'), el.getAttribute('data-orz-format')] : null; },
    marker: function (m) { var p = document.createElement('p'); p.setAttribute('data-orz-conformance', m); p.textContent = m; document.body.appendChild(p); document.title = document.title + ' ' + m; },
    modal: function () {
      return deepAll(document, '[aria-modal="true"], dialog').filter(function (n) { return n.getAttribute('aria-modal') === 'true' || (n.matches && n.matches(':modal')); }).length
        + deepAll(document, '[inert]').length;
    },
  };
})();`;

/** Default editor driver: mount `OrzCarrier.mountEditor` on a new element. */
export const DEFAULT_EDITOR_DRIVER = `function (text) {
  var el = document.createElement('div');
  el.setAttribute('data-orz-conformance', 'editor');
  el.style.cssText = 'width: 1100px; height: 640px;';
  document.body.appendChild(el);
  return globalThis.OrzCarrier.mountEditor(el, { text: text });
}`;

/** Script that mounts the driver's editor as window.__orzEditor (the text: the file's own). */
export function mountEditorScript(driver: string): string {
  return `(async () => {
  ${PAGE_HELPERS}
  var text = window.__orzC.fileText();
  var editor = await (${driver})(text);
  if (!editor || typeof editor.getText !== 'function') throw new Error('the editor driver returned no FC-19 Editor');
  window.__orzEditor = editor;
  if (editor.ready && typeof editor.ready.then === 'function') { try { await editor.ready; } catch (e) {} }
  return text;
})()`;
}

/**
 * The host page: the protocol host side written from spec/host-protocols.md
 * (independent of the kit's embedCarrierFrame, so a shared bug cannot hide).
 */
export const HOST_PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>orz conformance host</title></head><body>
<script>
window.__host = {
  start: function (src, origin, cfg) {
    var state = { readies: {}, msgs: [], acked: 0 };
    var f = document.createElement('iframe');
    f.style.cssText = 'width: 1200px; height: 800px; border: 0;';
    f.src = src;
    window.addEventListener('message', function (e) {
      if (e.source !== f.contentWindow || e.origin !== origin) return;
      var d = e.data;
      if (!d || typeof d.type !== 'string') return;
      var copy = {}; for (var k in d) copy[k] = d[k];
      state.msgs.push(copy);
      if (d.type === 'orz-host-ready') state.readies.save = copy;
      if (d.type === 'orz-host-ai-ready') state.readies.ai = copy;
      if (d.type === 'orz-host-include-ready') state.readies.include = copy;
      if (d.type === 'orz-host-save' && cfg.ack) { state.acked++; f.contentWindow.postMessage({ type: 'orz-host-saved', ok: true }, origin); }
    });
    var hellos = [];
    if (cfg.save) hellos.push(['save', { type: 'orz-host-hello', protocol: 'orz-host-save', version: 1 }]);
    if (cfg.ai) hellos.push(['ai', { type: 'orz-host-ai-hello', protocol: 'orz-host-ai', version: 1, operations: [{ id: 'conformance-op', title: 'Conformance op', selection: false }] }]);
    if (cfg.include) hellos.push(['include', { type: 'orz-host-include-hello', protocol: 'orz-host-include', version: 1 }]);
    var send = function () { hellos.forEach(function (h) { if (!state.readies[h[0]] && f.contentWindow) f.contentWindow.postMessage(h[1], origin); }); };
    f.addEventListener('load', send);
    var started = Date.now();
    var timer = setInterval(function () { send(); if (Date.now() - started > 20000) clearInterval(timer); }, 400);
    document.body.appendChild(f);
    send();
    window.__hostState = state;
    return true;
  },
};
</script></body></html>`;

/** A blank page of the harness origin (loads the bundle under test by URL). */
export function bundlePage(bundleUrl: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>orz conformance</title></head><body><script src="${bundleUrl}"></script></body></html>`;
}
