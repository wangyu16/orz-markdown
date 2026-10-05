{{nyml
kind: document
format: 1
title: Embedding Snippets </script> Safely
author: Yu Wang
description: Text that tries to break out of a script island: </script> <!-- <script ]]>
license: MIT
}}

# Embedding snippets in HTML

This document is about the strings that break naive HTML embedding. A carrier
stores the text inside `<script type="text/markdown" id="orz-src">`, so every
one of these must survive assembly and extraction byte for byte.

Inline mentions: the closing tag </script> in running text, an opening <script>
tag, a comment opener <!-- that is never closed on this line, a CDATA end ]]>,
and uppercase variants </SCRIPT > and <ScRiPt src="x.js">.

Code spans: `</script>`, `<!--`, `<script>`, `]]>`, `</script >`, `<!-- -->`.

```html
<!doctype html>
<script>
  // a nested island inside the island
  const s = "</script><script>alert(1)</script>";
  /* <![CDATA[ */ var x = 1; /* ]]> */
</script>
<!-- an HTML comment in a code block -->
<style>p::after { content: "</style>"; }</style>
```

<script type="application/json" id="author-data">{"note": "a raw script block in the source", "end": "<\/script>"}</script>

<!-- A closed comment that hides this sentence from readers. -->

Escaped-looking text that must stay exactly as typed: &lt;/script&gt; and
\</script> and <\/script> and </scr\ipt>.

The sequence <!--<script> is the one that switches an HTML parser into the
"double-escaped" script state; it must not end the island either.

Final line has no trailing newline and ends with a closing tag </script>