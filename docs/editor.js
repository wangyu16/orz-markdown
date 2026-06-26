/* orz Markdown editor — a small PWA. Renders with the vendored orz-markdown
 * bundle (window.orzmd.render), edits with CodeMirror, opens/saves real files via
 * the File System Access API, and registers as a .md handler via the manifest +
 * launchQueue. Everything runs locally; no document is sent anywhere. */
(function () {
  'use strict';
  var cm, fileHandle = null, dirty = false, renderTimer = null;
  var body = document.body;
  function $(id) { return document.getElementById(id); }
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 1800); }

  /* ---------- render ---------- */
  function enhance(root) {
    var w = window;
    if (root.querySelector('.mermaid') && !w.__mmLoading) {
      w.__mmLoading = true;
      load('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js', function () {
        if (w.mermaid) { w.mermaid.initialize({ startOnLoad: false }); }
      });
    }
    if (w.mermaid) { try { w.mermaid.run({ querySelector: '.mermaid:not([data-processed])' }); } catch (e) {} }
    if (root.querySelector('canvas[data-smiles]')) load('https://unpkg.com/smiles-drawer@1.0.10/dist/smiles-drawer.min.js', function () {
      if (!w.SmilesDrawer) return;
      root.querySelectorAll('canvas[data-smiles]').forEach(function (c) {
        if (c.__done) return; c.__done = 1;
        var d = new w.SmilesDrawer.Drawer({ width: c.width, height: c.height });
        w.SmilesDrawer.parse(c.getAttribute('data-smiles'), function (t) { try { d.draw(t, c, 'light', false); } catch (e) {} });
      });
    });
  }
  function load(src, cb) {
    if (document.querySelector('script[data-l="' + src + '"]')) { cb && cb(); return; }
    var s = document.createElement('script'); s.src = src; s.async = true; s.setAttribute('data-l', src);
    s.onload = function () { cb && cb(); }; document.head.appendChild(s);
  }
  function render() {
    var src = cm ? cm.getValue() : '';
    try { $('preview').innerHTML = window.orzmd ? window.orzmd.render(src) : '<p>(renderer not loaded)</p>'; }
    catch (e) { $('preview').innerHTML = '<pre style="color:#b4232a">render error: ' + String(e) + '</pre>'; }
    enhance($('preview'));
  }
  function scheduleRender() { if (renderTimer) clearTimeout(renderTimer); renderTimer = setTimeout(render, 200); }

  function setDirty(d) { dirty = d; body.setAttribute('data-dirty', d ? '1' : '0'); }
  function setName(n) { $('fname').textContent = n; document.title = n + ' — orz Markdown'; }

  /* ---------- files (File System Access) ---------- */
  var PICK = { types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.md', '.markdown', '.txt'] } }] };
  function loadFile(handle) {
    return handle.getFile().then(function (f) { return f.text().then(function (text) {
      fileHandle = handle; cm.setValue(text); setName(handle.name || f.name || 'untitled.md'); setDirty(false);
      cm.clearHistory(); render();
    }); });
  }
  function openFile() {
    if (!window.showOpenFilePicker) { toast('Open needs a Chromium-based browser'); return; }
    window.showOpenFilePicker(PICK).then(function (hs) { return loadFile(hs[0]); }).catch(function (e) { if (e && e.name !== 'AbortError') toast('Could not open file'); });
  }
  function writeTo(handle) {
    return handle.createWritable().then(function (w) { return Promise.resolve(w.write(cm.getValue())).then(function () { return w.close(); }); });
  }
  function save() {
    if (fileHandle) { writeTo(fileHandle).then(function () { setDirty(false); toast('Saved'); }).catch(function () { saveAs(); }); }
    else saveAs();
  }
  function saveAs() {
    if (!window.showSaveFilePicker) { downloadFallback(); return; }
    window.showSaveFilePicker({ suggestedName: $('fname').textContent || 'untitled.md', types: PICK.types })
      .then(function (h) { fileHandle = h; setName(h.name); return writeTo(h); })
      .then(function () { setDirty(false); toast('Saved'); })
      .catch(function (e) { if (e && e.name !== 'AbortError') downloadFallback(); });
  }
  function downloadFallback() {
    var blob = new Blob([cm.getValue()], { type: 'text/markdown' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = $('fname').textContent || 'untitled.md';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Downloaded (this browser has no in-place save)');
  }
  function newDoc() {
    if (dirty && !confirm('Discard unsaved changes?')) return;
    fileHandle = null; cm.setValue(''); cm.clearHistory(); setName('untitled.md'); setDirty(false); render();
  }

  /* ---------- file association (PWA launch) ---------- */
  if ('launchQueue' in window && 'files' in LaunchParams.prototype) {
    window.launchQueue.setConsumer(function (params) {
      if (params.files && params.files.length) loadFile(params.files[0]);
    });
  }

  /* ---------- view / theme / split ---------- */
  function setView(v) { body.setAttribute('data-view', v); $('b-view').value = v; if (cm) setTimeout(function () { cm.refresh(); }, 30); }
  function setTheme(id) {
    var link = document.querySelector('link[href^="./themes/"]');
    if (link) link.href = './themes/' + id + '.css';
  }
  function wireSplit() {
    var s = $('split'), main = $('main'), drag = false;
    s.addEventListener('mousedown', function (e) { drag = true; e.preventDefault(); document.body.style.userSelect = 'none'; });
    document.addEventListener('mousemove', function (e) {
      if (!drag) return; var pct = Math.max(15, Math.min(85, e.clientX / window.innerWidth * 100));
      main.style.gridTemplateColumns = pct + '% 6px ' + (100 - pct) + '%';
    });
    document.addEventListener('mouseup', function () { if (drag) { drag = false; document.body.style.userSelect = ''; if (cm) cm.refresh(); } });
  }

  /* ---------- boot ---------- */
  function init() {
    cm = window.CodeMirror.fromTextArea($('ta'), { mode: 'markdown', lineNumbers: true, lineWrapping: true });
    cm.on('change', function () { setDirty(true); scheduleRender(); });
    $('b-new').onclick = newDoc; $('b-open').onclick = openFile; $('b-save').onclick = save; $('b-saveas').onclick = saveAs;
    $('b-view').onchange = function () { setView(this.value); };
    $('b-theme').onchange = function () { setTheme(this.value); };
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); save(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); openFile(); }
    });
    wireSplit();
    if (!cm.getValue()) cm.setValue('# Welcome to the orz Markdown editor\n\nType on the left; it renders with **orz-markdown** on the right.\n\n- Open a `.md` file (or set this app as your default `.md` editor)\n- Save writes back to the same file\n- Works offline once installed\n\nMath: $E = mc^2$\n');
    render(); setTimeout(function () { cm.refresh(); }, 40);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  /* ---------- service worker (offline) ---------- */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(function () {});
})();
