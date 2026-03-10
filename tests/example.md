# Markdown Elements Reference

{{toc}}

---

## 1. Standard Markdown

### Headings

# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

### Text Formatting

Regular paragraph text. Lorem ipsum dolor sit amet, consectetur adipiscing elit,
sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.

**Bold text**, *italic text*, ***bold and italic***, ~~strikethrough~~.

`Inline code` within a sentence.

A line with a hard break
(two trailing spaces before the line break).

### Links and Images

[External link](https://example.com) — [Link with title](https://example.com "Example title")

Auto-detected URL: https://example.com

![Image with size](https://cdn.britannica.com/34/240534-050-B8C4B11E/Porcupine-fish-Diodon-hystox.jpg =200x100)

### Blockquotes

> Single-level blockquote.

> Nested blockquote:
> > Inner level one.
> > > Inner level two.

### Lists

Unordered:

- Item one
- Item two
  - Nested A
  - Nested B
    - Deeper
- Item three

Ordered:

1. First
2. Second
   1. Nested ordered
   2. Another nested
3. Third

### Code Blocks

Inline: `const x = 42;`

Fenced (JavaScript):

```javascript
function greet(name) {
  return `Hello, ${name}!`;
}
console.log(greet("world"));
```

Fenced (Python):

```python
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

Indented code block (4 spaces):

    SELECT *
    FROM users
    WHERE active = 1;

### Tables

| Left aligned | Centered | Right aligned |
|:-------------|:--------:|-------------:|
| Cell A1      | Cell B1  | Cell C1       |
| Cell A2      | Cell B2  | Cell C2       |
| Cell A3      | Cell B3  | Cell C3       |

### Horizontal Rule

---

### Footnotes

This sentence has a footnote.[^note1] And another one.[^note2]

[^note1]: This is the first footnote text.
[^note2]: This is the second footnote, with **bold** and *italic* content.

---

## 2. Official Plugins

### Mark (==highlighted==)

Here is some ==highlighted text== using the mark plugin.

### Subscript and Superscript

Chemical formula: H~2~O. Superscript: x^2^ + y^2^ = r^2^.

### Inserted Text

++Inserted text++ is underlined.

### Task Lists

- [x] Completed task
- [ ] Pending task
- [x] Another done item
- [ ] One more to do

### KaTeX — Inline Math

Einstein's equation: $E = mc^2$.

Maxwell's equations: $\nabla \times \mathbf{B} = \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}$

### KaTeX — Display Math

$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

$$
\frac{\partial^2 u}{\partial t^2} = c^2 \nabla^2 u
$$

### KaTeX — mhchem Chemistry

Chemical reaction: $\ce{2H2 + O2 -> 2H2O}$

Equilibrium: $\ce{CO2 + H2O <=> H2CO3}$

### Containers — Semantic

::: success
**Success!** Operation completed without errors.
:::

::: info
**Note:** This is an informational message providing context.
:::

::: warning
**Warning:** Please review before proceeding with this action.
:::

::: danger
**Danger!** This action is irreversible and may cause data loss.
:::

### Containers — Layout

::: left
This block floats to the **left**. Useful for figure captions or side notes.
:::
The paragraph which is below the **left** container in the source will shown on the right side of the container **left**. The paragraph will shown on the right side of the container **left**. The paragraph will shown on the right side of the container **left**. The paragraph will shown on the right side of the container **left**. The paragraph will shown on the right side of the container **left**. 

The sentence below should align to the right. 

::: right
This block floats to the **right**.
:::

The sentence below should align center. 

::: center
This block is **centred** horizontally.
:::

### Containers — Spoiler

::: spoil Click to reveal
This content is hidden until the reader chooses to see it.
It can contain any markdown: **bold**, *italic*, `code`.
:::



### Containers — Columns

Naming convention: use `cols` as wrapper; each `col` is one column.
Two `col` blocks → two equal columns; three → thirds; etc.

:::: cols
::: col
**Column One**

Lorem ipsum dolor sit amet, consectetur adipiscing elit.
:::
::: col
**Column Two**

Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
:::
::: col
**Column Three**

Ut enim ad minim veniam, quis nostrud exercitation ullamco.
:::
::::

### Containers — Tabs

Naming convention: use `tabs` as wrapper; each `tab` carries its label in
the info string (e.g. `::: tab Python`).

:::: tabs
::: tab Python
```python
print("Hello from Python")
```
:::
::: tab JavaScript
```javascript
console.log("Hello from JavaScript");
```
:::
::: tab Rust
```rust
println!("Hello from Rust!");
```
:::
::::

---

## 3. Custom Plugins

*Plugins not yet implemented render as literal text — they will become live as each phase is completed.*

### test-block ✓

{{test-block}}

### test-inline ✓

A paragraph with a {{test-inline}} embedded inline.

### span[class] — Inline coloured / styled text

This sentence contains {{span[red] red text}}, {{span[blue] blue text}},
{{span[green] green text}}, and {{span[yellow] yellow text}}.

A span with **bold inside**: {{span[info] **important note**}}.

Alias `sp`: {{sp[warning] watch out}}.

### emoji — Unicode emoji from name

A smile: {{emoji smile}} and a rocket: {{emoji rocket}}.

Party time: {{em tada}} (alias `em`).

If the name doesn't exist: {{emoji nonexistent_xyz}} (stays literal).

### space — Inline horizontal whitespace

Column A:{{space 2}}Column B:{{space 4}}Column C.

### youtube — Embedded video

{{youtube dQw4w9WgXcQ}}

Alias `yt`:

{{yt 9bZkp7q19f0}}

### qrcode — Inline QR code

Scan this QR: {{qr https://example.com}}.

Full name alias: {{qrcode Hello World}}.

### mermaid — Diagram (rendered client-side)

{{mermaid
graph LR
    A[Start] --> B{Decision}
    B -- Yes --> C[Action]
    B -- No --> D[Skip]
    C --> E[End]
    D --> E
}}

Sequence diagram:

{{mm
sequenceDiagram
    Alice->>Bob: Hello Bob!
    Bob-->>Alice: Hi Alice!
}}

### smiles — Chemical structure (rendered client-side)

Benzene:

{{smiles C1=CC=CC=C1}}

Aspirin (acetylsalicylic acid):

{{sm CC(=O)OC1=CC=CC=C1C(=O)O}}

### yaml — Invisible metadata block

{{yaml
title: My Document
author: Jane Doe
date: 2024-01-15
tags:
  - markdown
  - demo
}}

### nyml — Invisible nyml parsed block

{{nyml
title: My NYML Document
author: Jane Doe
comments: |
  This is a multiline
  comment in NYML.
}}


### toc — Table of contents

{{toc}}

With range (headings 2–3 only):

{{toc 2,3}}

### attrs — Attribute injection

Inject a class onto the preceding element:

A paragraph with injected class. {{attrs[class="highlight"]}}

A heading with a custom id:

## My Section {{attrs[id="custom-id"]}}

### markdown-include — Embed external file

{{md fixtures/with-math.md}}

---

## 4. Span CSS Classes

### Colour classes

{{span[red] red}}, {{span[yellow] yellow}}, {{span[green] green}}, {{span[blue] blue}}.

### Badge classes

{{span[success] success}}, {{span[info] info}}, {{span[warning] warning}}, {{span[danger] danger}}.

---

## 5. Mixed / Nesting Tests

### Inline in blockquote

> This is a blockquote with a {{test-inline}} and
> ==highlighted== text inside.

### Block in blockquote

> {{test-block}}

### Block in list

- Normal item
- {{test-block}}
- Another item

### Block in container

::: warning
{{test-block}}

A warning with an embedded block plugin and $E = mc^2$.
:::

### Inline in table

| Feature         | Status                          |
|:----------------|:--------------------------------|
| Official plugins | {{span[success] done}}          |
| Block dispatch   | {{span[success] done}}          |
| Inline dispatch  | {{span[success] done}}          |
| Emoji plugin     | {{span[warning] in progress}}   |
| Mermaid plugin   | {{span[danger] not started}}    |

### Nested containers

:::: info
This info box contains a warning inside:

::: warning
Nested warning message.
:::

Back to info content.
::::

### Math in container

::: info
**Euler's identity** is considered the most beautiful equation:

$$e^{i\pi} + 1 = 0$$

It relates five fundamental constants of mathematics.
:::

---

# 中文測試 中文测试

## 中文測試 中文测试

### 中文測試 中文测试

#### 中文測試 中文测试

##### 中文測試 中文测试

###### 中文測試 中文测试

壬戌之秋，七月既望，蘇子與客泛舟游於赤壁之下。清風徐來，水波不興。舉酒屬客，誦明月之詩，歌窈窕之章。少焉，月出於東山之上，徘徊於斗牛之間。白露橫江，水光接天。縱一葦之所如，凌萬頃之茫然。浩浩乎如馮虛御風，而不知其所止；飄飄乎如遺世獨立，羽化而登仙。

壬戌之秋，七月既望，苏子与客泛舟游于赤壁之下。清风徐来，水波不兴。举酒属客，诵明月之诗，歌窈窕之章。少焉，月出于东山之上，徘徊于斗牛之间。白露横江，水光接天。纵一苇之所如，凌万顷之茫然。浩浩乎如冯虚御风，而不知其所止；飘飘乎如遗世独立，羽化而登仙。

## HTML elements

<iframe src=“https://ourworldindata.org/grapher/plastic-production-polymer?tab=chart” loading=“lazy” style=“width: 100%; height: 600px; border: 0px none;” allow=“web-share; clipboard-write”></iframe>

<div>Example div block. </div>

*End of example file.*
