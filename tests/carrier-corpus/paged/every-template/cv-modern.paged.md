{{nyml
kind: document
format: 1
template: cv-modern
custom_css: |
  /* CV — modern: left-aligned, accent-forward, right-aligned dates, skill chips.
     Theme-aware via tokens (falls back when a token is unset). */
  .orz-el-cv-header .orz-cv-header-inner.orz-bordered { border-bottom: 0; }
  .orz-el-cv-header {
    text-align: left;
    border-bottom: 3px solid var(--accent, #2b6cb0);
    padding-bottom: 0.5em;
    margin-bottom: 1.2em;
  }
  .orz-el-cv-header .orz-cv-top { justify-content: flex-start; }
  .orz-el-cv-header .orz-cv-name { font-size: 2.3em; letter-spacing: -0.015em; }
  .orz-el-cv-header .orz-cv-title { color: var(--text-muted, #666); font-size: 1.05em; }
  .orz-el-cv-header .orz-cv-contacts { justify-content: flex-start; gap: 0.3em 1.1em; }
  .orz-doc.markdown-body h2 {
    font-size: 0.9em;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: var(--accent, #2b6cb0);
    border-bottom: 0;
    margin: 1.5em 0 0.5em;
  }
  .orz-doc.markdown-body h3 {
    font-size: 1.06em;
    margin: 0.7em 0 0.05em;
    border-bottom: 0;
  }
  .orz-doc.markdown-body h3 + p { color: var(--text-muted, #555); font-style: italic; margin: 0 0 0.35em; }
  .cv-date {
    float: right;
    font-weight: 400;
    color: var(--text-muted, #777);
    font-size: 0.88em;
  }
  .cv-chip {
    display: inline-block;
    background: var(--surface-2, #f0f2f5);
    border: 1px solid var(--border, #e2e6ea);
    border-radius: 999px;
    padding: 0.12em 0.7em;
    margin: 0.18em 0.25em 0.18em 0;
    font-size: 0.85em;
  }
}}

{{nyml
kind: cv-header
full_name: Your Name
title: Job Title / Professional Tagline
contacts: |
  you@example.com
  City, Country
  linkedin.com/in/you
  +1 555 0100
summary: Two-sentence pitch — who you are and the value you bring. Lead with your specialty and the kind of impact you are known for.
}}

## Experience

### Senior Role {{span[cv-date] 2022 – Present}}

Company Name, City

- Led a key initiative that delivered a measurable result (e.g. +X% revenue, −Y% cost).
- Owned a project end to end, collaborating across teams to ship on time.
- Mentored teammates and improved a process the whole team relied on.

### Earlier Role {{span[cv-date] 2019 – 2022}}

Previous Company, City

- Built or maintained a core product used by many people.
- Drove an improvement with a clear, quantified outcome.

## Education

### Degree, Field of Study {{span[cv-date] 2015 – 2019}}

University Name, City

## Skills

{{span[cv-chip] Skill One}} {{span[cv-chip] Skill Two}} {{span[cv-chip] Skill Three}} {{span[cv-chip] Skill Four}} {{span[cv-chip] Skill Five}} {{span[cv-chip] Skill Six}}
