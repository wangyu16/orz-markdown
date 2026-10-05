{{nyml
kind: document
format: 1
title: Every Element — Department Annual Report
author: Yu Wang
license: CC-BY-4.0
uid: doc-p4g3d1e2l9
lang: en
theme: light-academic-2
template: report-page
page_size: Letter
margin_top: 22
margin_bottom: 22
margin_left: 25
margin_right: 25
font_preset: source-serif-4
font_heading_preset: inter
font_size: 11
line_height: 1.45
decoration_color: "#2962a4"
page_background: "#fffdf8"
page_number_position: footer-right
page_number_style: page-n-of-N
header_left: Department of Chemistry
header_right: Annual Report 2026
header_rule: true
footer_left: Internal
footer_rule: true
first_page_hide_header: true
first_page_hide_footer: true
front_matter: clean
limit_image_to_page: true
keep_image_together: true
repeat_table_header: true
avoid_table_row_breaks: true
custom_css: |
  .orz-el-timestamp { font-size: 0.85em; }
  .orz-doc.markdown-body h2 { break-before: auto; }
}}

{{nyml
kind: report-title
title: Department of Chemistry — Annual Report 2026
subtitle: Teaching, research, and facilities
authors: |
  Yu Wang | 1,* | chair@example.edu | 0000-0002-1825-0097
  Avery Brooks | 1
  Sam Okafor | 2
affiliations: |
  1: Department of Chemistry, University of Example
  2: Shared Instrumentation Facility, University of Example
notes: |
  *: Corresponding author
date: October 2026
placement: page
}}

{{nyml
kind: abstract
text: |
  Enrolment in general chemistry rose 8 % while lab sections held at 24 seats.
  Two new open textbooks replaced commercial titles, saving students an
  estimated $41,000. The NMR upgrade finished on schedule.
keywords: annual report, chemistry, open educational resources
placement: page
}}

{{nyml
kind: toc
title: Contents
max_level: 2
placement: page
}}

## Teaching

{{nyml
kind: article-title
title: Open Textbooks in General Chemistry
subtitle: An inline article title (placement section)
author: Avery Brooks
date: September 2026
placement: section
}}

Both general-chemistry courses now use open textbooks. Section averages on the
common final were unchanged (72.4 → 72.9).

## Assessment sample

{{nyml
kind: exam-title
title: CHEM 101 — Common Final (excerpt)
author: Teaching committee
duration: 15 minutes
total_points: 15 points
student_fields: |
  Name | Section
instructions: |
  Answer both questions.
placement: section
}}

{{nyml
kind: question-mc
n: 1
pts: 5 pts
body: Which quantity is conserved in every chemical reaction?
options: |
  A. Volume
  B. Mass
  C. Number of molecules
  D. Temperature
answer: B
}}

{{nyml
kind: question-open
n: 2
pts: 10 pts
body: Balance the combustion of propane and state the mole ratio of O2 to CO2.
space: 3cm
answer: C3H8 + 5 O2 -> 3 CO2 + 4 H2O; O2 to CO2 is 5:3.
}}

::: page-break
:::

## Correspondence

{{nyml
kind: letterhead
organization: Department of Chemistry
address: |
  104 Lab Science Building
  Lafayette, LA 70503
email: chemistry@example.edu
phone: (337) 555-0142
}}

{{nyml
kind: letter-inside-address
to: Dean of Sciences
organization: College of Sciences
address: |
  200 Administration Hall
  Lafayette, LA 70503
}}

Dear Dean,

Please find attached the department's annual report for 2026.

{{nyml
kind: letter-signature
from: Yu Wang
closing: Respectfully
title: Department Chair
}}

## Staff profile

{{nyml
kind: cv-header
full_name: Sam Okafor
title: Facility Manager, Shared Instrumentation
contacts: |
  sokafor@example.edu
  Lafayette, LA
}}

Runs the 400 MHz NMR, the GPC, and the DSC; trains 60 students a year.

{{nyml
kind: timestamp
label: Last updated
date: 2026-10-05
}}
