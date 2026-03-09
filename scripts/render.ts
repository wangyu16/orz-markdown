/**
 * scripts/render.ts
 *
 * Converts tests/example.md → tests/example.html using the customised parser.
 * Run with:  npm run render
 */

import fs from 'fs';
import path from 'path';
import { md } from '../src/index.js';

const ROOT = process.cwd();  // run from project root
const INPUT  = path.join(ROOT, 'tests', 'example.md');
const OUTPUT = path.join(ROOT, 'tests', 'example.html');

type ThemeDefinition = {
  styleId: string;
  name: string;
  file: string;
  colorScheme: 'dark' | 'light';
  mermaidTheme: 'dark' | 'default';
  smilesTheme: 'dark' | 'light';
};

const THEMES: ThemeDefinition[] = [
  {
    styleId: 'theme-1',
    name: 'Dark Elegant I',
    file: 'dark-elegant-1.css',
    colorScheme: 'dark',
    mermaidTheme: 'dark',
    smilesTheme: 'dark',
  },
  {
    styleId: 'theme-2',
    name: 'Dark Elegant II',
    file: 'dark-elegant-2.css',
    colorScheme: 'dark',
    mermaidTheme: 'dark',
    smilesTheme: 'dark',
  },
  {
    styleId: 'theme-3',
    name: 'Light Neat I',
    file: 'light-neat-1.css',
    colorScheme: 'light',
    mermaidTheme: 'default',
    smilesTheme: 'light',
  },
  {
    styleId: 'theme-4',
    name: 'Light Neat II',
    file: 'light-neat-2.css',
    colorScheme: 'light',
    mermaidTheme: 'default',
    smilesTheme: 'light',
  },
  {
    styleId: 'theme-5',
    name: 'Beige Decent I',
    file: 'beige-decent-1.css',
    colorScheme: 'light',
    mermaidTheme: 'default',
    smilesTheme: 'light',
  },
  {
    styleId: 'theme-6',
    name: 'Beige Decent II',
    file: 'beige-decent-2.css',
    colorScheme: 'light',
    mermaidTheme: 'default',
    smilesTheme: 'light',
  },
  {
    styleId: 'theme-7',
    name: 'Light Academic I',
    file: 'light-academic-1.css',
    colorScheme: 'light',
    mermaidTheme: 'default',
    smilesTheme: 'light',
  },
  {
    styleId: 'theme-8',
    name: 'Light Academic II',
    file: 'light-academic-2.css',
    colorScheme: 'light',
    mermaidTheme: 'default',
    smilesTheme: 'light',
  },
  {
    styleId: 'theme-9',
    name: 'Light Playful I',
    file: 'light-playful-1.css',
    colorScheme: 'light',
    mermaidTheme: 'default',
    smilesTheme: 'light',
  },
  {
    styleId: 'theme-10',
    name: 'Light Playful II',
    file: 'light-playful-2.css',
    colorScheme: 'light',
    mermaidTheme: 'default',
    smilesTheme: 'light',
  },
];

const source    = fs.readFileSync(INPUT, 'utf8');
const body      = md.render(source, { markdownBasePath: path.dirname(INPUT) });
const themes    = THEMES.map((theme) => ({
  ...theme,
  css: fs.readFileSync(path.join(ROOT, 'themes', theme.file), 'utf8'),
}));

const inlinedThemeStyles = themes.map((theme, index) => `  <style id="${theme.styleId}" media="${index === 0 ? 'all' : 'not all'}">
${theme.css}
  </style>`).join('\n');

const themeMenuItems = themes.map((theme, index) => `      <button class="theme-option" type="button" data-theme-index="${index}" aria-pressed="false">
        <span class="theme-option-name">${theme.name}</span>
        <span class="theme-option-kind">${theme.colorScheme === 'dark' ? 'Dark' : 'Light'}</span>
      </button>`).join('\n');

const themeMetadata = JSON.stringify(themes.map(({ styleId, name, colorScheme, mermaidTheme, smilesTheme }) => ({
  styleId,
  name,
  colorScheme,
  mermaidTheme,
  smilesTheme,
})));

// ── JavaScript snippets bundled into the page ────────────────────────────────

/**
 * Tabs initialisation
 * Finds every .tabs element, reads the data-label from each .tab child,
 * builds a tab bar at the top, and wires click handlers.
 */
const TABS_JS = `
(function () {
  document.querySelectorAll('.tabs').forEach(function (tabs) {
    tabs.setAttribute('data-js', '1');
    var panels = tabs.querySelectorAll(':scope > .tab');
    if (!panels.length) return;

    // Build the tab bar
    var bar = document.createElement('div');
    bar.className = 'tabs-bar';
    panels.forEach(function (panel, i) {
      var label = panel.getAttribute('data-label') || 'Tab ' + (i + 1);
      var btn   = document.createElement('button');
      btn.className   = 'tabs-bar-btn' + (i === 0 ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', function () {
        tabs.querySelectorAll('.tabs-bar-btn').forEach(function (b) { b.classList.remove('active'); });
        panels.forEach(function (p) { p.classList.remove('active'); });
        btn.classList.add('active');
        panel.classList.add('active');
      });
      bar.appendChild(btn);
    });
    tabs.insertBefore(bar, tabs.firstChild);

    // Show first tab by default
    panels[0].classList.add('active');
  });
})();
`;

/**
 * Theme switcher, Mermaid renderer, and SMILES renderer
 * Reads the saved theme from localStorage on load, applies it by toggling
 * the inlined theme styles, updates theme-dependent assets, and drives
 * the floating pop-out menu.
 */
const THEME_JS = `
(function () {
  var storageKey = 'md-theme';
  var scrollKey = 'md-theme-scroll';
  var themes = ${themeMetadata};
  var current = 0;
  var applyVersion = 0;
  var root = document.documentElement;
  var switcher = document.getElementById('theme-switcher');
  var toggle = document.getElementById('theme-toggle');
  var menu = document.getElementById('theme-menu');
  var label = document.getElementById('theme-label');
  var optionButtons = Array.prototype.slice.call(document.querySelectorAll('.theme-option'));
  var mermaidNodes = Array.prototype.slice.call(document.querySelectorAll('.mermaid'));

  mermaidNodes.forEach(function (node) {
    if (!node.hasAttribute('data-source')) {
      node.setAttribute('data-source', (node.textContent || '').trim());
    }
  });

  function normaliseIndex(value) {
    var idx = parseInt(String(value), 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= themes.length) return 0;
    return idx;
  }

  function setMenuOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    switcher.classList.toggle('open', open);
  }

  function reloadForTheme(idx) {
    var safeIndex = normaliseIndex(idx);
    if (safeIndex === current) {
      setMenuOpen(false);
      return;
    }

    localStorage.setItem(storageKey, String(safeIndex));
    sessionStorage.setItem(scrollKey, String(window.scrollY || window.pageYOffset || 0));
    window.location.reload();
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }

  function syncHighlight(theme) {
    var darkLink = document.getElementById('hljs-dark');
    var lightLink = document.getElementById('hljs-light');
    if (!darkLink || !lightLink) return;

    if (theme.colorScheme === 'dark') {
      darkLink.media = 'all';
      lightLink.media = 'not all';
      return;
    }

    darkLink.media = 'not all';
    lightLink.media = 'all';
  }

  function syncMenu(idx) {
    optionButtons.forEach(function (button) {
      var active = Number(button.getAttribute('data-theme-index')) === idx;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  async function renderMermaids(theme, requestId) {
    if (typeof mermaid === 'undefined') return;

    mermaid.initialize({ startOnLoad: false, theme: theme.mermaidTheme });

    for (var i = 0; i < mermaidNodes.length; i += 1) {
      if (requestId !== applyVersion) return;

      var node = mermaidNodes[i];
      var source = node.getAttribute('data-source') || '';
      if (!source.trim()) continue;

      try {
        var result = await mermaid.render('mermaid-' + theme.styleId + '-' + i + '-' + Date.now(), source);
        if (requestId !== applyVersion) return;
        node.innerHTML = result.svg;
        if (typeof result.bindFunctions === 'function') {
          result.bindFunctions(node);
        }
      } catch (err) {
        console.error('Mermaid render error:', err);
        node.textContent = source;
      }
    }
  }

  function renderSmiles(theme, requestId) {
    if (typeof SmilesDrawer === 'undefined') return;

    Array.prototype.slice.call(document.querySelectorAll('canvas[data-smiles]')).forEach(function (canvas, i) {
      if (requestId !== applyVersion) return;

      var smiles = canvas.getAttribute('data-smiles');
      if (!smiles) return;

      var freshCanvas = canvas.cloneNode(false);
      freshCanvas.width = canvas.width;
      freshCanvas.height = canvas.height;
      if (canvas.id) {
        freshCanvas.id = canvas.id;
      } else {
        freshCanvas.id = 'smiles-canvas-' + i;
      }

      canvas.replaceWith(freshCanvas);

      var drawer = new SmilesDrawer.Drawer({ width: freshCanvas.width, height: freshCanvas.height });
      SmilesDrawer.parse(smiles, function (tree) {
        if (requestId !== applyVersion || !freshCanvas.isConnected) return;
        drawer.draw(tree, freshCanvas, theme.smilesTheme, false);
      }, function (err) {
        console.error('SMILES parse error:', err);
      });
    });
  }

  async function apply(idx) {
    var requestId = ++applyVersion;
    var safeIndex = normaliseIndex(idx);
    var theme = themes[safeIndex];

    themes.forEach(function (entry, i) {
      var style = document.getElementById(entry.styleId);
      if (style) {
        style.media = i === safeIndex ? 'all' : 'not all';
      }
    });

    root.setAttribute('data-ui-scheme', theme.colorScheme);
    label.textContent = theme.name;
    toggle.title = 'Theme: ' + theme.name;
    syncMenu(safeIndex);
    syncHighlight(theme);
    localStorage.setItem(storageKey, String(safeIndex));
    current = safeIndex;

    await nextFrame();
    if (requestId !== applyVersion) return;

    await renderMermaids(theme, requestId);
    if (requestId !== applyVersion) return;

    renderSmiles(theme, requestId);
  }

  optionButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      reloadForTheme(Number(button.getAttribute('data-theme-index')));
    });
  });

  toggle.addEventListener('click', function (event) {
    event.stopPropagation();
    setMenuOpen(menu.hidden);
  });

  menu.addEventListener('click', function (event) {
    event.stopPropagation();
  });

  document.addEventListener('click', function (event) {
    if (!switcher.contains(event.target)) {
      setMenuOpen(false);
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      setMenuOpen(false);
    }
  });

  apply(normaliseIndex(localStorage.getItem(storageKey) || 0)).then(function () {
    var savedScroll = sessionStorage.getItem(scrollKey);
    if (savedScroll !== null) {
      window.scrollTo(0, Number(savedScroll) || 0);
      sessionStorage.removeItem(scrollKey);
    }
  });
})();
`;

// ── HTML template ─────────────────────────────────────────────────────────────

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Example</title>

  <!-- Google Fonts preconnect hints (used by both themes) -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

  <!-- KaTeX CSS (CDN) -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.35/dist/katex.min.css">

  <!-- Highlight.js — theme-dependent syntax highlighting -->
  <link id="hljs-dark" rel="stylesheet" media="all" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css">
  <link id="hljs-light" rel="stylesheet" media="not all" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">

  <!-- Inlined themes — only the active one applies (media="all") -->
${inlinedThemeStyles}

  <!-- Theme-agnostic UI chrome -->
  <style>
    :root {
      --theme-ui-bg: rgba(255, 255, 255, 0.9);
      --theme-ui-bg-hover: rgba(255, 255, 255, 0.98);
      --theme-ui-panel: rgba(255, 255, 255, 0.92);
      --theme-ui-border: rgba(25, 43, 59, 0.12);
      --theme-ui-shadow: 0 16px 40px rgba(28, 43, 57, 0.18);
      --theme-ui-text: rgba(18, 30, 42, 0.88);
      --theme-ui-text-soft: rgba(54, 72, 89, 0.7);
      --theme-ui-accent: #2e8bcf;
    }

    html[data-ui-scheme="dark"] {
      --theme-ui-bg: rgba(8, 12, 18, 0.84);
      --theme-ui-bg-hover: rgba(19, 26, 36, 0.95);
      --theme-ui-panel: rgba(10, 16, 24, 0.92);
      --theme-ui-border: rgba(255, 255, 255, 0.12);
      --theme-ui-shadow: 0 18px 44px rgba(0, 0, 0, 0.45);
      --theme-ui-text: rgba(239, 245, 255, 0.92);
      --theme-ui-text-soft: rgba(190, 205, 224, 0.68);
      --theme-ui-accent: #8fdff7;
    }

    #theme-switcher {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      z-index: 9999;
      font-family: system-ui, sans-serif;
    }

    #theme-toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.7rem;
      min-width: 13.5rem;
      padding: 0.7rem 0.9rem;
      border-radius: 1rem;
      border: 1px solid var(--theme-ui-border);
      background: var(--theme-ui-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      color: var(--theme-ui-text);
      font-size: 0.84rem;
      font-family: inherit;
      cursor: pointer;
      box-shadow: var(--theme-ui-shadow);
      transition: background 0.2s, transform 0.15s, border-color 0.2s;
    }

    #theme-toggle:hover {
      background: var(--theme-ui-bg-hover);
      transform: translateY(-1px);
    }

    #theme-toggle:active {
      transform: translateY(0);
    }

    #theme-toggle .icon {
      font-size: 1rem;
    }

    #theme-toggle .meta {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.06rem;
      min-width: 0;
    }

    #theme-toggle .eyebrow {
      font-size: 0.68rem;
      font-weight: 500;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--theme-ui-text-soft);
    }

    #theme-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 700;
      letter-spacing: 0.01em;
    }

    #theme-toggle .chevron {
      font-size: 0.85rem;
      color: var(--theme-ui-text-soft);
      transition: transform 0.18s ease;
    }

    #theme-switcher.open #theme-toggle .chevron {
      transform: rotate(180deg);
    }

    #theme-menu {
      position: absolute;
      right: 0;
      bottom: calc(100% + 0.7rem);
      width: min(18rem, calc(100vw - 2rem));
      padding: 0.45rem;
      border-radius: 1rem;
      border: 1px solid var(--theme-ui-border);
      background: var(--theme-ui-panel);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      box-shadow: var(--theme-ui-shadow);
    }

    #theme-menu[hidden] {
      display: none;
    }

    .theme-option {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.9rem;
      padding: 0.72rem 0.8rem;
      border: 0;
      border-radius: 0.8rem;
      background: transparent;
      color: var(--theme-ui-text);
      font: inherit;
      text-align: left;
      cursor: pointer;
      transition: background 0.18s ease, color 0.18s ease;
    }

    .theme-option:hover {
      background: rgba(127, 127, 127, 0.08);
    }

    .theme-option.active {
      background: rgba(46, 139, 207, 0.14);
      color: var(--theme-ui-accent);
    }

    .theme-option-name {
      font-weight: 600;
    }

    .theme-option-kind {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--theme-ui-text-soft);
    }

    @media (max-width: 640px) {
      #theme-switcher {
        left: 0.75rem;
        right: 0.75rem;
        bottom: 0.75rem;
      }

      #theme-toggle {
        width: 100%;
      }

      #theme-menu {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <article class="markdown-body">
${body}
  </article>

  <!-- Theme switcher -->
  <div id="theme-switcher">
    <button id="theme-toggle" type="button" title="Theme: Dark Elegant I" aria-label="Choose theme" aria-haspopup="true" aria-expanded="false">
      <span class="icon">◐</span>
      <span class="meta">
        <span class="eyebrow">Theme</span>
        <span id="theme-label">Dark Elegant I</span>
      </span>
      <span class="chevron">▾</span>
    </button>
    <div id="theme-menu" role="menu" hidden>
${themeMenuItems}
    </div>
  </div>

  <!-- Highlight.js — syntax highlighting -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
  <script>if (typeof hljs !== 'undefined') hljs.highlightAll();</script>

  <!-- Mermaid.js — renders .mermaid divs client-side -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>

  <!-- SmilesDrawer — renders [data-smiles] canvas elements client-side -->
  <script src="https://unpkg.com/smiles-drawer@1.0.10/dist/smiles-drawer.min.js"></script>

  <!-- Tabs component -->
  <script>${TABS_JS}</script>

  <!-- Theme switcher logic -->
  <script>${THEME_JS}</script>
</body>
</html>
`;

fs.writeFileSync(OUTPUT, html, 'utf8');
console.log(`Rendered → ${path.relative(process.cwd(), OUTPUT)}`);
