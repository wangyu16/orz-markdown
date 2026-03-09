# VS Code Extension Plan: Orz Markdown Preview

## 1. Project Overview
**Goal:** Create a VS Code extension that leverages the `@orz-how/markdown-parser` to provide a rich, real-time Markdown preview experience inside VS Code, complete with custom plugins, embedded interactive objects, and dynamically selectable themes.

**Target Name:** `orz-markdown-vscode`

## 2. Feature Requirements
1. **Core Parsing:** Replace/Extend the default VS Code Markdown preview parser with `@orz-how/markdown-parser`.
2. **Dynamic Theming:** Provide a VS Code setting dropdown allowing users to select between the pre-built themes (`light-academic`, `light-playful`, `dark-elegant`, etc.).
3. **Live Refresh:** Instantly reload the Markdown preview when the user switches themes in the settings.
4. **Interactive Plugins:** Ensure client-side scripts (like `mermaid` and `smilesDrawer`) can execute gracefully within the restricted VS Code webview environment.

## 3. Implementation Steps

### Phase 1: Project Scaffolding
- Use `yo code` to scaffold a new TypeScript VS Code Extension.
- Install the newly created parser module directly from GitHub: 
  `npm install git+https://github.com/wangyu16/orz-markdown.git`
- Clean up default template files and set up the build pipeline (Webpack or esbuild is recommended for extensions).

### Phase 2: Extension Manifest (`package.json`)
Declare the necessary contribution points so VS Code knows this extension modifies the Markdown environment:
- **`markdown.markdownItPlugins`**: Set to `true` to hook into the `extendMarkdownIt` API.
- **`configuration`**: Define `orzMarkdown.theme` with a dropdown (`enum`) of all available CSS files from the parser's `/themes` folder.

### Phase 3: Extension Activation & State Management (`src/extension.ts`)
- Export an `activate(context)` function.
- Subscribe to workspace configuration changes `vscode.workspace.onDidChangeConfiguration`.
- If the `orzMarkdown.theme` setting changes, trigger `vscode.commands.executeCommand('markdown.api.reloadPlugins')` to force the preview window to redraw immediately.

### Phase 4: Parser Integration (`extendMarkdownIt`)
- Export the `extendMarkdownIt(md)` function required by VS Code.
- Pass the VS Code internal `md` object to your package's setup cycle to register the custom dispatchers (`blockDispatcher`, `inlineDispatcher`), rendering rules, and official plugins (like `katex`).
- **CSS Injection Strategy:** 
  - Wrap the `md.render` function.
  - On render, read the user's selected theme from `vscode.workspace.getConfiguration('orzMarkdown').get('theme')`.
  - Read the raw CSS file from `node_modules/@orz-how/markdown-parser/themes/...`.
  - Prepend the CSS string as an inline `<style>` block to the output HTML. This ensures it perfectly styles the preview window's `.markdown-body` container.

### Phase 5: Handling Webview Security (Client-Side Scripts)
VS Code markdown previews restrict external scripts by default. For plugins like `mermaid` and `smiles`:
- We must utilize visual contributions in `package.json` via `"markdown.previewScripts": ["./assets/init-scripts.js"]`.
- Ensure the extension bundles or properly links to the necessary CDN scripts so the preview can successfully execute `smilesDrawer` and `mermaid.initialize` once the DOM is rendered.

## 4. Testing & Publishing
1. **Testing:** Open the extension in the VS Code Extension Development Host (F5). Open a complex markdown file (with KaTeX, SMILES, Mermaid, NYML) and test the preview.
2. **Toggle Themes:** Open settings, change the theme, and verify the preview dynamically matches the new color scheme without manually restarting.
3. **Packaging:** Use `vsce package` to bundle the extension into a `.vsix` file.
4. **Deployment:** Create a Publisher profile on the VS Code Marketplace and run `vsce publish` to make the extension available globally.
