/* orz Markdown editor — a small PWA. Renders with the vendored orz-markdown
 * bundle (window.orzmd.render) into an isolated <iframe> (so the content theme
 * never touches the editor chrome), edits with CodeMirror, opens/saves real files
 * via the File System Access API, and registers as a .md handler (manifest
 * file_handlers + launchQueue). Everything runs locally. */
(function () {
  'use strict';
  var THEMES = [
    ['light-neat-3', 'Orchard'], ['light-neat-1', 'Neat'], ['light-neat-2', 'Neat 2'],
    ['light-academic-1', 'Academic'], ['light-academic-2', 'Academic 2'],
    ['beige-decent-1', 'Beige'], ['beige-decent-2', 'Beige 2'],
    ['light-playful-1', 'Playful'], ['light-playful-2', 'Playful 2'],
    ['dark-elegant-1', 'Dark Elegant'], ['dark-elegant-2', 'Dark Elegant 2'], ['dark-elegant-3', 'Nocturne']
  ];
  // Preview-iframe assets (CDN URLs, runtime, highlight/mermaid/smiles/chart wiring)
  // come from orz-markdown's shared helper, exposed on the bundle as
  // window.orzmd.previewAssets — one source of truth across all host apps.
  var CM_DARK = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/theme/material-darker.min.css';
  function isDarkTheme(t) { return /^dark/.test(t); }
  function scheme(t) { return isDarkTheme(t) ? 'dark' : 'light'; }
  var SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M18.5 5.5l-1.4 1.4M6.9 17.1l-1.4 1.4"/>';
  var MOON = '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8z"/>';
  // Default document (a tour of every feature) lives as a hidden markdown <script>
  // in the page, so we don't have to escape backslashes/backticks in JS.
  var WELCOME = (function () { var e = document.getElementById('welcome'); return e ? e.textContent.replace(/^\n+/, '').replace(/\s+$/, '') : '# orz Markdown\n'; })();

  var cm, frame, frameReady = false, fileHandle = null, dirty = false, rTimer = null, theme;
  var splitCols = '', sync = true, driver = 'ed', fontScale = 1;
  var root = document.documentElement;
  function $(id) { return document.getElementById(id); }
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 1800); }

  /* isolated iframe preview, wired per the orz-markdown embedding guide: theme +
     KaTeX + highlight.js CSS, the diagram libs, and the orz browser runtime
     (copy-as-Markdown + tabs + QR expand). __orzEnhance re-runs highlight /
     mermaid / smiles / chart + runtime.init after every render; the runtime's
     copy handler is installed once on the iframe document. (editor.js is an
     external script, so literal </script> inside the srcdoc string is fine;
     only the embedded runtime is guarded.) */
  function shell(th) {
    var pa = window.orzmd && window.orzmd.previewAssets;
    return '<!doctype html><html><head><meta charset=utf8><base target=_blank>' +
      '<link id=th rel=stylesheet href="./themes/' + th + '.css">' +
      (pa ? pa.headLinks(scheme(th)) : '') +
      '<style>html{height:100%}body{margin:0;min-height:100%}.orz-wrap{max-width:46em;margin:0 auto;padding:32px 34px 72px}img{max-width:100%}.markdown-body canvas[data-smiles],.markdown-body .mermaid svg,.markdown-body canvas.orz-chart{max-width:100%;height:auto}</style>' +
      '</head><body><div class="orz-wrap"><article class="markdown-body" id=c></article></div>' +
      (pa ? pa.bodyScripts() : '') +
      '</body></html>';
  }
  function buildFrame() {
    frame.srcdoc = shell(theme);
    frame.onload = function () {
      frameReady = true;
      var w = frame.contentWindow;
      w.addEventListener('scroll', pvToEd, { passive: true });
      w.addEventListener('wheel', function () { driver = 'pv'; }, { passive: true });
      w.addEventListener('mousedown', function () { driver = 'pv'; });
      applyFont();
      render();
      enhanceSoon();
    };
  }
  // preview text size: drive the theme's --font-scale (every bundled theme honors it)
  function applyFont() {
    if (frameReady && frame.contentDocument && frame.contentDocument.documentElement)
      frame.contentDocument.documentElement.style.setProperty('--font-scale', String(fontScale));
  }
  function setFont(delta) {
    fontScale = Math.max(0.8, Math.min(1.6, Math.round((fontScale + delta) * 100) / 100));
    try { localStorage.setItem('orz-md:font', String(fontScale)); } catch (e) {}
    applyFont();
  }
  // Run the in-frame enhancer (highlight/mermaid/smiles/chart/runtime). Pass the
  // current theme's light/dark scheme so SMILES bonds are visible on dark themes.
  function enhance() {
    var w = frame.contentWindow; if (!w) return;
    try { w.__orzSmilesTheme = isDarkTheme(theme) ? 'dark' : 'light'; } catch (e) {}
    if (typeof w.__orzEnhance === 'function') { try { w.__orzEnhance(); } catch (e) {} }
  }
  // CDN libs in the iframe load async; retry a few times after first paint.
  function enhanceSoon() { enhance(); setTimeout(enhance, 200); setTimeout(enhance, 700); setTimeout(enhance, 1600); }
  // After a theme switch, redraw SMILES so bonds match the new light/dark scheme.
  function redrawSmiles() {
    var idoc = frame.contentDocument; if (!idoc) return;
    Array.prototype.forEach.call(idoc.querySelectorAll('canvas[data-smiles]'), function (cv) { cv.__d = false; });
    enhanceSoon();
  }
  function render() {
    if (!frameReady) return; var idoc = frame.contentDocument; var c = idoc && idoc.getElementById('c'); if (!c) return;
    try { c.innerHTML = window.orzmd ? window.orzmd.render(cm.getValue()) : '<p>(renderer not loaded)</p>'; }
    catch (e) { c.innerHTML = '<pre style="color:#b4232a">render error: ' + String(e) + '</pre>'; }
    enhance();
  }
  function schedule() { if (rTimer) clearTimeout(rTimer); rTimer = setTimeout(render, 200); }

  function setDirty(d) { dirty = d; document.body.setAttribute('data-dirty', d ? '1' : '0'); }
  function setName(n) { $('fname').textContent = n; document.title = n + ' · orz Markdown'; }

  /* files (File System Access) */
  var PICK = { types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.md', '.markdown', '.txt'] } }] };
  function loadFile(handle) {
    return handle.getFile().then(function (f) { return f.text().then(function (text) {
      fileHandle = handle; cm.setValue(text); setName(handle.name || f.name || 'untitled.md'); setDirty(false); cm.clearHistory(); render();
    }); });
  }
  function openFile() {
    if (!window.showOpenFilePicker) { toast('Open needs a Chromium-based browser'); return; }
    window.showOpenFilePicker(PICK).then(function (hs) { return loadFile(hs[0]); }).catch(function (e) { if (e && e.name !== 'AbortError') toast('Could not open file'); });
  }
  function writeTo(h) { return h.createWritable().then(function (w) { return Promise.resolve(w.write(cm.getValue())).then(function () { return w.close(); }); }); }
  function save() { if (fileHandle) writeTo(fileHandle).then(function () { setDirty(false); toast('Saved'); }).catch(function () { saveAs(); }); else saveAs(); }
  function saveAs() {
    if (!window.showSaveFilePicker) { dl(); return; }
    window.showSaveFilePicker({ suggestedName: $('fname').textContent || 'untitled.md', types: PICK.types })
      .then(function (h) { fileHandle = h; setName(h.name); return writeTo(h); })
      .then(function () { setDirty(false); toast('Saved'); })
      .catch(function (e) { if (e && e.name !== 'AbortError') dl(); });
  }
  function dl() {
    var b = new Blob([cm.getValue()], { type: 'text/markdown' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = $('fname').textContent || 'untitled.md'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast('Downloaded (no in-place save in this browser)');
  }
  function newDoc() { if (dirty && !confirm('Discard unsaved changes?')) return; fileHandle = null; cm.setValue(''); cm.clearHistory(); setName('untitled.md'); setDirty(false); render(); }

  /* file association (PWA launch) */
  if ('launchQueue' in window && 'files' in LaunchParams.prototype) {
    window.launchQueue.setConsumer(function (p) { if (p.files && p.files.length) loadFile(p.files[0]); });
  }

  /* theme / chrome / view */
  function setTheme(id) {
    theme = id; try { localStorage.setItem('orz-md:theme', id); } catch (e) {}
    if (frameReady) {
      var idoc = frame.contentDocument; var pa = window.orzmd && window.orzmd.previewAssets;
      var l = idoc.getElementById('th'); if (l) l.href = './themes/' + id + '.css';
      var hl = idoc.getElementById('orz-hljs'); if (hl && pa) hl.href = pa.hljsCss(scheme(id));
      redrawSmiles();
    }
    $('b-theme').value = id;
  }
  function ensureCss(href) { if (document.querySelector('link[href="' + href + '"]')) return; var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.appendChild(l); }
  function setChrome(m) {
    root.setAttribute('data-chrome', m); try { localStorage.setItem('orz-md:chrome', m); } catch (e) {}
    $('i-dark').innerHTML = m === 'dark' ? SUN : MOON;
    if (m === 'dark') { ensureCss(CM_DARK); if (cm) cm.setOption('theme', 'material-darker'); } else if (cm) cm.setOption('theme', 'default');
  }
  function setView(v) {
    root.setAttribute('data-view', v);
    Array.prototype.forEach.call($('seg-view').children, function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); });
    // clear the dragged inline ratio outside split view so the CSS collapse rules win; restore it on return
    $('main').style.gridTemplateColumns = (v === 'split') ? splitCols : '';
    if (cm) setTimeout(function () { cm.refresh(); }, 30);
  }

  /* splitter (drag to resize panes) */
  function wireSplit() {
    var s = $('split'), main = $('main'), drag = false;
    s.addEventListener('mousedown', function (e) { drag = true; e.preventDefault(); document.body.classList.add('resizing'); });
    document.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var p = Math.max(15, Math.min(85, e.clientX / window.innerWidth * 100));
      splitCols = p + '% 6px ' + (100 - p) + '%';
      main.style.gridTemplateColumns = splitCols;
    });
    document.addEventListener('mouseup', function () { if (!drag) return; drag = false; document.body.classList.remove('resizing'); if (cm) cm.refresh(); });
  }

  /* scroll sync (editor <-> preview), toggleable. Only the pane the user is
     actually interacting with (the "driver", set on pointer-enter / editor focus)
     propagates; the other pane's induced scroll events are ignored, so a
     programmatic scroll can never bounce back and fight the user. */
  function pvEl() { var d = frame.contentDocument; return d ? (d.scrollingElement || d.documentElement) : null; }
  function edToPv() {
    if (!sync || driver !== 'ed') return;
    var el = pvEl(); if (!el) return;
    var info = cm.getScrollInfo(); var r = info.top / ((info.height - info.clientHeight) || 1);
    el.scrollTop = r * (el.scrollHeight - el.clientHeight);
  }
  function pvToEd() {
    if (!sync || driver !== 'pv') return;
    var el = pvEl(); if (!el) return;
    var r = el.scrollTop / ((el.scrollHeight - el.clientHeight) || 1); var info = cm.getScrollInfo();
    cm.scrollTo(null, r * (info.height - info.clientHeight));
  }
  function setSync(on) {
    sync = on; try { localStorage.setItem('orz-md:sync', on ? '1' : '0'); } catch (e) {}
    $('b-sync').classList.toggle('on', on); $('b-sync').title = 'Sync scrolling: ' + (on ? 'on' : 'off');
    if (on) { driver = 'ed'; edToPv(); }
  }

  /* boot */
  function init() {
    frame = $('frame');
    $('b-theme').innerHTML = THEMES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('');
    theme = (function () { try { return localStorage.getItem('orz-md:theme'); } catch (e) { return null; } })() || 'light-neat-3';
    var chrome = (function () { try { return localStorage.getItem('orz-md:chrome'); } catch (e) { return null; } })() || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    $('b-theme').value = theme;
    cm = window.CodeMirror.fromTextArea($('ta'), { mode: 'markdown', lineNumbers: true, lineWrapping: true });
    cm.on('change', function () { setDirty(true); schedule(); });
    cm.on('scroll', edToPv);
    cm.on('focus', function () { driver = 'ed'; });
    $('ed').addEventListener('mouseenter', function () { driver = 'ed'; });
    $('ed').addEventListener('wheel', function () { driver = 'ed'; }, { passive: true });
    frame.addEventListener('mouseenter', function () { driver = 'pv'; });
    setChrome(chrome);
    $('b-new').onclick = newDoc; $('b-open').onclick = openFile; $('b-save').onclick = save; $('b-saveas').onclick = saveAs;
    $('b-theme').onchange = function () { setTheme(this.value); };
    $('b-dark').onclick = function () { setChrome(root.getAttribute('data-chrome') === 'dark' ? 'light' : 'dark'); };
    var syncPref = (function () { try { return localStorage.getItem('orz-md:sync'); } catch (e) { return null; } })();
    setSync(syncPref !== '0');
    $('b-sync').onclick = function () { setSync(!sync); };
    var fp = (function () { try { return parseFloat(localStorage.getItem('orz-md:font')); } catch (e) { return NaN; } })();
    if (fp >= 0.8 && fp <= 1.6) fontScale = fp;
    $('b-font-dec').onclick = function () { setFont(-0.1); };
    $('b-font-inc').onclick = function () { setFont(0.1); };
    Array.prototype.forEach.call($('seg-view').children, function (b) { b.onclick = function () { setView(b.getAttribute('data-v')); }; });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && /^s$/i.test(e.key)) { e.preventDefault(); save(); }
      if ((e.metaKey || e.ctrlKey) && /^o$/i.test(e.key)) { e.preventDefault(); openFile(); }
    });
    wireSplit();
    if (!cm.getValue()) cm.setValue(WELCOME);
    buildFrame();
    setTimeout(function () { cm.refresh(); }, 40);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // service worker + automatic update check: notify (not force) when a new version is ready
  var swReloading = false;
  function showUpdate(reg) {
    var bar = document.getElementById('update-bar'); if (!bar || bar.classList.contains('show')) return;
    bar.classList.add('show');
    document.getElementById('update-reload').onclick = function () { swReloading = true; if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING'); };
    document.getElementById('update-dismiss').onclick = function () { bar.classList.remove('show'); };
  }
  if ('serviceWorker' in navigator) {
    // reload only after the user opts in (the new SW takes control); never on first-visit claim
    navigator.serviceWorker.addEventListener('controllerchange', function () { if (swReloading) location.reload(); });
    navigator.serviceWorker.register('./sw.js').then(function (reg) {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
      reg.addEventListener('updatefound', function () {
        var nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', function () {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg);
        });
      });
      reg.update();
      setInterval(function () { reg.update(); }, 30 * 60 * 1000);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) reg.update(); });
    }).catch(function () {});
  }
})();
