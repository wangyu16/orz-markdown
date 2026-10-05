{{nyml
kind: document
format: 1
title: Quiz 2 — Buffers
author: Yu Wang
license: CC-BY-NC-4.0
template: exam-section
theme: light-neat-2
page_number_position: footer-center
page_number_style: n-of-N
dynamic_choices: |
  answer-key: hide
  audience: student
  campus: lafayette
}}

{{nyml
kind: exam-title
title: CHEM 320 — Quiz 2
subtitle: Buffers and the Henderson–Hasselbalch equation
author: Yu Wang
student_fields: |
  Name | Student ID | Score / 20
placement: section
}}

<div data-show-when="audience=instructor">

**Instructor copy.** Grade with the attached rubric; half credit for a correct
setup with an arithmetic slip.

</div>

<div data-hide-when="audience=instructor">

**Instructions.** Answer both questions. Calculators are allowed.

</div>

{{nyml
kind: question-mc
n: 1
pts: 5 pts
body: A buffer contains 0.20 M acetic acid and 0.10 M sodium acetate (pKa 4.74). What is its pH?
options: |
  A. 4.44
  B. 4.74
  C. 5.04
  D. 7.00
answer: A
}}

{{nyml
kind: question-mc
n: 2
pts: 5 pts
body: Which pairs make a buffer? (Select all that apply.)
options: |
  A. HCl and NaCl
  B. NH3 and NH4Cl
  C. H2CO3 and NaHCO3
  D. NaOH and NaCl
answer: B, C
}}

{{nyml
kind: question-open
n: 3
pts: 10 pts
body: Explain why adding a small amount of HCl to the buffer in question 1 barely changes its pH.
space: 4cm
answer: The added H3O+ is consumed by acetate (CH3COO- + H3O+ -> CH3COOH + H2O), so the ratio of base to acid changes only slightly and the log term barely moves.
}}

<span data-show-when="campus=lafayette">Return completed quizzes to Madison Hall 210.</span>
<span data-show-when="campus=online">Upload a photo of your work to the course page.</span>
