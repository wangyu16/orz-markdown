{{nyml
kind: document
format: 1
template: article-section
}}

{{nyml
kind: article-title
title: Your Article Title Goes Here
subtitle: A short, descriptive subtitle for your paper
authors: |
  First Author | 1,* | first.author@example.edu | 0000-0002-1825-0097
  Second Author | 2
affiliations: |
  1: Department of Example, University of Example
  2: Institute of Example, Example City
notes: |
  *: Corresponding author
date: June 2026
placement: section
}}

{{nyml
kind: abstract
text: |
  Summarize your work in two or three sentences. State the problem you
  address, the approach you took, and the headline result a reader should
  remember. Keep it self-contained so it makes sense without the body.
keywords: keyword one, keyword two, keyword three
}}

## Introduction

Open with the context and motivation for your work. Describe the gap or open
question your study addresses, and end the section by stating your contribution
in one or two clear sentences. Replace this placeholder text with your own.

You can cite prior work informally here and expand on it in the References
section below. Aim for a paragraph or two that orients the reader before the
methods.

## Methods

Describe your approach so that it could be reproduced. Inline math renders with
single dollar signs — for example, the sample size $n = 120$ and a significance
threshold of $\alpha = 0.05$.

The table below is a placeholder; replace the rows with your own conditions.

| Condition | Parameter | Value |
|-----------|-----------|-------|
| Baseline  | rate      | 0.10  |
| Treatment | rate      | 0.42  |
| Control   | rate      | 0.09  |

Display equations use double dollar signs and are centered on their own line:

$$
\bar{x} = \frac{1}{n} \sum_{i=1}^{n} x_i
$$

Explain each symbol in the surrounding text so the equation is self-explanatory.

## Results

Summarize your findings as a short list, then expand on the most important ones
in prose if needed.

- The treatment condition outperformed the baseline by a wide margin.
- The effect held across all three replicates.
- No significant difference was observed between the control and baseline.

## Conclusion

Restate your main finding and its significance in plain language. Note the key
limitations of the study and suggest one or two concrete directions for future
work. Close with a sentence that leaves the reader with your central takeaway.

## References

1. Author, A. B., & Author, C. D. (Year). *Title of the first referenced work.*
   Journal or Publisher, volume(issue), pages.
2. Author, E. F. (Year). *Title of the second referenced work.* Journal or
   Publisher, volume(issue), pages.
