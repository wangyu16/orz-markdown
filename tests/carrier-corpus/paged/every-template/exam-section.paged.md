{{nyml
kind: document
format: 1
template: exam-section
page_number_position: footer-center
page_number_style: page-n-of-N
dynamic_choices: |
  answer-key: hide
}}

{{nyml
kind: exam-title
title: Course Name — Midterm Exam
subtitle: Chapter 1–4 Assessment
author: Instructor Name
student_fields: |
  Name | Student ID | Score / 100
placement: section
}}

<!-- This template leaves the exam-title `instructions:` field empty and puts the
     instructions at the top of the content instead — either placement works. -->

**Instructions.** Answer all questions in the space provided. Calculators are not
permitted, and you have 60 minutes to complete this exam.

{{nyml
kind: question-mc
n: 1
pts: 5 pts
body: Which of the following best describes the main concept covered in this section?
options: |
  A. First plausible answer choice.
  B. Second plausible answer choice.
  C. Correct answer choice.
  D. Fourth plausible answer choice.
answer: C
}}

{{nyml
kind: question-mc
n: 2
pts: 5 pts
body: Identify the term that matches the definition given in lecture.
options: |
  A. Distractor term one.
  B. Correct term.
  C. Distractor term three.
  D. Distractor term four.
answer: B
}}

{{nyml
kind: question-open
n: 3
pts: 10 pts
body: Explain the key idea in your own words and give one supporting example. Show all relevant reasoning.
space: 5cm
answer: A complete answer states the core principle, explains why it holds, and supports it with a concrete, correctly worked example. Full credit requires clear reasoning and an accurate example.
}}
