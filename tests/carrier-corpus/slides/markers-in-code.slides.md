{{nyml
kind: document
format: 1
title: Writing orz-slides Decks — Markers in Code
author: Yu Wang
license: CC-BY-4.0
theme: architect
}}

<!-- slide -->
## How a deck is written

Every slide starts with a slide marker, shown here in a fence. The fence must
not start a new slide:

```markdown
<!-- slide 2col -->
## Results
<!-- @left -->
- Accuracy 92%
<!-- @right -->
<!-- @notes -->
Speaker notes go here.
```

<!-- slide -->
## The header, shown as an example

A format-1 header inside a code block is an example, never the document's
header. A token-based scanner skips it; a string search would not:

```markdown
{{nyml
kind: document
title: Not the title of this deck
theme: neon
}}

<!-- slide template=title -->
# Example deck
```

The retired preamble, for comparison:

~~~html
<!-- deck
title: Old deck
theme: paper
-->
<!-- slide -->
~~~

<!-- slide 2col -->
## Nested and indented code
<!-- @left -->
A four-backtick fence holding a three-backtick fence:

````markdown
```html
<!-- slide quad -->
<!-- @tl -->
```
<!-- slide main-side -->
````
<!-- @right -->
Indented code:

    <!-- slide -->
    <!-- @float left=10% top=10% w=20% h=20% -->

Inline code: `<!-- slide -->` and `<!-- @notes -->` in a sentence.

<!-- slide -->
## Markers inside multi-line directives

{{yaml
snippet: |
  <!-- slide 3col -->
  ## Three columns
  <!-- @left -->
  <!-- @mid -->
  <!-- @right -->
}}

{{mermaid
flowchart LR
  %% <!-- slide --> inside a Mermaid comment is not a marker
  A[Write markers] --> B[Assemble]
}}

{{nyml
kind: example
template: |
  <!-- slide template=closing -->
  <!-- @footer -->
  # Thanks
}}

<!-- @notes -->
This slide contains no real slide markers besides its own; the deck has exactly
five slides.

<!-- slide -->
## The last real slide

If the deck shows more than five slides, a marker inside code or inside a
directive was taken for a real one.
