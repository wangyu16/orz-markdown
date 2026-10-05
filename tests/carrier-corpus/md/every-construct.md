{{nyml
kind: document
format: 1
title: Acids, Bases, and Buffers — Week 3 Notes
author: Yu Wang
description: Course notes for CHEM 320, week 3, written to exercise every orz-markdown construct.
date: 2026-09-14
keywords: acids, bases; buffers，pH；titration
source: https://github.com/wangyu16/chem320-oer
license: CC-BY-4.0
license_name: CC BY 4.0
license_url: https://creativecommons.org/licenses/by/4.0/
uid: doc-7k2m9x4q1z
lang: en
theme: light-neat-3
measure: wide
}}

# Acids, Bases, and Buffers{{attrs[#blk-a1b2c3d4]}}

{{toc 2,3}}

## 1. Text and inline formatting{{attrs[#blk-e5f6g7h8]}}

A **strong acid** dissociates completely in water; a *weak acid* does not. The
difference is ***the whole story*** of this week, so watch for `Ka` values.
Concentrations are ==highlighted== when they matter, ++new terms++ are marked as
inserted, and ~~"acids taste sour"~~ is struck because tasting is not a method.

Water is H~2~O and the hydronium ion is H~3~O^+^; the ion product is
K~w~ = 1.0 × 10^−14^ at 25 °C.

Typographer turns -- into an en dash, --- into an em dash, ... into an ellipsis,
(c) into ©, and "straight quotes" into curly ones.

A line that ends with two spaces  
continues after a hard break.

[The OpenStax chapter](https://openstax.org/books/chemistry-2e/pages/14-introduction "OpenStax Chemistry 2e, ch. 14")
covers the same ground; bare links like https://openstax.org and
www.example.org are linked automatically.

![A pH meter on a lab bench](https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/PH_Meter.jpg/320px-PH_Meter.jpg =240x)

![Indicator colour chart](images/indicator-chart.png =x120)

### Headings at every level{{attrs[#blk-i9j0k1l2]}}

#### Level four: conjugate pairs

##### Level five: amphiprotic species

###### Level six: water itself

## 2. Lists and tasks{{attrs[#blk-m3n4o5p6]}}

- Arrhenius: acids give H^+^ in water
- Brønsted–Lowry: acids donate protons
  - every acid has a conjugate base
  - every base has a conjugate acid
    - the stronger the acid, the weaker its conjugate base
- Lewis: acids accept electron pairs

* An asterisk bullet starts a separate list.

1. Calibrate the pH meter with pH 4, 7 and 10 buffers.
2. Rinse the electrode with deionized water.
   1. Blot, never wipe.
   2. Keep the bulb wet between readings.
3. Record the reading after it is stable for 10 s.

Before the lab:

- [x] Read section 14.3
- [x] Watch the titration video
- [ ] Finish the pre-lab quiz
- [ ] Print the data sheet

> A buffer resists change in pH when small amounts of acid or base are added.
>
> > It does **not** keep the pH constant — it only slows the change.

---

## 3. Tables{{attrs[#blk-q7r8s9t0]}}

| Acid | Formula | K~a~ | pK~a~ |
|:-----|:-------:|-----:|------:|
| Acetic | CH~3~COOH | 1.8 × 10^−5^ | 4.74 |
| Formic | HCOOH | 1.8 × 10^−4^ | 3.74 |
| Hydrofluoric | HF | 6.8 × 10^−4^ | 3.17 |
| Ammonium | NH~4~^+^ | 5.6 × 10^−10^ | 9.25 |

| Status | Meaning |
|---|---|
| {{sp[success] done}} | data collected |
| {{sp[warning] check}} | reading drifted |
| {{sp[danger] redo}} | electrode dried out |

## 4. Code{{attrs[#blk-u1v2w3x4]}}

Inline: `pH = -log10([H3O+])`.

```python
import math

def ph_from_concentration(h3o: float) -> float:
    """pH of a solution from its hydronium concentration (mol/L)."""
    return -math.log10(h3o)

print(round(ph_from_concentration(1.8e-5), 2))
```

```ts
export function henderson(pKa: number, base: number, acid: number): number {
  return pKa + Math.log10(base / acid);
}
```

~~~text
A tilde fence holds plain text, including ``` backticks.
~~~

    Indented code: 0.10 M CH3COOH + 0.10 M CH3COONa -> pH 4.74

## 5. Math and chemistry{{attrs[#blk-y5z6a7b8]}}

The acid dissociation constant is $K_a = \dfrac{[\mathrm{H_3O^+}][\mathrm{A^-}]}{[\mathrm{HA}]}$,
and the Henderson–Hasselbalch equation follows from it:

$$
\mathrm{pH} = \mathrm{p}K_a + \log_{10}\frac{[\mathrm{A^-}]}{[\mathrm{HA}]}
$$

Acetic acid in water: $\ce{CH3COOH + H2O <=> CH3COO- + H3O+}$.
Neutralisation: $\ce{H3O+ + OH- -> 2H2O}$, and a buffer absorbing base:
$\ce{CH3COOH + OH- -> CH3COO- + H2O}$.

$$
\ce{NH4+ + H2O <=> NH3 + H3O+} \qquad K_a = 5.6 \times 10^{-10}
$$

## 6. Footnotes{{attrs[#blk-c9d0e1f2]}}

Sørensen introduced the pH scale in 1909.[^sorensen] The "p" is usually read as
"power"[^p], although Sørensen never said so explicitly.^[Historians still argue
about it; see the Carlsberg Laboratory archives.]

[^sorensen]: S. P. L. Sørensen, *Biochemische Zeitschrift* **21**, 131 (1909).
[^p]: German *Potenz*, French *puissance*.

## 7. Containers{{attrs[#blk-g3h4i5j6]}}

::: success
**Calibrated.** All three buffer readings were within ±0.02 of nominal.
:::

::: info
**Note:** pK~a~ values in this table are at 25 °C.
:::

::: warning
**Warning:** Concentrated acid is always added to water, never the reverse.
:::

::: danger
**Danger:** Hydrofluoric acid penetrates skin; calcium gluconate gel must be on the bench.
:::

::: left 30%
![Burette](images/burette.png =160x)
:::
A burette delivers titrant in steps of 0.05 mL. Read the bottom of the meniscus
at eye level, and record the reading to two decimal places. This paragraph wraps
beside the floated figure on wide screens.

::: right
— *Lab coordinator, Fall 2026*
:::

::: center
**Equivalence point:** moles of base added = moles of acid present.
:::

::: spoil Show the worked answer
For 25.00 mL of 0.100 M acetic acid titrated with 0.100 M NaOH, the
half-equivalence point is at 12.50 mL, where pH = pK~a~ = 4.74.
:::

:::: tabs
::: tab Python
```python
print(henderson(4.74, 0.15, 0.10))
```
:::
::: tab Spreadsheet
`=4.74 + LOG10(B2/C2)`
:::
::::

:::: cols 1 2
::: col
**Strong acid**

Complete dissociation; pH from concentration directly.
:::
::: col
**Weak acid**

Partial dissociation; solve the ICE table or use the 5 % approximation when
$C/K_a > 400$.
:::
::::

:::: info
Outer info box.

::: warning
A nested warning: one fewer colon than its parent.
:::

Back in the info box.
::::

::: lab-checklist
A custom container becomes `<div class="lab-checklist">`.
:::

## 8. Plugins{{attrs[#blk-k7l8m9n0]}}

Colours: {{span[red] red}}, {{sp[yellow] amber}}, {{sp[green] green}},
{{sp[blue] blue}}; badges: {{sp[success] pass}} {{sp[info] note}}
{{sp[warning] check}} {{sp[danger] fail}}; custom: {{span[pka-value] 4.74}}.

Emoji: {{emoji test_tube}} {{em microscope}} {{emoji tada}}, and an unknown name
stays literal: {{emoji not_a_real_emoji}}.

Spacing: pH{{space 2}}=={{space 1.5}}7.00

Course page: {{qr https://chem320.example.edu/week3}} · {{qrcode mailto:ta@example.edu}}

{{qr https://chem320.example.edu/week3/titration-video}}

{{youtube dQw4w9WgXcQ}}

{{yt https://youtu.be/dQw4w9WgXcQ?t=42}}

{{mermaid
flowchart LR
  A[Weak acid HA] -->|loses H+| B[Conjugate base A-]
  B -->|gains H+| A
}}

{{mm
sequenceDiagram
  Student->>pH meter: insert electrode
  pH meter-->>Student: 4.76
}}

{{smiles CC(=O)O}}

{{sm
CC(=O)[O-].[Na+]
}}

{{chart
type: line
title: Titration of 0.100 M acetic acid
labels: 0, 5, 10, 12.5, 15, 20, 24, 25, 26, 30
series: pH = 2.87, 4.14, 4.57, 4.74, 4.92, 5.35, 6.12, 8.72, 11.29, 11.96
}}

{{chart
type: pie
labels: Strong, Weak, Amphiprotic
data: 6, 38, 4
}}

{{md ../../fixtures/with-math.md}}

{{yaml
week: 3
topics:
  - acid-base equilibria
  - buffers
}}

{{yml
reviewed: true
}}

{{nyml
kind: lab-data
trial: 2
readings: |
  4.12
  4.15
  4.13
}}

A paragraph with a class attached. {{attrs[.summary]}}

Literal braces stay literal: \{{sp[red] not a span}}.

## 9. Raw HTML{{attrs[#blk-o1p2q3r4]}}

<div class="periodic-hint">Inline HTML blocks pass through.</div>

<!-- A comment authors leave for themselves. -->

<details>
<summary>Raw details element</summary>

Markdown inside raw HTML still renders after a blank line.

</details>

*End of week 3 notes.*
