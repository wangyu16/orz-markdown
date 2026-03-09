Goal: Create a customized markdown parser based on markdown-it. Include a few official plugins and design several customized plugins. Make it a standalone package that can be installed. 

Official plugins to be included:
- container
- footnote
- img-size
- katex with mhchem enabled
- mark
- sub
- sup
- ins
- tasklist

Customized plugins description
- Follow the design philosophy of markdown-it to make sure the added plugins will work smoothly. Follow the design method as the official plugins. Make sure no conflict, no issues with skiping and nesting, easy to add to or remove from the core. 
- Generalized syntax: `{{PluginName }}`
    - When nested in code blocks, do not parse, but show as plain text
    - Otherwise, whenever registered plugin name is detected in `{{PluginName`, the plugin rendering will be triggerred. The parser will look for the closing `}}` regardless it is in the same line or after a few lines, and treat everything in between as the content of the plugin. 
    - When invalid plugin name is detected, do nothing, just show the text as is. 
    - Use a test plugin to verify all possible situations that the plugin detection is correct. 
        - Use `{{test:block}}` and `test:inline` as the test plugin, and possible variations such as `{{test:inline }}`, `{{test:block some content }}`, or the content is a multiline text. Render all of these into plain text 'TestPluginBlock' as a block element and 'TestPluginInline' as an inline element. For `{{test:block}}`, even if it is embeded in a single line in the markdown source, add breaks in front and after it to make it a block element in the output. The same mechanism as block math: enven the equation $$E=mc^2$$ is written within a single line, it render to a block equation. 
        - Test `\{{test:block}}` and `\{{test:inline}}` for the skipping. It should be shown as is. 
        - Test nesting this plugin to other elements.
- List of planed plugins
    - span: render `{{span:ClassName Content}}` into `<span class="ClassName">Content</span>`. This can be used for colored text, badges, etc. The actual style will be defined in css. The parser only create the span element with class name. Alternative syntax `{{sp:ClassName Content }}`. Render into inline element. 
    - emoji: render `{{emoji smile}}` or `{{em smile}}` to corresponding emoji. Inline element. 
    - white space: render `{{space N}}`. Inline element. 
    - markdown: to include external markdown source and embed into current document as if it is native (no visible container) using `{{markdown URL}}` or ``{{md URL}}`. Block element. Same function as the official plugin include, but different syntax. 
    - youtube: use plugin name 'youtube' or 'yt' to embed youtube video by id. Block element. Same function as the official embed plugin, but different syntax, only for youtube but not for embedding other elements.
    - table of content: use `{{toc}}` to include all headers (h1 to h3 by default). Or the header levels can be specified as `{{toc 2,4}}`, `{{toc 1,6}}`, etc. Block element. 
    - qr code: use plugin name 'qrcode' or 'qr' to render content into an qr code image. Inline element. 
    - SMILES: use plugin name 'smiles' or 'sm' to render SMILES strings into chemical structures using https://github.com/reymond-group/smilesDrawer. Block element. 
    - mermaid: use plugin name 'mermaid' or 'mm' to render and display mermaid diagram. Block element. 
    - ymal: use plugin name 'yaml' or 'yml' to render yaml block into invisible script object. Invisible script object, the parser does not know how this object will be used for next step rendering. 
    - attrs: Same function as the official attrs plugin, but in a different syntax: `{{attrs }}`. Used to add attributes to the element immediately in front of it. 

Backend rendering vs frontend rendering
- Such as the SMILES to structure using smilesDrawer, it can be rendered in the backend to insert the resulting svg image to the html page; or can add the js source to the frontend page template and call smilesDrawer function within the page. Which is better? Which is easier? 
