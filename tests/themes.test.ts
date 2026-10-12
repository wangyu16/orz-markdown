/**
 * The theme contract (references/themes.md): common.css owns structure and
 * behavior; a theme owns decoration. These checks keep the 12 bundled themes —
 * and any new one — from drifting back into re-implementing layout, which is
 * how `::: right` stopped working in one theme and YouTube embeds collapsed to
 * 300×150 in six others.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import postcss, { type Rule } from 'postcss';

const THEME_FILES = readdirSync('themes').filter((f) => f.endsWith('.css') && f !== 'common.css');
const STARTER = 'orz-markdown-skills/assets/minimal.css';
const ALL_THEMES = [...THEME_FILES.map((f) => `themes/${f}`), STARTER];

/**
 * Mechanisms common.css owns: selector (without the `.markdown-body ` prefix)
 * → properties a theme must not declare on it. Themes keep everything else —
 * colours, fonts, borders, backgrounds, radii, shadows, padding, margins, gaps.
 */
const OWNED: Array<[RegExp, string[]]> = [
  [/^\.left$/, ['float', 'max-width', 'width']],
  [/^\.right$/, ['text-align']],
  [/^\.center$/, ['text-align', 'max-width', 'margin', 'margin-left', 'margin-right', 'margin-inline']],
  [/^\.cols$/, ['display', 'grid-template-columns', 'align-items']],
  [/^\.col$/, ['min-width']],
  [/^\.tab$|^\.tab\.active$|^\.tabs:not\(\[data-js\]\) (> )?\.tab$/, ['display']],
  [/^\.tabs-bar$/, ['display', 'overflow-x', 'scrollbar-width']],
  [/^\.tabs-bar::-webkit-scrollbar$/, ['display']],
  [/^\.tabs-bar-btn$/, ['white-space']],
  [/^(> )?table$|^td table$/, ['display', 'width', 'max-width', 'overflow-x', 'overflow']],
  [/^img$/, ['display', 'max-width', 'max-height', 'object-fit']],
  [/^pre$/, ['overflow-x']],
  [/^\.katex-display$/, ['overflow-x', 'overflow-y', 'max-width']],
  [/^(div)?\.youtube-embed$/, ['position', 'padding-bottom', 'height', 'overflow', 'width', 'aspect-ratio']],
  [/^(div)?\.youtube-embed iframe$/, ['position', 'top', 'left', 'inset', 'width', 'height']],
  [/^(div)?\.mermaid$/, ['overflow-x']],
  [/^(div)?\.mermaid svg$/, ['max-width', 'height']],
  [/^canvas\.orz-chart$/, ['max-width']],
  [/^div\.smiles-render$/, ['display', 'align-items', 'justify-content']],
  [/^div\.smiles-render canvas$|^canvas\[data-smiles\]$/, ['display', 'max-width']],
  [/^span\.qrcode$/, ['display', 'position']],
  [/^\.markdown-body$/, ['display', 'max-width']],
  [/^\.toc-list$|^nav\.toc$/, ['list-style']],
  [/^\.task-list-item$/, ['list-style']],
];

function ownedProps(selector: string): string[] {
  const key = selector.trim().replace(/^(?::where\(\.markdown-body\)|\.markdown-body)\s+/, '');
  for (const [re, props] of OWNED) if (re.test(key)) return props;
  return [];
}

function parse(path: string) {
  return postcss.parse(readFileSync(path, 'utf8'), { from: path });
}

describe('theme contract', () => {
  it.each(ALL_THEMES)('%s imports common.css before any rule', (path) => {
    const root = parse(path);
    const imports = root.nodes.filter((n) => n.type === 'atrule' && n.name === 'import');
    expect(imports.some((n) => /common\.css/.test((n as postcss.AtRule).params))).toBe(true);
    const firstRule = root.nodes.findIndex((n) => n.type === 'rule' || (n.type === 'atrule' && n.name !== 'import'));
    const commonImport = root.nodes.findIndex((n) => n.type === 'atrule' && /common\.css/.test((n as postcss.AtRule).params));
    expect(commonImport).toBeLessThan(firstRule);
  });

  it.each(ALL_THEMES)('%s does not re-declare structure owned by common.css', (path) => {
    const violations: string[] = [];
    parse(path).walkRules((rule: Rule) => {
      const media = rule.parent?.type === 'atrule' ? `@${(rule.parent as postcss.AtRule).params} ` : '';
      for (const selector of rule.selectors) {
        const owned = ownedProps(selector);
        rule.walkDecls((d) => {
          if (owned.includes(d.prop)) violations.push(`${media}${selector} { ${d.prop}: ${d.value} }`);
        });
      }
    });
    expect(violations).toEqual([]);
  });

  it.each(ALL_THEMES)('%s declares its colour scheme and article measure on :root', (path) => {
    const decls: Record<string, string> = {};
    parse(path).walkRules((rule) => {
      if (rule.selector.trim() === ':root') rule.walkDecls((d) => { decls[d.prop] = d.value; });
    });
    expect(decls['color-scheme']).toMatch(/^(light|dark)$/);
    expect(decls['--markdown-body-max-width']).toBeTruthy();
  });

  // Themes load into carrier pages beside editor UI (orz-mdhtml, orz-slides,
  // orz-paged). A bare `h1` or `*` rule restyled that UI too; every rule must
  // target the page roots or the article. `:where(.markdown-body)` scopes a
  // rule without raising its specificity, so existing cascades stay as they were.
  it.each([...ALL_THEMES, 'themes/common.css'])('[M.14] %s scopes every rule to the page or the article', (path) => {
    const PAGE = /^(:root|html|body|::selection|\*::selection|::-webkit-scrollbar(?:-[a-z]+)?|\.qrcode-overlay|\.markdown-body|:where\(\.markdown-body\))(?![\w-])/;
    const unscoped: string[] = [];
    parse(path).walkRules((rule) => {
      if (rule.parent?.type === 'atrule' && /keyframes/i.test((rule.parent as postcss.AtRule).name)) return;
      for (const selector of rule.selectors) {
        const sel = selector.trim();
        // A page root is allowed only by itself: `body .x` or `html *` would
        // reach host UI through the root (round 8, L4).
        // A qualified root (`body.font-serif`, the documented modifiers) may only
        // set custom properties, which the article consumes.
        const qualified = /^(html|body)(\.[\w-]+|\[[^\]]*\])+$/.test(sel);
        const onlyTokens = rule.nodes.every((n) => n.type !== 'decl' || (n as postcss.Declaration).prop.startsWith('--'));
        const rootDescendant = /^(:root|html|body)\b/.test(sel) && !/^(:root|html|body)(::?[a-z-]+(\([^)]*\))?)*$/.test(sel) && !(qualified && onlyTokens);
        if (!PAGE.test(sel) || rootDescendant) unscoped.push(sel);
      }
    });
    expect(unscoped).toEqual([]);
  });

  // Inherited properties on <body> reach every element of a host page: the
  // theme's typography belongs on the article (round 7, M-3). <html> may set
  // the rem base; <body> keeps only the page surface.
  it.each(ALL_THEMES)('[M.14] %s keeps typography off the page body', (path) => {
    const INHERITED = /^(color|font|font-family|font-size|font-weight|font-style|line-height|letter-spacing|word-spacing|text-align|text-transform|-webkit-font-smoothing|font-feature-settings|text-rendering)$/;
    const offenders: string[] = [];
    parse(path).walkRules((rule) => {
      const media = rule.parent?.type === 'atrule' ? (rule.parent as postcss.AtRule).params : '';
      if (/print/.test(media)) return; // a printout has no host UI
      if (!rule.selectors.some((sel) => sel.trim() === 'body')) return;
      rule.walkDecls((d) => { if (INHERITED.test(d.prop)) offenders.push(`body { ${d.prop} }`); });
    });
    expect(offenders).toEqual([]);
  });

  it.each(ALL_THEMES)('%s leaves narrow-screen layout to the family breakpoint', (path) => {
    const offenders: string[] = [];
    parse(path).walkAtRules('media', (at) => {
      if (!/max-width/.test(at.params)) return;
      at.walkRules((rule) => {
        if (rule.selectors.some((s) => /\.(left|cols)\b/.test(s))) {
          rule.walkDecls((d) => {
            if (['float', 'max-width', 'width', 'grid-template-columns'].includes(d.prop)) offenders.push(`${at.params} ${rule.selector}`);
          });
        }
      });
    });
    expect(offenders).toEqual([]);
  });
});

describe('the screen baseline grid (2.3.0)', () => {
  // A theme opts into the kit's grid pass (src/baseline-grid.ts) with --orz-grid on the article: the line pitch.
  // It is a screen feature: declared only inside @media screen, so print — and orz-paged, whose derivation drops
  // every @media block of a theme and draws its own page ruling — never sees the screen ruling or the pass.
  it('[M.31] only light-playful-1 opts in, inside @media screen on the article, with its pitch equal to the body line height; its ruling is the article\'s background there (no block draws its own ruling)', () => {
    const optIn: string[] = [];
    for (const f of THEME_FILES) {
      parse(`themes/${f}`).walkDecls('--orz-grid', (d) => {
        const rule = d.parent as Rule;
        const media = rule.parent?.type === 'atrule' ? (rule.parent as postcss.AtRule).params : '';
        optIn.push(`${f} ${media} ${rule.selector} ${d.value}`);
      });
    }
    expect(optIn).toEqual(['light-playful-1.css screen .markdown-body var(--rule)']);
    const root = parse('themes/light-playful-1.css');
    let lineHeight = '';
    root.walkRules('.markdown-body', (rule) => { if (rule.parent?.type === 'root') rule.walkDecls('line-height', (d) => { lineHeight = d.value; }); });
    expect(lineHeight).toBe('var(--rule)');
    const ruled: string[] = [];
    root.walkRules((rule) => {
      if (/::?before/.test(rule.selector) && /> (p|ul|ol)/.test(rule.selector)) ruled.push(rule.selector);
    });
    expect(ruled).toEqual([]);
  });
});

describe('common.css stays a structure layer', () => {
  it('carries no decoration outside the functional QR and SMILES rules', () => {
    const DECORATION = /^(color|font|font-family|font-weight|font-style|box-shadow|text-shadow|border-color|background-image|letter-spacing)$/;
    const offenders: string[] = [];
    parse('themes/common.css').walkDecls((d) => {
      const rule = d.parent as Rule;
      if (!DECORATION.test(d.prop)) return;
      if (/qrcode|smiles/.test(rule.selector)) return; // functional: scannable QR, transparent molecule surface
      offenders.push(`${rule.selector} { ${d.prop} }`);
    });
    expect(offenders).toEqual([]);
  });

  it('is shipped identically beside the starter theme and on the website', () => {
    const common = readFileSync('themes/common.css', 'utf8');
    expect(readFileSync('orz-markdown-skills/assets/common.css', 'utf8')).toBe(common); // npm run build
    expect(readFileSync('docs/themes/common.css', 'utf8')).toBe(common); // npm run build:web
  });

  it('every bundled theme is also on the website', () => {
    for (const f of THEME_FILES) {
      expect(readFileSync(`docs/themes/${f}`, 'utf8'), f).toBe(readFileSync(`themes/${f}`, 'utf8'));
    }
  });
});

describe('the theme list (2.2.0)', () => {
  it('[M.25] THEMES (main entry and orz-markdown/themes) lists exactly the theme files in themes/ — ids, unique names, each theme\'s scheme as its stylesheet declares (color-scheme) — with DEFAULT_THEME among them; themeInfo falls back to the default; the package exports ./themes', async () => {
    const { THEMES, DEFAULT_THEME, themeInfo, isThemeId } = await import('../src/themes.js');
    const main = await import('../src/index.js');
    expect(main.THEMES).toBe(THEMES);
    expect(main.DEFAULT_THEME).toBe(DEFAULT_THEME);
    expect(THEMES.map((t) => `${t.id}.css`).sort()).toEqual([...THEME_FILES].sort());
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(THEMES.length);
    for (const t of THEMES) {
      const css = readFileSync(`themes/${t.id}.css`, 'utf8');
      // the screen declaration (outside @media print, where a dark theme may print light)
      const screen = css.replace(/@media\s+print\s*\{[\s\S]*?\n\}/g, '');
      const declared = [...screen.matchAll(/color-scheme:\s*(light|dark)\b/g)].map((m) => m[1]);
      expect(declared.length, t.id).toBeGreaterThan(0);
      expect(new Set(declared), t.id).toEqual(new Set([t.scheme]));
      expect(Object.isFrozen(t), t.id).toBe(true);
    }
    expect(Object.isFrozen(THEMES)).toBe(true);
    expect(isThemeId(DEFAULT_THEME)).toBe(true);
    expect(themeInfo('dark-elegant-3')).toMatchObject({ id: 'dark-elegant-3', scheme: 'dark', name: 'Nocturne' });
    expect(themeInfo('no-such-theme').id).toBe(DEFAULT_THEME);
    expect(themeInfo(undefined).id).toBe(DEFAULT_THEME);
    expect(isThemeId('common')).toBe(false);
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { exports: Record<string, string> };
    expect(pkg.exports['./themes']).toBe('./dist/themes.js');
    expect(pkg.exports['./themes/*']).toBe('./themes/*');
  });
});
