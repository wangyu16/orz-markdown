{{nyml
kind: document
format: 1
title: Presenter Features — Titration Lab Briefing
author: Yu Wang
license: CC-BY-4.0
theme: orchard
ratio: 4:3
footer: Titration lab · week 5
transition: fade
}}

<!-- slide template=title -->
<!-- @body -->
# Titration Lab Briefing
## speaker notes · fragments · footers · slide options
CHEM 320 · Week 5
<!-- @notes -->
Welcome everyone. Remind them that goggles go on before the first burette is
filled. Press **S** for this speaker view.

<!-- slide step -->
## The four steps (whole-slide step)
- Calibrate the meter
- Fill and zero the burette
- Titrate to the first colour change
- Repeat until three trials agree
<!-- @notes -->
Bullets reveal one at a time. Pause after "first colour change".

<!-- slide -->
## Manual fragments
Always visible: the endpoint is where the indicator changes colour.

Revealed second: the equivalence point is where moles match.{{attrs[.fragment]}}

Revealed third: they differ by the indicator error.{{attrs[.fragment]}}
<!-- @notes -->
These paragraphs use `{{attrs[.fragment]}}` instead of the `step` flag.

<!-- slide step 2col -->
## Stepped two columns
<!-- @left -->
- Phenolphthalein
- Methyl orange
<!-- @right -->
- pH 8.2–10.0
- pH 3.1–4.4
<!-- @notes -->
Fragments reveal across regions in document order.

<!-- slide -->
## Per-slide footer
This slide replaces the deck footer with its own.
<!-- @footer -->
Safety data sheets: lab drawer 3 · this slide only

<!-- slide bg=#10243a -->
## bg — colour background
Readable on a dark navy background.

<!-- slide bg=https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/PH_Meter.jpg/640px-PH_Meter.jpg -->
## bg — image background
An image URL as the slide background.

<!-- slide t=zoom -->
## t — per-slide transition
Entering this slide zooms; the deck default is fade.

<!-- slide id=endpoint-quiz class=quiz -->
## id and class
This section carries `id="endpoint-quiz"` and `class="quiz"`.

<!-- slide fit=scroll -->
## fit=scroll
A long table that scrolls instead of shrinking.

| Trial | Initial (mL) | Final (mL) | Delivered (mL) |
|---|---|---|---|
| 1 | 0.35 | 24.80 | 24.45 |
| 2 | 0.10 | 24.52 | 24.42 |
| 3 | 0.20 | 24.66 | 24.46 |
| 4 | 0.05 | 24.49 | 24.44 |
| 5 | 0.40 | 24.85 | 24.45 |
| 6 | 0.15 | 24.60 | 24.45 |
| 7 | 0.30 | 24.74 | 24.44 |
| 8 | 0.25 | 24.71 | 24.46 |

<!-- slide fit=off class="quiz wide" -->
## fit=off with a quoted class
No scaling at all on this slide.

<!-- slide template=closing -->
<!-- @body -->
# Questions?
## See you in the lab
<!-- @footer -->
Lab opens at 9:00
<!-- @notes -->
Stop the timer (**T**) when done.
