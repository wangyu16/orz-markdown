{{nyml
kind: document
format: 1
template: exam-page
page_number_position: footer-center
page_number_style: page-n-of-N
dynamic_choices: |
  answer-key: hide
}}

<!-- One source, two printouts: this is the student copy (answer-key: hide).
     Switch to `answer-key: show` here — or use the editor's answer-key toggle —
     to reveal the ✓ marks and model answers for the instructor key. -->


{{nyml
kind: exam-title
title: Course Name — Exam 1
subtitle: Fall Term, October Date
author: Instructor Name
duration: 60 minutes
total_points: 100 points
student_fields: |
  Name | Student ID | Score / 100
instructions: |
  **Instructions.** Read each question carefully before answering.

  - Answer all questions. Multiple-choice questions are worth 5 points each; open-response questions are worth the points indicated.
  - For multiple-choice questions, circle the single best answer.
  - For open-response questions, write your answer in the space provided. Show all work; partial credit is awarded for correct reasoning.
  - No calculators, notes, or electronic devices are permitted unless otherwise stated. Do not turn the page until instructed.
placement: page
}}

{{nyml
kind: question-mc
n: 1
pts: 5 pts
body: Which of the following best describes the primary concept introduced in this unit?
options: |
  A. The first plausible-sounding option.
  B. The correct option that states the concept accurately.
  C. A close but subtly incorrect option.
  D. An option that is clearly unrelated.
answer: B
}}

{{nyml
kind: question-mc
n: 2
pts: 5 pts
body: Given the scenario above, what is the most likely outcome?
options: |
  A. An outcome that contradicts the principle.
  B. An outcome that ignores a key assumption.
  C. The outcome consistent with the principle.
  D. An outcome that is only true in a special case.
answer: C
}}

{{nyml
kind: question-open
n: 3
pts: 10 pts
body: Define the key term from this unit and explain, in two or three sentences, why it matters in practice.
space: 5cm
answer: A model answer briefly defines the term and gives one concrete reason it matters, demonstrating clear understanding of the concept.
}}

{{nyml
kind: question-open
n: 4
pts: 10 pts
body: Compare and contrast the two approaches discussed in class, giving one advantage and one limitation of each.
space: 5cm
answer: A model answer names both approaches, states one genuine advantage and one genuine limitation for each, and draws a clear comparison between them.
}}
