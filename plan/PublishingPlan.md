# Publishing Plan

## Overview

Before publishing to npm, four areas need attention: `package.json` metadata,
the file inclusion list, a root `README.md`, and a CSS class reference for
theme authors. The `prepublishOnly` script already runs `build` + `test`
automatically, so no extra gate is needed.

---

## 1 — `package.json` changes required

### 1a. Fill in identity fields

```json
"name":    "@orz-how/markdown-parser",
"version": "1.0.0",
"author":  "Yu Wang <yuwang@orz.how>",
"license": "MIT",
"repository": {
  "type": "git",
  "url":  "https://github.com/wangyu16/orz-markdown"
},
"homepage": "https://github.com/wangyu16/orz-markdown#readme",
"bugs":     "https://github.com/wangyu16/orz-markdown/issues"
```

### 1b. Expand `"files"` to include themes

```json
"files": [
  "dist",
  "themes"
]
```

### 1c. Expand `"exports"` to expose themes as a sub-path

```json
"exports": {
  ".":          "./dist/index.js",
  "./themes/*": "./themes/*"
}
```

This lets consumers import a theme path directly:

```js
import { createRequire } from 'module';
const css = fs.readFileSync(
  require.resolve('@yourname/markdown-it-customize/themes/dark-elegant-1.css'),
  'utf8'
);
```

### 1d. Improve keywords

```json
"keywords": [
  "markdown", "markdown-it", "parser", "plugin",
  "katex", "mermaid", "smiles", "qrcode", "toc", "footnote"
]
```

---

## 2 — Files to add before publishing

### 2a. Root `README.md` (required by npm)

Minimum sections:

- **Install** — `npm install <name>`
- **Quick start** — import `md` and call `md.render(source)`
- **Plugin syntax reference** — table of all `{{plugin}}` aliases and what each renders
- **Themes** — mention `themes/` directory, link to `themes/README.md`
- **Official plugins bundled** — list of all pre-configured plugins
- **Environment** — Node 20+, ESM

### 2b. `themes/README.md` (already created — see that file)

Lists every CSS class emitted by the parser so theme authors know exactly
what to target. Keep this updated whenever a new plugin is added.

---

## 3 — Pre-publish checklist

Run these in order before `npm publish`:

```sh
# 1. Clean build
rm -rf dist && npm run build

# 2. Full test suite
npm test

# 3. Dry-run — inspect exactly what will be published
npm pack --dry-run

# 4. Check that dist/ and themes/ are listed, and that src/, tests/,
#    scripts/, plan/ are NOT listed in the dry-run output.

# 5. Publish
npm publish --access public    # if scoped package
# or
npm publish                    # if unscoped
```

---

## 4 — Things that do NOT need to change

| Item | Reason |
|------|--------|
| `"main": "dist/index.js"` | Correct as-is |
| `"types": "dist/index.d.ts"` | Correct as-is |
| `"scripts.prepublishOnly"` | Already runs build + test |
| All `"dependencies"` | Runtime deps are correct |
| `tsx` in devDependencies | Only needed for `scripts/render.ts`, not published |

---

## 5 — Versioning strategy going forward

- Start at `1.0.0` on first publish.
- Adding a new plugin = minor bump (`1.1.0`).
- Bug fix to existing plugin = patch bump (`1.0.1`).
- Breaking change to plugin syntax or exported API = major bump (`2.0.0`).
- Themes are CSS only; changing a theme is a patch bump unless it removes
  a CSS class (which would break user stylesheets — treat as breaking).
