{{nyml
kind: document
format: 1
template: article-page
front_matter: clean
}}

{{nyml
kind: article-title
title: Your Article Title
subtitle: A Concise, Descriptive Subtitle
authors: |
  First Author | 1,* | first.author@example.edu | 0000-0002-1825-0097
  Second Author | 2 | second.author@example.org
  Third Author | 1,2
affiliations: |
  1: Department of Example, University of Example
  2: Institute of Example, Example City
notes: |
  *: Corresponding author
date: Month Year
placement: page
}}

{{nyml
kind: abstract
text: Briefly state the problem, what you did, and what you found. Summarize your main contribution in one or two sentences. Close with the significance of the result for the field.
keywords: keyword one, keyword two, keyword three
placement: page
}}

## Introduction

Open with the context and motivation for your work. State the gap your study
addresses and the question you set out to answer. End the section with a short
statement of your contribution and an outline of what follows.

## Methods

Describe your approach so that a reader could reproduce it. Summarize the key
parameters of your setup in a compact table:

| Parameter | Symbol | Value |
|---|---|---|
| Sample size | $n$ | 120 |
| Trials per group | $k$ | 5 |
| Significance level | $\alpha$ | 0.05 |

Quantities are reported with their uncertainties, and the mass–energy relation
$E = mc^2$ is used where relevant. The core model is given by

$$
\hat{y} = \beta_0 + \sum_{i=1}^{n} \beta_i x_i + \varepsilon
$$

where the residual term $\varepsilon$ is assumed normally distributed.

## Results

- The primary measure improved by 18% over the baseline.
- The effect held across all three experimental groups.
- Results were statistically significant ($p < 0.05$).

## Conclusion

Restate the main finding, note its limitations, and point to one direction for
future work.

## References

1. Author Name. *Title of the First Reference.* Journal Name, Year, pp. 1–10.
2. Author Name. *Title of the Second Reference.* Publisher, Year.
