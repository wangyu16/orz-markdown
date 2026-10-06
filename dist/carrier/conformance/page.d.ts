/**
 * Page-side code of the harness, as plain ES2017 source strings (they run in
 * Chrome, never in Node, and must not depend on how this file is compiled).
 */
/** The binding every frame reports through (`context.exposeBinding`). */
export declare const RECORD_BINDING = "__orzConformanceRecord";
export type PickerMode = 'stub' | 'none' | 'native' | 'opfs';
/**
 * The origin-private folder the `opfs` picker uses for a page path (one folder
 * per page, so two same-named files in two folders stay two files). ES5 source.
 */
export declare const OPFS_FOLDER = "function (pathname) {\n  var h = 5381;\n  for (var i = 0; i < pathname.length; i++) h = ((h * 33) ^ pathname.charCodeAt(i)) >>> 0;\n  return 'orz-conformance-' + h.toString(36);\n}";
/**
 * Init script for every frame of a check's context: dialogs are recorded
 * (and never block), uncaught errors are recorded, and the File System Access
 * picker is a recording stub (`stub`), absent (`none`), the browser's
 * (`native`), or (`opfs`) a recording function that returns a REAL
 * `FileSystemFileHandle` from the origin-private file system, in a folder of
 * the page's path — so IndexedDB, the handle's structured clone, permission
 * checks and the writes are real (the native picker cannot be automated).
 */
export declare function initScript(picker: PickerMode): string;
/** Page-side: the text of the file the `opfs` picker made for a page path and name (null when there is none). */
export declare const READ_OPFS = "async function (a) {\n  var folder = function (pathname) {\n  var h = 5381;\n  for (var i = 0; i < pathname.length; i++) h = ((h * 33) ^ pathname.charCodeAt(i)) >>> 0;\n  return 'orz-conformance-' + h.toString(36);\n};\n  try {\n    var root = await navigator.storage.getDirectory();\n    var dir = await root.getDirectoryHandle(folder(a.pathname));\n    return await (await (await dir.getFileHandle(a.name)).getFile()).text();\n  } catch (e) { return null; }\n}";
/** Page-side helpers installed by the harness in a page it drives (deep queries, the island text, the editor). */
export declare const PAGE_HELPERS = "(() => {\n  if (window.__orzC) return;\n  var deepAll = function (root, sel, out) {\n    out = out || [];\n    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });\n    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) deepAll(n.shadowRoot, sel, out); });\n    return out;\n  };\n  window.__orzC = {\n    deepAll: deepAll,\n    fileText: function () {\n      var C = globalThis.OrzCarrier;\n      if (!C || typeof C.extract !== 'function') throw new Error('no globalThis.OrzCarrier.extract in the opened file');\n      var x = C.extract('<!doctype html>\\n' + document.documentElement.outerHTML);\n      if (!x) throw new Error('OrzCarrier.extract found no #orz-src island in the opened file');\n      return x.text;\n    },\n    islandRaw: function () { var el = document.getElementById('orz-src'); return el ? [el.textContent, el.getAttribute('data-orz-eol'), el.hasAttribute('data-orz-bom'), el.getAttribute('data-orz-format')] : null; },\n    marker: function (m) { var p = document.createElement('p'); p.setAttribute('data-orz-conformance', m); p.textContent = m; document.body.appendChild(p); document.title = document.title + ' ' + m; },\n    modal: function () {\n      return deepAll(document, '[aria-modal=\"true\"], dialog').filter(function (n) { return n.getAttribute('aria-modal') === 'true' || (n.matches && n.matches(':modal')); }).length\n        + deepAll(document, '[inert]').length;\n    },\n  };\n})();";
/** Default editor driver: mount `OrzCarrier.mountEditor` on a new element. */
export declare const DEFAULT_EDITOR_DRIVER = "function (text) {\n  var el = document.createElement('div');\n  el.setAttribute('data-orz-conformance', 'editor');\n  el.style.cssText = 'width: 1100px; height: 640px;';\n  document.body.appendChild(el);\n  return globalThis.OrzCarrier.mountEditor(el, { text: text });\n}";
/** Script that mounts the driver's editor as window.__orzEditor (the text: the file's own). */
export declare function mountEditorScript(driver: string): string;
/**
 * The host page: the protocol host side written from spec/host-protocols.md
 * (independent of the kit's embedCarrierFrame, so a shared bug cannot hide).
 */
export declare const HOST_PAGE = "<!doctype html><html><head><meta charset=\"utf-8\"><title>orz conformance host</title></head><body>\n<script>\nwindow.__host = {\n  start: function (src, origin, cfg) {\n    var state = { readies: {}, msgs: [], acked: 0 };\n    var f = document.createElement('iframe');\n    f.style.cssText = 'width: 1200px; height: 800px; border: 0;';\n    f.src = src;\n    window.addEventListener('message', function (e) {\n      if (e.source !== f.contentWindow || e.origin !== origin) return;\n      var d = e.data;\n      if (!d || typeof d.type !== 'string') return;\n      var copy = {}; for (var k in d) copy[k] = d[k];\n      state.msgs.push(copy);\n      if (d.type === 'orz-host-ready') state.readies.save = copy;\n      if (d.type === 'orz-host-ai-ready') state.readies.ai = copy;\n      if (d.type === 'orz-host-include-ready') state.readies.include = copy;\n      if (d.type === 'orz-host-save' && cfg.ack) { state.acked++; f.contentWindow.postMessage({ type: 'orz-host-saved', ok: true }, origin); }\n    });\n    var hellos = [];\n    if (cfg.save) hellos.push(['save', { type: 'orz-host-hello', protocol: 'orz-host-save', version: 1 }]);\n    if (cfg.ai) hellos.push(['ai', { type: 'orz-host-ai-hello', protocol: 'orz-host-ai', version: 1, operations: [{ id: 'conformance-op', title: 'Conformance op', selection: false }] }]);\n    if (cfg.include) hellos.push(['include', { type: 'orz-host-include-hello', protocol: 'orz-host-include', version: 1 }]);\n    var send = function () { hellos.forEach(function (h) { if (!state.readies[h[0]] && f.contentWindow) f.contentWindow.postMessage(h[1], origin); }); };\n    f.addEventListener('load', send);\n    var started = Date.now();\n    var timer = setInterval(function () { send(); if (Date.now() - started > 20000) clearInterval(timer); }, 400);\n    document.body.appendChild(f);\n    send();\n    window.__hostState = state;\n    return true;\n  },\n};\n</script></body></html>";
/** A blank page of the harness origin (loads the bundle under test by URL). */
export declare function bundlePage(bundleUrl: string): string;
//# sourceMappingURL=page.d.ts.map