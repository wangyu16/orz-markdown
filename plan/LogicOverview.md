# Logic Overview: Customized markdown-it Parser

## 1. Project Structure

```
src/
  index.ts              # Entry point: assembles core + all plugins
  registry.ts           # Plugin registry (maps names/aliases to handlers)
  rules/
    block-dispatcher.ts # Block-phase rule for {{BlockPlugin ...}}
    inline-dispatcher.ts# Inline-phase rule for {{InlinePlugin ...}}
  plugins/
    test.ts             # Test plugin (block and inline variants)
    span.ts
    emoji.ts
    space.ts
    markdown-include.ts
    youtube.ts
    toc.ts
    qrcode.ts
    smiles.ts
    mermaid.ts
    yaml.ts
    attrs.ts
plan/
  Goal.md
  LogicOverview.md
```

---

## 2. The Generalized `{{...}}` Syntax

### 2.1 Syntax Specification

```
{{name}}
{{name body}}
{{name[args]}}
{{name[args] body}}
{{name
multiline body
}}
```

Every call has three components:

| Component | Rule |
|---|---|
| **name** | Required. Alphanumeric characters and hyphens. Terminated by `[`, whitespace, or `}}`. Case-sensitive. |
| **args** | Optional. The `[...]` block immediately after the name (no whitespace between name and `[`). Used for a primary typed parameter distinct from the body. |
| **body** | Optional. Everything after `]` (or after the name if no args), whitespace-trimmed. Can span multiple lines for block plugins. |

Examples:

```
{{toc}}                         → name="toc",    args=null,          body=null
{{toc 1,3}}                     → name="toc",    args=null,          body="1,3"
{{youtube abc123}}              → name="youtube", args=null,          body="abc123"
{{span[red] Text in red.}}      → name="span",   args="red",         body="Text in red."
{{attrs[class="foo" id="bar"]}} → name="attrs",  args=`class="foo"…`,body=null
{{mermaid
graph LR
A --> B
}}                              → name="mermaid", args=null,         body="graph LR\nA --> B"
```

- Content runs until the first `}}`.
- Aliases are supported (e.g., `span` and `sp` point to the same handler).
- Plugin names use alphanumeric characters and hyphens only — no colons (e.g., `test-block`, not `test:block`).
- `\{{name ...}}` escapes the construct: the standard markdown backslash-escape mechanism handles this automatically (see Section 6.2).

### 2.2 Invalid Plugin Names

If `{{` is followed by a string that is **not** a registered plugin name (and is not escaped), the parser does nothing — the text is left for the next rule and will render as literal characters.

### 2.3 Code Block Immunity

markdown-it's `fence` and `code_block` block rules run at high priority and mark their content as consumed. Our block dispatcher must be assigned a **lower priority** than fence/code_block so that `{{...}}` inside fenced code blocks is never seen by our rule. Similarly, the inline dispatcher respects backtick code spans because markdown-it's inline `backtick` rule produces a code token; our inline rule only runs on the remaining non-code positions.

### 2.4 Nesting in Other Markdown Elements

All plugins that produce **visible output** are designed to nest freely inside other markdown elements. How this works depends on plugin type:

**Inline plugins** — nest automatically. markdown-it runs the inline parser on the content of every container that has inline content: paragraphs, headings, list items, blockquote text, table cells, inside bold/italic/etc. The inline dispatcher fires in all of these contexts with no extra configuration.

```
> Quote with {{span[red] red text}} inside.
| cell | {{emoji smile}} |
## Heading with {{span[bold] styled}} title
```

**Block plugins** — nest inside blockquotes, list items, and custom containers (via `markdown-it-container`). This is enabled by including `'blockquote'` and `'list'` in the `alt` array when registering the block dispatcher (see Section 5.2). markdown-it's blockquote and list rules call the block parser recursively on their inner content, and the `alt` array tells markdown-it which rules are available in those sub-contexts.

```
> {{youtube abc123}}        ← youtube inside a blockquote ✓
- {{mermaid\ngraph\n}}     ← mermaid inside a list item ✓
::: warning
{{smiles C1=CC=CC=C1}}     ← smiles inside a container ✓
:::
```

**What block plugins cannot nest inside**: headings, table cells, or mid-sentence — those are inline contexts where block rules never fire. This is the correct behavior; block-level output (iframes, diagrams) has no place inside a heading or a table cell.

**Invisible plugins** (yaml, attrs) follow the same technical rules but nesting is less semantically relevant for them.

---

## 3. markdown-it Parsing Architecture

markdown-it processes a document in two phases:

1. **Block phase**: Rules scan line-by-line, segmenting the document into block tokens (paragraphs, headings, fences, blockquotes, etc.). Block rules can consume multiple lines.
2. **Inline phase**: Block tokens that contain inline content (e.g., paragraphs) are further parsed by inline rules.

This has critical implications for our dispatcher design.

---

## 4. Plugin Classification: Block vs Inline

Every plugin is statically declared as either **block** or **inline** at registration time. The registry stores this classification. The two dispatchers query the same registry:

- **Block dispatcher** (block phase rule): handles block-classified plugins
- **Inline dispatcher** (inline phase rule): handles inline-classified plugins

| Plugin | Type | Reason |
|---|---|---|
| `test-block` | block | produces block element |
| `test-inline` | inline | produces inline element |
| `span` / `sp` | inline | produces `<span>` |
| `emoji` / `em` | inline | produces emoji character |
| `space` | inline | produces whitespace |
| `markdown` / `md` | block | embeds a full document |
| `youtube` / `yt` | block | produces block `<iframe>` |
| `toc` | block | produces block navigation list |
| `qrcode` / `qr` | inline | produces inline image |
| `smiles` / `sm` | block | produces block chemical structure |
| `mermaid` / `mm` | block | produces block diagram |
| `yaml` / `yml` | block | produces invisible `<script>` element |
| `attrs` | inline | modifies preceding token |

---

## 5. Block Dispatcher Design

### 5.1 Registration Position

The block dispatcher must be registered to run **before `paragraph`** but **after `fence` and `code`**. In markdown-it's block ruler, built-in rules execute in this order (highest to lowest priority):

```
table (120) → code/fence (100) → blockquote (95) → hr/list/heading (95/90) → paragraph (70)
```

Register the rule after `blockquote`:

```javascript
md.block.ruler.after('blockquote', 'plugin_block_dispatcher', blockDispatcher, { ... });
```

This places it before `paragraph` (priority 70), which is the critical requirement: the dispatcher must fire before the paragraph rule absorbs the line.

### 5.2 The `alt` Option and Paragraph Interruption

When registering the block rule, the `alt` array must include `'paragraph'`:

```javascript
md.block.ruler.after('blockquote', 'plugin_block_dispatcher', blockDispatcher, {
    alt: ['paragraph', 'reference', 'blockquote', 'list']
});
```

This is what allows the block rule to interrupt a paragraph. Without it, a line like:

```
{{youtube dQw4w9WgXcQ}}
```

that is not preceded by a blank line would be absorbed into the surrounding paragraph before the block rule could fire. The `alt` option explicitly tells markdown-it's block parser that this rule is allowed to fire mid-paragraph.

### 5.3 Single-Line vs Multiline Block Syntax

A block plugin written on a single line (e.g., `{{youtube dQw4w9WgXcQ}}`) is handled by the same block rule as the multiline form. The rule checks whether the closing `}}` appears on the first line (compact form) or requires scanning forward across multiple lines. This directly mirrors the KaTeX block rule: `math_block` checks `firstLine.trim().slice(-2) === '$$'` for the single-line case, then falls through to line-by-line scanning for the multiline case.

**Important clarification**: "single-line" means the entire `{{PluginName content}}` fits on one source line. It does not mean a block plugin can be embedded mid-paragraph (`Some text {{youtube id}} more text`). A block plugin must always appear at the start of a line (after indentation). A `{{youtube id}}` in the middle of a sentence will not be matched by the block rule — just as `$$E=mc^2$$` in the middle of a sentence is not rendered as display math by the KaTeX block rule; it outputs `$$` literally. This is the correct behavior: block plugins belong on their own line.

### 5.4 Scanning Algorithm

```
function blockDispatcher(state, startLine, endLine, silent):
  if state.sCount[startLine] >= state.blkIndent + 4:
    return false  // indented code block, skip

  pos = state.bMarks[startLine] + state.tShift[startLine]
  src = state.src

  if src[pos] != '{' or src[pos+1] != '{':
    return false

  // Check for escape: \{{
  if pos > 0 and src[pos-1] == '\\':
    return false

  // Extract plugin name (hyphens/alphanums, up to '[', whitespace, or '}')
  nameStart = pos + 2
  nameEnd = scan forward while char is alphanumeric or '-'
  name = src[nameStart:nameEnd]

  if not registry.hasBlock(name):
    return false

  // Extract optional [args] — only if '[' immediately follows name (no space)
  args = null
  cursor = nameEnd
  if src[cursor] == '[':
    argsStart = cursor + 1
    argsEnd = src.indexOf(']', argsStart)
    if argsEnd == -1: return false  // unclosed [
    args = src[argsStart:argsEnd]
    cursor = argsEnd + 1

  // Skip whitespace before body
  while src[cursor] is whitespace and not newline: cursor++

  // Find closing '}}', scanning forward across lines if needed
  closingPos = scanForClosing(state, cursor, startLine, endLine)
  if closingPos == -1:
    return false  // unclosed — do not parse

  if silent:
    return true  // validation-only pass

  body = src[cursor:closingPos].trim()
  token = state.push('plugin_block', '', 0)
  token.info = name
  token.meta = { args: args }
  token.content = body
  token.map = [startLine, nextLine]
  state.line = nextLine
  return true
```

### 5.5 Unclosed `}}`

If no `}}` is found before the end of the block, the entire construct is left unparsed. The paragraph rule will then absorb the text literally. This is the safest failure mode.

---

## 6. Inline Dispatcher Design

### 6.1 Priority

The inline dispatcher should have a priority slightly lower than backtick (priority 100) but higher than default text (priority -100). A value of **90** works here as well.

### 6.2 Escape Handling

`{` is ASCII punctuation and is therefore in the CommonMark escapable character set. markdown-it's built-in `escape` inline rule handles `\{` automatically. Because the inline dispatcher is registered *after* the `escape` rule:

```javascript
md.inline.ruler.after('escape', 'plugin_inline_dispatcher', inlineDispatcher);
```

`\{{test-inline}}` is processed as follows:
1. The `escape` rule fires first, sees `\{`, emits a literal `{` token, and advances two characters.
2. The remaining input starts with `{test-inline}}` — a single `{`, not `{{`.
3. Our inline rule never matches; the rest renders as literal text.
4. Final output: `{{test-inline}}` — correct.

No special escape handling is needed in the inline dispatcher itself.

### 6.3 No Multiline Inline Content

Multiline content spanning block boundaries is ruled out for inline plugins. This is not a restriction — it is a correct reflection of how markdown-it works: inline rules operate only within the inline buffer of a single block token. A `{{span}}` or `{{emoji}}` that opens in one paragraph and closes in another is structurally incoherent. The inline dispatcher scans only within the current line's inline content, making it a simple forward scan with no multi-line lookahead needed.

---

## 7. Plugin Registry

```typescript
interface PluginDefinition {
  type: 'block' | 'inline';
  aliases: string[];           // canonical name is aliases[0]
  render: (args: string | null, body: string | null, env: object) => string;
}

const registry = new Map<string, PluginDefinition>();

function register(def: PluginDefinition): void {
  for (const alias of def.aliases) {
    registry.set(alias, def);
  }
}

function hasBlock(name: string): boolean { ... }
function hasInline(name: string): boolean { ... }
function getRenderer(name: string): PluginDefinition | undefined { ... }
```

The registry is populated at setup time in `index.ts` before any parsing occurs.

---

## 8. Token Design

Block token:
```
type: 'plugin_block'
info: 'youtube'              // plugin name
meta: { args: null }         // parsed [args] string, or null
content: 'dQw4w9WgXcQ'      // body (everything after name/[args], trimmed)
map: [lineStart, lineEnd]
```

Inline token:
```
type: 'plugin_inline'
info: 'span'
meta: { args: 'red' }        // parsed [args] string, or null
content: 'Text in red.'      // body
```

The renderer passes both slots to the plugin handler:

```javascript
md.renderer.rules['plugin_block'] = (tokens, idx, options, env) => {
  const token = tokens[idx];
  const def = registry.getRenderer(token.info);
  if (!def) return '';
  return def.render(token.meta.args, token.content, env);
};
```

Plugins that do not use `args` simply ignore the first parameter. Most plugins fall into this category — their entire input arrives via `body`.

---

## 9. Individual Plugin Concerns

### 9.1 Test Plugin (`test-block`, `test-inline`)

The test plugin validates all edge cases of the dispatcher:
- `{{test-block}}` — block element on single line
- `{{test-block some content}}` — block element with body
- `{{test-block\nmultiline\ncontent\n}}` — multiline block
- `{{test-inline}}` — inline element
- `{{test-inline }}` — trailing space before `}}`
- `\{{test-block}}` — escaped, renders as literal `{{test-block}}`
- Nesting inside blockquotes, lists, headings — works via normal markdown-it nesting

Output: literal text `TestPluginBlock` (as `<div>`) or `TestPluginInline` (as `<span>`).

### 9.2 Span (`span`, `sp`)

Syntax: `{{span[ClassName] body text}}` or alias `{{sp[ClassName] body text}}`.

- `args` = CSS class name (required).
- `body` = the span content.

The body **supports nested inline markdown** — bold, italic, code, etc. The renderer calls `md.renderInline(body)` on the body before wrapping it in the span element, so `{{span[red] **bold** text}}` produces `<span class="red"><strong>bold</strong> text</span>`. This requires the renderer to have access to the `md` instance via a closure.

Output: `<span class="ClassName">rendered body</span>`. Styling is entirely left to CSS — the parser only attaches the class name.

### 9.3 Emoji (`emoji`, `em`)

Straightforward: map the name string to a Unicode code point or use the `node-emoji` package. Inline, no nested markdown needed.

### 9.4 Space (`space`)

Syntax: `{{space N}}` where N is a positive number.

Emits `<span style="display:inline-block;width:Nrem"></span>`. Using `rem` units means the spacing scales with the document's root font size, consistent with the surrounding text.

### 9.5 External Markdown Include (`markdown`, `md`)

Syntax: `{{markdown path/to/file.md}}` or `{{md URL}}`.

**markdown-it is synchronous** — this constrains the implementation:

- **Local file paths**: read with `fs.readFileSync`. The included content is then parsed by the same `md` instance, so all plugins (math, span, mermaid, etc.) work inside the included file.
- **Remote URLs**: async fetching is incompatible with markdown-it's sync pipeline. A `prepareSources(src: string): Promise<string>` pre-processing step must scan for `{{md URL}}` patterns, fetch all URLs, and substitute their content before `md.render()` is called.

**No nested includes**: if the included markdown source itself contains `{{markdown ...}}` calls, they are silently ignored. The block dispatcher checks `env.markdownIncludeActive` and skips `{{markdown}}` tokens when the flag is set. This prevents infinite loops and keeps include depth at exactly 1.

### 9.6 YouTube (`youtube`, `yt`)

Content is a YouTube video ID. Emit an `<iframe>` with the standard YouTube embed URL. Straightforward backend rendering.

### 9.7 Table of Contents (`toc`)

Syntax: `{{toc}}` (default levels 1–3) or `{{toc 1,3}}` to specify the range explicitly.

**Two-pass problem**: headings are parsed in the same pass as the `{{toc}}` token, so the TOC cannot be rendered inline. Solution: a **core rule** defers rendering until after all parsing is complete:

1. Core rule traverses all tokens and collects headings into `env.tocHeadings`.
2. Core rule finds all `plugin_block` tokens where `info === 'toc'` and replaces their content with the generated TOC HTML.

**Anchor dependency**: TOC links require heading anchors. Add `markdown-it-anchor` to the official plugins list. The TOC plugin reads the same slug algorithm to generate matching `href` values.

Header level range: content `"1,3"` means h1–h3 inclusive (default). Content `"2,4"` means h2–h4.

### 9.8 QR Code (`qrcode`, `qr`)

Syntax: `{{qr content to encode}}`.

Use the `qrcode` npm package (works in Node.js). Output: **inline SVG** embedded directly in the HTML. No external requests, no file writes, works in any context.

### 9.9 SMILES / Chemical Structures (`smiles`, `sm`)

**Critical concern: smilesDrawer is a browser-only JS library.**

smilesDrawer renders to an HTML5 Canvas element and has no Node.js/server-side rendering path. Options:

1. **Frontend placeholder (recommended)**: Emit `<div class="smiles-render" data-smiles="SMILES_STRING"></div>`. Include smilesDrawer JS in the page template. A page-load script queries all `.smiles-render` elements and renders them.
2. **Backend SVG via headless browser**: Use Puppeteer to render smilesDrawer. Heavy dependency, slow.
3. **Alternative library**: Check if RDKit.js WebAssembly build can run in Node.js — possible but heavyweight.

**Recommendation**: Frontend placeholder approach. The parser's job ends at emitting a semantic div with the SMILES string as a data attribute.

### 9.10 Mermaid (`mermaid`, `mm`)

Same situation as SMILES: mermaid is a browser-only library.

**Recommendation**: Emit `<div class="mermaid">DIAGRAM_CONTENT</div>`. Include mermaid.js in the page template. This is the standard mermaid.js integration pattern.

Content between `{{mermaid` and `}}` is the raw diagram definition. Preserve indentation/whitespace.

### 9.11 YAML (`yaml`, `yml`)

Emit `<script type="application/yaml">CONTENT</script>` (invisible to browser rendering).

The parser makes no assumptions about downstream usage. The YAML string is preserved verbatim inside the script element. Post-render JavaScript or a build tool decides how to consume it.

### 9.12 Attrs (`attrs`)

The inline rule cannot reach the block token stream — it only sees the inline token array being built for the current paragraph. Patching the wrapping block element (e.g., a heading, a blockquote) requires access to the block-level token stream.

**Correct approach: core rule post-processing.**

The inline dispatcher emits a normal `plugin_inline` token with `info === 'attrs'` and the raw attribute string as content, like any other inline plugin. A core rule then runs after all parsing is complete and walks the full block token stream:

1. Find any `inline` token whose children contain a `plugin_inline` token with `info === 'attrs'`.
2. Identify the preceding block token (e.g., `heading_open`, `bullet_list_open`, etc.).
3. Parse the attribute string and call `token.attrSet(...)` on the preceding block token.
4. Remove the `plugin_inline` attrs token from the children array.

This is the same architecture used by `markdown-it-attrs`. Its source is the primary reference for this implementation.

---

## 10. Official Plugin Integration

All official plugins are added in `index.ts` before the custom rules are registered:

```javascript
md
  .use(require('markdown-it-anchor'))           // heading anchors (required by toc)
  .use(require('markdown-it-container'), 'name', options)
  .use(require('markdown-it-footnote'))
  .use(require('@traptitech/markdown-it-katex'), { enableMhchem: true })
  // ... etc
```

**KaTeX + mhchem**: requires `import 'katex/contrib/mhchem'` at the top of `index.ts` before any render call.

**markdown-it-anchor**: must be registered before the custom TOC plugin so that heading tokens carry `id` attributes by the time the TOC core rule runs.

**Conflict check**: None of the official plugins use `{{` syntax. Priority ordering should be verified by running the test plugins against all official plugins simultaneously.

---

## 11. Backend vs Frontend Rendering Decision

| Plugin | Backend | Frontend | Decision |
|---|---|---|---|
| span | yes | n/a | backend |
| emoji | yes | n/a | backend |
| space | yes | n/a | backend |
| markdown include | yes (sync files only) | pre-fetch for URLs | backend w/ pre-fetch |
| youtube | yes (iframe) | n/a | backend |
| toc | yes (core rule) | n/a | backend |
| qrcode | yes (qrcode npm) | n/a | backend |
| smiles | no native Node path | yes (smilesDrawer) | frontend placeholder |
| mermaid | no native Node path | yes (mermaid.js) | frontend placeholder |
| yaml | yes (script tag) | n/a | backend |
| attrs | yes | n/a | backend |

**Frontend placeholder pattern** (for smiles, mermaid): The parser emits a semantically marked-up element with raw content in a data attribute or element body. The page template includes the appropriate JS library. An init script runs on `DOMContentLoaded`. This keeps the parser synchronous and pure, and offloads rendering to the appropriate runtime.

---

## 12. Decisions Summary

All design decisions have been incorporated into the relevant sections above. For reference:

| Decision | Resolution |
|---|---|
| Escape `\{{` | Handled automatically by markdown-it's built-in escape rule. No special code needed. |
| Span body markdown | Supported. Renderer calls `md.renderInline(body)`. |
| Attrs mechanism | Follow `markdown-it-attrs` core-rule architecture; only the trigger syntax differs. |
| Markdown include depth | Maximum depth 1. Second-level `{{markdown}}` calls are silently ignored via `env.markdownIncludeActive`. |
| TOC anchor generation | Add `markdown-it-anchor` to official plugins. TOC core rule reads `id` attributes set by that plugin. |
| QR code output | Inline SVG. |
| Space unit | `rem` (scales with root font size). |
| Plugin name format | Alphanumeric + hyphens only. No colons. (`test-block`, `test-inline`.) |
| Arg/body syntax | `{{name[args] body}}`. `[args]` immediately after name (no space) holds the primary typed parameter; everything else is body. |
