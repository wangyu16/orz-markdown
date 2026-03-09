# Implementation Plan

## Overview

Seventeen phases, each building on the previous. Phases 0–4 establish infrastructure. Phases 5–15 implement plugins in order of increasing complexity. Phase 16 is full integration testing. Phase 17 is package publishing setup.

Each phase ends with explicit pass/fail verification criteria. Do not proceed to the next phase until all verification cases for the current phase pass.

Test runner: **Vitest** (or Jest). All test cases are written as unit tests that call `md.render(input)` and assert on the output string.

---

## Phase 0 — Project Setup

**Goal**: Working TypeScript project with build tooling and a baseline markdown-it instance.

### Implementation steps

1. `npm init` — create `package.json`
2. Install core dependencies:
   ```
   npm install markdown-it
   npm install --save-dev typescript vitest @types/node @types/markdown-it
   ```
3. Create `tsconfig.json` targeting CommonJS with `strict: true`
4. Create `src/index.ts` that instantiates and exports a plain `markdown-it` instance
5. Create `tests/` directory with a `baseline.test.ts`

### Verification

| Input | Expected output |
|---|---|
| `'# Hello'` | `<h1>Hello</h1>\n` |
| `'**bold**'` | `<p><strong>bold</strong></p>\n` |
| `'> quote'` | `<blockquote>\n<p>quote</p>\n</blockquote>\n` |

**Done when**: `npm run test` passes all three baseline cases.

---

## Phase 1 — Official Plugins Integration

**Goal**: All official plugins installed, registered, and individually verified. No custom rules yet.

### Dependencies to install

```
npm install markdown-it-anchor
npm install markdown-it-container
npm install markdown-it-footnote
npm install markdown-it-img-size
npm install markdown-it-mark
npm install markdown-it-sub
npm install markdown-it-sup
npm install markdown-it-ins
npm install markdown-it-task-lists
npm install @traptitech/markdown-it-katex katex
```

### Implementation steps

1. In `src/index.ts`, chain all `.use()` calls in this order:
   - `markdown-it-anchor` (must be first; TOC depends on its `id` generation)
   - `markdown-it-container`
   - `markdown-it-footnote`
   - `markdown-it-img-size`
   - `markdown-it-mark`
   - `markdown-it-sub`
   - `markdown-it-sup`
   - `markdown-it-ins`
   - `markdown-it-task-lists`
   - `@traptitech/markdown-it-katex` with `{ enableMhchem: true }`
2. Add `import 'katex/contrib/mhchem'` at the very top of `src/index.ts`

### Verification

Create `tests/official-plugins.test.ts`. One test per plugin:

| Plugin | Input | Expected output contains |
|---|---|---|
| anchor | `'# Hello'` | `id="hello"` |
| container | `'::: warning\ntext\n:::'` | `<div class="warning">` |
| footnote | `'text[^1]\n\n[^1]: note'` | `<footnote` or `<section` |
| img-size | `'![alt](img.png =100x50)'` | `width="100"` and `height="50"` |
| mark | `'==marked=='` | `<mark>marked</mark>` |
| sub | `'H~2~O'` | `<sub>2</sub>` |
| sup | `'x^2^'` | `<sup>2</sup>` |
| ins | `'++inserted++'` | `<ins>inserted</ins>` |
| tasklist | `'- [x] done'` | `checked` |
| katex inline | `'$E=mc^2$'` | `<span class="katex"` |
| katex block | `'$$\nE=mc^2\n$$'` | `katex-block` or `display` |
| mhchem | `'$\\ce{H2O}$'` | renders without error |

**Done when**: all twelve cases pass, no console errors thrown.

---

## Phase 2 — Plugin Registry

**Goal**: The registry module is implemented and unit-tested in isolation. No plugins registered yet.

### Files to create

- `src/registry.ts`

### Implementation steps

1. Define `PluginDefinition` interface:
   ```typescript
   interface PluginDefinition {
     type: 'block' | 'inline';
     aliases: string[];
     render: (args: string | null, body: string | null, env: object) => string;
   }
   ```
2. Implement `register(def)`, `hasBlock(name)`, `hasInline(name)`, `getDefinition(name)`
3. `register()` iterates over `def.aliases` and stores each in the Map, all pointing to the same definition object
4. `hasBlock(name)` returns true only if the definition exists AND `type === 'block'`; same logic for `hasInline`

### Verification

Create `tests/registry.test.ts`:

| Test | Expected |
|---|---|
| Register a block plugin with two aliases; both aliases return `hasBlock() === true` | pass |
| Register an inline plugin; `hasBlock()` returns false, `hasInline()` returns true | pass |
| `getDefinition('unregistered')` returns `undefined` | pass |
| Register two plugins with different names; no cross-contamination | pass |
| `render()` of a registered plugin is called correctly | pass |

**Done when**: all five registry tests pass.

---

## Phase 3 — Block Dispatcher

**Goal**: The block dispatcher rule is registered and handles all structural cases correctly, even before any plugins exist in the registry.

### Files to create

- `src/rules/block-dispatcher.ts`

### Implementation steps

1. Implement the scanning algorithm from `LogicOverview.md § 5.4`:
   - Check for `{{` at the start of the line (after indentation)
   - Check for `\{{` escape: if previous character is `\`, return false
   - Extract the name (alphanumeric + hyphens)
   - Lookup name in registry via `hasBlock(name)`; return false if not found
   - Extract optional `[args]` (immediately after name, no space)
   - Scan forward for `}}`, crossing lines if needed; return false if not found
   - In the non-silent pass: emit `plugin_block` token with `info`, `meta.args`, `content` (body)
   - Advance `state.line`
2. Register in `src/index.ts`:
   ```javascript
   md.block.ruler.after('blockquote', 'plugin_block_dispatcher', blockDispatcher, {
     alt: ['paragraph', 'reference', 'blockquote', 'list']
   });
   ```
3. Add a renderer stub for `plugin_block` that returns an empty string (plugins fill this in later)

### Verification

Create `tests/block-dispatcher.test.ts`. At this stage, no plugins are registered, so all `{{...}}` patterns should fall through as literal text:

| Input | Expected output |
|---|---|
| `'{{unknown-plugin}}'` | contains literal `{{unknown-plugin}}` |
| `'{{unknown body}}'` | contains literal `{{unknown` |
| Text in a fenced code block: `'\`\`\`\n{{unknown}}\n\`\`\`'` | contains `{{unknown}}` as code text, not parsed |
| Indented code block (4 spaces): `'    {{unknown}}'` | literal `{{unknown}}` in `<code>` |
| `'\{{unknown}}'` | contains `{{unknown}}` (backslash stripped, then not parsed) |

**Done when**: all five cases produce the expected literal output; the block dispatcher does not crash or silently consume anything.

---

## Phase 4 — Inline Dispatcher

**Goal**: The inline dispatcher rule is registered and handles its structural cases correctly, before any plugins.

### Files to create

- `src/rules/inline-dispatcher.ts`

### Implementation steps

1. Implement inline scanning:
   - Check for `{{` at current position
   - Extract name (alphanumeric + hyphens)
   - Lookup via `hasInline(name)`; return false if not found
   - Extract optional `[args]`
   - Scan for `}}` within the current inline buffer (no line crossing)
   - In non-silent pass: push `plugin_inline` token with `info`, `meta.args`, `content`
2. Register:
   ```javascript
   md.inline.ruler.after('escape', 'plugin_inline_dispatcher', inlineDispatcher);
   ```
3. Add a renderer stub for `plugin_inline`
4. Add a render rule for `plugin_inline` tokens (markdown-it inline tokens are rendered as children of block tokens; attach to `md.renderer.rules` — inline tokens are rendered via `renderToken` on `token.children`)

### Note on inline rendering

markdown-it renders inline tokens by iterating `token.children` on `inline` block tokens. Our `plugin_inline` token type needs a renderer entry in `md.renderer.rules['plugin_inline']`, which receives `(tokens, idx, options, env, self)`.

### Verification

Create `tests/inline-dispatcher.test.ts`:

| Input | Expected output |
|---|---|
| `'Text {{unknown}} here'` | `<p>Text {{unknown}} here</p>` |
| `` 'Text `{{unknown}}` here' `` | `{{unknown}}` inside `<code>`, not parsed |
| `'\\{{unknown}} text'` | `<p>{{unknown}} text</p>` (backslash stripped) |
| `'Text {{unknown body content}} end'` | literal `{{unknown body content}}` in `<p>` |

**Done when**: all four inline cases pass.

---

## Phase 5 — Test Plugins (`test-block`, `test-inline`)

**Goal**: The first real plugins are implemented. Their sole purpose is to prove every dispatcher edge case works end-to-end.

### Files to create

- `src/plugins/test.ts`

### Implementation steps

1. Register `test-block` as a block plugin:
   ```typescript
   render: (_args, _body, _env) => '<div class="test-block">TestPluginBlock</div>\n'
   ```
2. Register `test-inline` as an inline plugin:
   ```typescript
   render: (_args, _body, _env) => '<span class="test-inline">TestPluginInline</span>'
   ```
3. Import and register both in `src/index.ts`

### Verification

Create `tests/test-plugin.test.ts`. This is the most thorough test file — every case from `LogicOverview.md § 9.1` plus systematic nesting coverage.

**Block plugin cases**

| Input | Expected output |
|---|---|
| `'{{test-block}}'` | `<div class="test-block">TestPluginBlock</div>` |
| `'{{test-block some content}}'` | same (body ignored by test plugin) |
| `'{{test-block\nsome\ncontent\n}}'` | multiline body, still block output |
| Preceded by paragraph (no blank line): `'text\n{{test-block}}'` | both produce output; block rule interrupts via `alt` |
| Two consecutive (no blank lines): `'{{test-block}}\n{{test-block}}'` | two block divs, both rendered |

**Inline plugin cases**

| Input | Expected output |
|---|---|
| `'Text {{test-inline}} here'` | `<p>Text <span class="test-inline">TestPluginInline</span> here</p>` |
| `'{{test-inline }}'` (trailing space before `}}`) | inline span rendered |
| Multiple inline in one paragraph: `'A {{test-inline}} and {{test-inline}} B'` | two spans |

**Nesting — inline plugins** (inline dispatcher fires in all of these contexts automatically)

| Input | Expected |
|---|---|
| `'# Heading {{test-inline}}'` | `<h1>` containing the inline span |
| `'> Quote {{test-inline}} text'` | inline span inside blockquote paragraph |
| `'- List item {{test-inline}}'` | inline span inside `<li>` |
| `'**bold {{test-inline}} bold**'` | inline span inside `<strong>` |
| `'*italic {{test-inline}} text*'` | inline span inside `<em>` |
| `'\| {{test-inline}} \| cell \|'` (table cell) | inline span inside `<td>` |
| `'[link {{test-inline}} text](url)'` | inline span inside link text |

**Nesting — block plugins** (requires correct `alt` option; verify each container type)

| Input | Expected |
|---|---|
| `'> {{test-block}}'` | `<blockquote>` containing the block div |
| `'- {{test-block}}'` (list item) | `<li>` containing the block div |
| `'  - {{test-block}}'` (nested list, indented) | nested `<li>` containing the block div |
| `'::: warning\n{{test-block}}\n:::'` (custom container) | container div containing the block div |
| Block plugin NOT inside heading: `'# {{test-block}}'` | `{{test-block}}` literal in heading, NOT parsed as block plugin |
| Block plugin NOT in table cell: `'\| {{test-block}} \|'` | literal text in cell, NOT parsed as block plugin |

**Escape cases**

| Input | Expected output |
|---|---|
| `'\\{{test-block}}'` on its own line | `<p>{{test-block}}</p>` — no plugin fired |
| `'\\{{test-inline}}'` inline | `{{test-inline}}` literal text in paragraph |

**Negative cases** (should NOT trigger plugins)

| Input | Expected output |
|---|---|
| `'{{test-block'` (unclosed `}}`) | literal text, not parsed |
| `'{{test-blockXYZ}}'` (unknown name) | literal text |
| Fenced code: `'\`\`\`\n{{test-block}}\n\`\`\`'` | `{{test-block}}` as code text |
| Inline code: `` '`{{test-inline}}`' `` | `{{test-inline}}` as code span |

**Done when**: all 27 cases pass. This phase is the critical validation gate — if nesting cases pass, the `alt` option is correctly configured and both dispatchers work in all contexts.

---

## Phase 6 — Emoji and Space Plugins

**Goal**: Two simple inline plugins with no `[args]` slot. Validates the standard `body`-only path.

### Files to create

- `src/plugins/emoji.ts`
- `src/plugins/space.ts`

### Dependencies

```
npm install node-emoji
```

### Implementation

**emoji**: `render(_args, body, _env)` — look up `body.trim()` in `node-emoji`. Return the Unicode emoji string if found. If not found, return the original `{{emoji NAME}}` literal unchanged (do not throw).

**space**: `render(_args, body, _env)` — parse `body.trim()` as a float N. Return `<span style="display:inline-block;width:${N}rem"></span>`. If N is not a valid positive number, return empty string.

### Verification

Create `tests/emoji.test.ts` and `tests/space.test.ts`:

| Plugin | Input | Expected output contains |
|---|---|---|
| emoji | `'{{emoji smile}}'` | `😊` or equivalent Unicode smile |
| emoji | `'{{em grinning}}'` (alias) | grinning face emoji |
| emoji | `'{{emoji nonexistent}}'` | literal `{{emoji nonexistent}}` |
| space | `'{{space 1}}'` | `width:1rem` |
| space | `'{{space 2.5}}'` | `width:2.5rem` |
| space | `'{{space 0}}'` | empty string or no output |
| space | `'{{space abc}}'` | empty string |

**Done when**: all seven cases pass.

---

## Phase 7 — Span Plugin

**Goal**: The first plugin using the `[args]` slot. Also the first to call `md.renderInline()` on the body.

### Files to create

- `src/plugins/span.ts`

### Implementation

`render(args, body, env)`:
- If `args` is null or empty: return the body wrapped in `<span>` with no class (or log a warning)
- Call `md.renderInline(body ?? '')` to produce rendered inner HTML
- Return `<span class="${args}">${renderedBody}</span>`

The renderer closure must capture the `md` instance. Pass `md` as a parameter when registering the plugin, or inject it via a factory function.

### Verification

Create `tests/span.test.ts`:

| Input | Expected output |
|---|---|
| `'{{span[red] Hello}}'` | `<span class="red">Hello</span>` |
| `'{{sp[blue] Hello}}'` (alias) | `<span class="blue">Hello</span>` |
| `'{{span[red] **bold** text}}'` | `<span class="red"><strong>bold</strong> text</span>` |
| `'{{span[red] *italic* and \`code\`}}'` | span containing `<em>` and `<code>` |
| `'{{span[my-class] text}}'` (hyphenated class) | `class="my-class"` |
| `'Some text {{span[red] word}} more'` | inline span inside `<p>` |

**Done when**: all six cases pass.

---

## Phase 8 — YouTube Plugin

**Goal**: First block plugin with a single identifier as body. Validates block rendering with inline-level body (no multiline needed).

### Files to create

- `src/plugins/youtube.ts`

### Implementation

`render(_args, body, _env)`:
- `body` is the video ID
- Return:
  ```html
  <div class="youtube-embed">
    <iframe src="https://www.youtube.com/embed/VIDEO_ID"
      frameborder="0" allowfullscreen></iframe>
  </div>
  ```
- If body is empty or null, return empty string

### Verification

Create `tests/youtube.test.ts`:

| Input | Expected output contains |
|---|---|
| `'{{youtube dQw4w9WgXcQ}}'` | `youtube.com/embed/dQw4w9WgXcQ` |
| `'{{yt dQw4w9WgXcQ}}'` (alias) | `youtube.com/embed/dQw4w9WgXcQ` |
| `'{{youtube}}'` (no body) | empty or no iframe |
| Surrounded by paragraphs: `'text\n\n{{youtube abc}}\n\ntext'` | iframe between two `<p>` elements |
| No blank line before: `'text\n{{youtube abc}}'` | block rule still fires (alt option) |

**Done when**: all five cases pass.

---

## Phase 9 — QR Code Plugin

**Goal**: Inline plugin that calls a Node.js library and outputs SVG. Validates async-free backend rendering.

### Dependencies

```
npm install qrcode
npm install --save-dev @types/qrcode
```

### Files to create

- `src/plugins/qrcode.ts`

### Implementation

`qrcode` npm package has a `toString()` method that generates SVG synchronously via the `type: 'svg'` option:
```typescript
import QRCode from 'qrcode';
const svg = await QRCode.toString(body, { type: 'svg' });
```

However, `toString()` is async. Use the synchronous `create()` API and build SVG manually, or use `toFileSync()` — check the qrcode package for a sync SVG path. If no sync path exists, use `execSync` with a small script or use the `qrcode-svg` package instead (pure sync).

**Alternative**: use `npm install qrcode-svg` which is synchronous.

`render(_args, body, _env)`:
- Generate inline SVG for `body` string
- Wrap in `<span class="qrcode">SVG</span>` for inline embedding

### Verification

Create `tests/qrcode.test.ts`:

| Input | Expected output |
|---|---|
| `'{{qr https://example.com}}'` | contains `<svg` |
| `'{{qrcode text}}'` (full name) | contains `<svg` |
| Inline in paragraph: `'Scan {{qr https://example.com}} this'` | `<p>` containing SVG span |
| `'{{qr}}'` (empty body) | empty string or no SVG |

**Done when**: all four cases pass and SVG output is valid (no malformed XML).

---

## Phase 10 — Mermaid Plugin

**Goal**: Block plugin with multiline body that emits a frontend placeholder. Validates multiline block body parsing.

### Files to create

- `src/plugins/mermaid.ts`

### Implementation

`render(_args, body, _env)`:
- HTML-escape the body content to prevent XSS when embedding in div
- Return `<div class="mermaid">${escapedBody}</div>\n`

### Verification

Create `tests/mermaid.test.ts`:

| Input | Expected output |
|---|---|
| `'{{mermaid\ngraph LR\nA --> B\n}}'` | `<div class="mermaid">graph LR\nA --> B</div>` |
| `'{{mm\nsequence\n}}'` (alias) | `<div class="mermaid">` |
| `'{{mermaid graph LR}}'` (single-line) | `<div class="mermaid">graph LR</div>` |
| `'{{mermaid <script>evil</script>}}'` | HTML-escaped output, no raw `<script>` in body |

**Done when**: all four cases pass.

---

## Phase 11 — SMILES Plugin

**Goal**: Block plugin producing a frontend placeholder with raw SMILES string in a data attribute.

### Files to create

- `src/plugins/smiles.ts`

### Implementation

`render(_args, body, _env)`:
- HTML-escape the SMILES string for safe attribute embedding
- Return `<div class="smiles-render" data-smiles="${escaped}"></div>\n`

### Verification

Create `tests/smiles.test.ts`:

| Input | Expected output |
|---|---|
| `'{{smiles C1=CC=CC=C1}}'` | `data-smiles="C1=CC=CC=C1"` |
| `'{{sm C1=CC=CC=C1}}'` (alias) | same |
| SMILES with special chars: `'{{smiles C[C@@H](N)C(=O)O}}'` | data attribute HTML-escaped correctly |

**Done when**: all three cases pass and data attribute value is safe to embed in HTML.

---

## Phase 12 — YAML Plugin

**Goal**: Block plugin producing an invisible `<script>` element. Validates verbatim content preservation.

### Files to create

- `src/plugins/yaml.ts`

### Implementation

`render(_args, body, _env)`:
- Return `<script type="application/yaml">\n${body}\n</script>\n`
- Do NOT HTML-escape the body — YAML inside a script tag does not need escaping for display (the browser will not render it)
- However, ensure `</script>` does not appear in the body (which would break the HTML). Sanitize by replacing `</script>` with `<\\/script>` if present

### Verification

Create `tests/yaml.test.ts`:

| Input | Expected output |
|---|---|
| `'{{yaml\nkey: value\n}}'` | `<script type="application/yaml">` contains `key: value` |
| `'{{yml\nkey: value\n}}'` (alias) | same |
| Body with multiple keys | all keys preserved verbatim |
| YAML body containing `</script>` string | escaped to prevent early tag close |

**Done when**: all four cases pass.

---

## Phase 13 — TOC Plugin (Core Rule)

**Goal**: Two-pass implementation. Most complex plugin — requires a core rule that runs after all parsing.

### Dependencies

`markdown-it-anchor` already installed in Phase 1.

### Files to create

- `src/plugins/toc.ts`

### Implementation steps

1. The `plugin_block` token for `toc` is emitted by the block dispatcher as normal. Its renderer returns an empty placeholder: `<!-- TOC_PLACEHOLDER -->` (this is replaced by the core rule — the renderer itself cannot do it because it renders after the core rules have already run... actually, the renderer runs AFTER the core rules, so the core rule can replace the token's content directly).

   Correction: markdown-it's pipeline is: block parse → inline parse → core rules → render. So core rules CAN modify the token's content field, and the renderer will then receive the updated content.

   Approach:
   a. Renderer for `plugin_block` where `info === 'toc'` simply outputs `token.content` as raw HTML (don't escape it — the core rule will place pre-built HTML there)
   b. The core rule runs after all parsing, sets `env.tocHeadings`, then sets `token.content` on each `toc` token

2. Core rule implementation:
   ```
   function tocCoreRule(state):
     headings = []
     tocTokenIndices = []

     for i, token in state.tokens:
       if token.type == 'heading_open':
         level = parseInt(token.tag[1])  // h1 -> 1, h2 -> 2
         // next token is 'inline', get text from its children
         text = state.tokens[i+1].children
                  .filter(t => t.type == 'text' || t.type == 'code_inline')
                  .map(t => t.content).join('')
         anchor = token.attrGet('id')   // set by markdown-it-anchor
         headings.push({ level, text, anchor })

       if token.type == 'plugin_block' and token.info == 'toc':
         tocTokenIndices.push(i)

     env.tocHeadings = headings

     for i in tocTokenIndices:
       token = state.tokens[i]
       range = parseRange(token.content)  // e.g. "1,3" -> [1, 3]
       filtered = headings.filter(h => h.level >= range[0] && h.level <= range[1])
       token.content = buildTocHTML(filtered)
   ```

3. `parseRange(body)`: if body is null or empty, return `[1, 3]`. Otherwise split on `,` and parse two integers.

4. `buildTocHTML(headings)`: generate nested `<ul>` / `<li>` / `<a href="#anchor">text</a>` structure.

5. Register the core rule: `md.core.ruler.push('toc_resolve', tocCoreRule)`

### Verification

Create `tests/toc.test.ts`:

| Input | Expected output |
|---|---|
| `'{{toc}}\n\n# H1\n\n## H2\n\n### H3'` | TOC contains links to h1, h2, h3 |
| `'{{toc 2,3}}\n\n# H1\n\n## H2'` | TOC contains h2 only (h1 outside range) |
| `'# H1\n\n{{toc}}\n\n## H2'` | TOC placed mid-document still links to all headings |
| `'{{toc}}'` (no headings in document) | empty TOC or empty `<ul>` |
| Two `{{toc}}` in same document | both are populated |
| TOC links: `'{{toc}}\n\n## My Section'` | link `href` matches the `id` set by markdown-it-anchor |

**Done when**: all six cases pass and links correctly resolve to anchor IDs generated by `markdown-it-anchor`.

---

## Phase 14 — Attrs Plugin (Core Rule)

**Goal**: Inline plugin using the `[args]` slot that patches the preceding block token via a core rule.

### Files to create

- `src/plugins/attrs.ts`

### Implementation steps

1. The inline dispatcher emits a `plugin_inline` token with `info === 'attrs'` and `meta.args` containing the raw attribute string (e.g., `class="foo" id="bar"`).

2. Core rule `attrsResolve` runs after all parsing:
   ```
   function attrsResolve(state):
     for i, blockToken in state.tokens:
       if blockToken.type != 'inline': continue
       children = blockToken.children

       for j, child in children:
         if child.type != 'plugin_inline': continue
         if child.info != 'attrs': continue

         attrString = child.meta.args
         if not attrString: continue

         // Find the preceding block-level open token
         targetToken = state.tokens[i - 1]  // e.g. 'paragraph_open', 'heading_open'
         if targetToken is an open token:
           parseAndApply(attrString, targetToken)

         // Remove the attrs child token from children
         children.splice(j, 1)
   ```

3. `parseAndApply(attrString, token)`: parse `class="foo" id="bar" .myclass #myid` format (same as `markdown-it-attrs` format) and call `token.attrSet(key, value)`. Use the same attribute parser as `markdown-it-attrs` (copy or import).

4. Register: `md.core.ruler.push('attrs_resolve', attrsResolve)`

### Verification

Create `tests/attrs.test.ts`:

| Input | Expected output |
|---|---|
| `'## Heading {{attrs[id="my-id"]}}'` | `<h2 id="my-id">` |
| `'paragraph text {{attrs[class="highlight"]}}'` | `<p class="highlight">` |
| `'## Heading {{attrs[class="a" id="b"]}}'` | both `class` and `id` set |
| `'{{attrs[class="x"]}}'` with nothing before it | graceful no-op (no crash) |
| `'text {{attrs[data-foo="bar"]}}'` | `data-foo="bar"` applied to paragraph |

**Done when**: all five cases pass and no existing `id` attributes set by `markdown-it-anchor` on headings are overwritten without intent.

---

## Phase 15 — Markdown Include Plugin

**Goal**: Block plugin that embeds external markdown. Two paths: local file (sync) and URL (async pre-fetch).

### Files to create

- `src/plugins/markdown-include.ts`
- `src/prepare-sources.ts` (async pre-processing utility)

### Implementation steps

**Part A: Local file includes (sync)**

1. `render(_args, body, _env)`:
   - If `env.markdownIncludeActive` is true: return empty string (no nested includes)
   - `body` is the file path (relative to a base dir configured at init time, or absolute)
   - Read file with `fs.readFileSync(resolvedPath, 'utf8')`
   - Set `env.markdownIncludeActive = true`
   - Call `md.render(fileContent, env)` on the included content
   - Restore `env.markdownIncludeActive = false` (use try/finally)
   - Return the rendered HTML

2. Make the base directory configurable as an option at `md` instantiation time. Store it in options or via closure.

**Part B: URL includes (async pre-fetch)**

1. In `src/prepare-sources.ts`, export:
   ```typescript
   async function prepareSources(src: string): Promise<string>
   ```
   - Scan for `{{(?:markdown|md)\s+(https?://[^\s}]+)` patterns using regex
   - For each URL found, `fetch(url)` and get the response text
   - Replace `{{markdown URL}}` with the fetched markdown content in the source string
   - Return the modified source

2. Document that users must call `prepareSources(src)` before `md.render(src)` for URL includes

### Verification

Create `tests/markdown-include.test.ts`:

Set up temporary fixture files in `tests/fixtures/`:
- `simple.md`: contains `# Included` and one paragraph
- `with-math.md`: contains a KaTeX equation
- `tries-to-include.md`: contains `{{markdown other.md}}` (second level include attempt)

| Test | Input | Expected |
|---|---|---|
| Local include | `'{{markdown tests/fixtures/simple.md}}'` | renders content of simple.md |
| Alias | `'{{md tests/fixtures/simple.md}}'` | same |
| Math in included file | `'{{markdown tests/fixtures/with-math.md}}'` | KaTeX output present |
| Second level ignored | `'{{markdown tests/fixtures/tries-to-include.md}}'` | inner `{{markdown}}` not executed |
| File not found | `'{{markdown nonexistent.md}}'` | returns empty string or error comment, no crash |
| URL include (after prepareSources) | mock fetch, check substitution | content of URL rendered |

**Done when**: all six cases pass; second-level include is provably silently ignored.

---

## Phase 16 — Integration & Edge Case Testing

**Goal**: All plugins work simultaneously with no conflicts. Complex real-world document renders correctly.

### Create `tests/integration.test.ts`

Test a single complex markdown document that uses every plugin at once. Verify output contains expected substrings for each part. Key cases to check:

**Conflict detection**

| Check | Method |
|---|---|
| Official plugins still work when custom rules active | Re-run Phase 1 tests with full plugin stack |
| KaTeX `$...$` not accidentally consumed by inline dispatcher | `'$E=mc^2$'` still renders as math |
| Footnotes not broken | `'text[^1]\n\n[^1]: note'` still works |
| Container `:::` not broken | `'::: warning\ncontent\n:::'` still works |
| markdown-it-anchor still sets `id` on headings | `'# Test'` still has `id="test"` |

**Nesting — inline plugins in all containers**

Each visible inline plugin should pass in every inline context. The table below is the verification matrix. A ✓ means the plugin output appears correctly inside that container.

| Plugin | Paragraph | Heading | Blockquote | List item | Table cell | Bold/Italic | Link text |
|---|---|---|---|---|---|---|---|
| `span` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `emoji` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `space` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `qrcode` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

For each cell: test exactly one representative input. Example: `'| {{emoji smile}} |'` for emoji in table cell.

**Nesting — block plugins in all containers**

| Plugin | Standalone | Blockquote | List item | Nested list | Custom container (`:::`) |
|---|---|---|---|---|---|
| `youtube` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `mermaid` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `smiles` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `toc` | ✓ | — (unusual, skip) | — (unusual, skip) | — | — |
| `yaml` | ✓ | — (skip) | — (skip) | — | — |

**Nesting — inline content inside block plugin bodies**

Some block plugins accept body content that may itself contain inline markdown:

| Input | Expected |
|---|---|
| `'{{mermaid\ngraph LR\nA --> B\n}}'` | body preserved verbatim; `-->` not parsed as markdown |
| `'{{yaml\nkey: **value**\n}}'` | body preserved verbatim; `**` not parsed as bold |
| `'{{smiles C[C@@H](N)C(=O)O}}'` | SMILES with special chars preserved exactly in data attribute |

**Nesting — mixed inline and block, consecutive**

| Input | Expected |
|---|---|
| `'{{test-block}}\n{{youtube abc}}'` (two block plugins, no blank line) | both rendered as separate block elements |
| `'{{span[red] A}} and {{emoji smile}} in one line'` | both inline plugins in same paragraph |
| `'> {{span[blue] text}}\n> {{test-block}}'` | inline span in blockquote paragraph; block plugin in same blockquote |

**The `[args]` parser edge cases**

| Input | Expected |
|---|---|
| `{{span[red]text}}` (no space between `]` and body) | body is `"text"` |
| `{{span[red with spaces] text}}` | args is `"red with spaces"` |
| `{{unknown[args]}}` (unregistered plugin) | literal text |
| `{{span[]}}` (empty args) | graceful handling |

**Done when**: all conflict detection, nesting matrix, and edge case tests pass without modification to earlier code. The nesting matrix alone covers 28 cells (4 inline plugins × 7 container types) plus 5 block plugin standalone/container combinations for `youtube`, `mermaid`, and `smiles`.

---

## Phase 17 — Package Publishing Setup

**Goal**: The package can be installed locally with `npm install` and used as `require('your-package-name')`.

### Implementation steps

1. Complete `package.json`:
   ```json
   {
     "name": "your-package-name",
     "version": "0.1.0",
     "main": "dist/index.js",
     "types": "dist/index.d.ts",
     "exports": { ".": "./dist/index.js" },
     "files": ["dist"],
     "scripts": {
       "build": "tsc",
       "test": "vitest run",
       "prepublishOnly": "npm run build && npm run test"
     }
   }
   ```

2. Verify `tsconfig.json` `outDir` is `"dist"` and `declaration: true` is set

3. Build: `npm run build` — verify `dist/` directory is created with `.js` and `.d.ts` files

4. Local install test:
   ```
   cd /tmp && mkdir test-install && cd test-install
   npm init -y
   npm install /path/to/your/package
   ```
   Create `test.js`:
   ```javascript
   const md = require('your-package-name');
   console.log(md.render('# Hello {{test-block}}'));
   ```
   Run `node test.js` — verify output

5. Verify the `prepareSources` utility is also exported for URL include use

### Verification

| Check | Pass condition |
|---|---|
| `npm run build` exits 0, `dist/` populated | yes |
| `npm run test` exits 0 | yes |
| Local install works without `src/` directory | `require` succeeds |
| TypeScript types are available (`index.d.ts` exists) | yes |
| `md.render('{{test-block}}')` in the installed package | renders `TestPluginBlock` div |

**Done when**: all five package checks pass.

---

## Phase Dependency Map

```
Phase 0 (setup)
  └─ Phase 1 (official plugins)
       └─ Phase 2 (registry)
            ├─ Phase 3 (block dispatcher)
            │    └─ Phase 4 (inline dispatcher)
            │         └─ Phase 5 (test plugins) ← critical validation gate
            │              ├─ Phase 6 (emoji, space)
            │              ├─ Phase 7 (span)
            │              ├─ Phase 8 (youtube)
            │              ├─ Phase 9 (qrcode)
            │              ├─ Phase 10 (mermaid)
            │              ├─ Phase 11 (smiles)
            │              ├─ Phase 12 (yaml)
            │              ├─ Phase 13 (toc) ← depends on Phase 1 (anchor)
            │              ├─ Phase 14 (attrs)
            │              └─ Phase 15 (markdown-include)
            │                   └─ Phase 16 (integration)
            │                        └─ Phase 17 (package)
```

Phases 6–15 are independent of each other and can be implemented in any order after Phase 5.
