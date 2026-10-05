{{nyml
kind: document
format: 1
title: Every Layout — Polymer Characterization
author: Yu Wang
license: CC-BY-4.0
uid: doc-s1l2a3y4o5
theme: paper
ratio: 16:9
footer: CHEM 320 · Polymer characterization
transition: slide
}}

<!-- slide -->
## Single region (no layout)
Content with no region markers flows into the primary region, `body`.
- Number-average molar mass $M_n$
- Weight-average molar mass $M_w$
- Dispersity $Đ = M_w / M_n$

<!-- slide 2col -->
## 2col — equal columns
<!-- @left -->
**GPC** separates chains by hydrodynamic volume.
<!-- @right -->
**MALDI-TOF** gives absolute masses for low-$Đ$ samples.

<!-- slide 2col 3/2 -->
## 2col 3/2 — weighted columns
<!-- @left -->
| Method | Gives |
|---|---|
| GPC | $M_n$, $M_w$, $Đ$ |
| NMR | end groups, $M_n$ |
| DSC | $T_g$, $T_m$ |
<!-- @right -->
{{chart
type: bar
labels: GPC, NMR, DSC
series: Samples per day = 24, 12, 8
}}

<!-- slide 3col -->
## 3col — three columns
<!-- @left -->
**Thermal**: DSC, TGA
<!-- @mid -->
**Mechanical**: DMA, tensile
<!-- @right -->
**Molecular**: GPC, NMR

<!-- slide 3col 1/2/1 -->
## 3col 1/2/1 — weighted columns
<!-- @left -->
Monomer
<!-- @mid -->
Propagating chain, the widest column
<!-- @right -->
Polymer

<!-- slide 2row -->
## 2row — stacked rows
<!-- @top -->
Glass transition: the amorphous regions gain segmental mobility.
<!-- @bottom -->
Melting: the crystalline regions lose long-range order.

<!-- slide 2row 1/2 -->
## 2row 1/2 — weighted rows
<!-- @top -->
A short lead-in row.
<!-- @bottom -->
{{mermaid
flowchart LR
  Sample --> Dissolve --> Filter --> Inject --> Detect
}}

<!-- slide main-side -->
## main-side — default 2/1
<!-- @main -->
Polystyrene standards calibrate the column; a universal calibration corrects
for chemistry by plotting $\log([\eta] M)$ against elution volume.
<!-- @side -->
{{smiles C=Cc1ccccc1}}

<!-- slide main-side 3/1 -->
## main-side 3/1 — wider main
<!-- @main -->
Mark–Houwink: $[\eta] = K M^a$, with $a \approx 0.5$ in a theta solvent.
<!-- @side -->
- $a$ = 0.5: theta
- $a$ = 0.8: good solvent

<!-- slide quad -->
## quad — four cells
<!-- @tl -->
**DSC**
<!-- @tr -->
**TGA**
<!-- @bl -->
**DMA**
<!-- @br -->
**GPC**

<!-- slide row auto/1 { head; col 1/1 { a; b } } -->
## Raw split — header over two cells
<!-- @head -->
A full-width header band, sized to its content.
<!-- @a -->
Before annealing: $T_g$ = 98 °C
<!-- @b -->
After annealing: $T_g$ = 101 °C

<!-- slide col 220px/1fr { sidebar; content } -->
## Raw split — fixed sidebar
<!-- @sidebar -->
Sidebar, 220px.
<!-- @content -->
Content fills the rest (1fr).

<!-- slide col 1/1/1 { c1; row 1/1 { c2a; c2b }; c3 } -->
## Raw split — deep nesting
<!-- @c1 -->
Column 1
<!-- @c2a -->
Middle, top
<!-- @c2b -->
Middle, bottom
<!-- @c3 -->
Column 3

<!-- slide 2col -->
## Float — one overlay
<!-- @left -->
Grid content, left.
<!-- @right -->
Grid content, right.
<!-- @float left=58% top=22% w=36% h=44% -->
> **Key takeaway:** narrow $Đ$ across all three methods.

<!-- slide -->
## Floats — two, ordered by z
Base content underneath both floats.
<!-- @float left=8% top=34% w=42% h=34% z=1 -->
::: info
Float A — z=1
:::
<!-- @float right=8% bottom=10% w=300px h=120px z=2 -->
::: warning
Float B — z=2, anchored right/bottom in px
:::
