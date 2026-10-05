{{nyml
kind: document
format: 1
template: cv-elegant
custom_css: |
  /* CV — elegant: centered, letter-spaced name between hairlines, centered
     small-caps section headers, borderless two-column "ledger" entries (years |
     detail) that flow across pages. Theme-aware via tokens. */
  .orz-el-cv-header .orz-cv-header-inner.orz-bordered { border-bottom: 0; }
  .orz-el-cv-header {
    text-align: center;
    border-top: 1px solid var(--border-soft, #ddd);
    border-bottom: 1px solid var(--border-soft, #ddd);
    padding: 0.8em 0;
    margin-bottom: 1.4em;
  }
  .orz-el-cv-header .orz-cv-top { justify-content: center; }
  .orz-el-cv-header .orz-cv-name {
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    font-size: 1.85em;
    color: var(--text-main, #222);
  }
  .orz-el-cv-header .orz-cv-title { font-style: italic; color: var(--text-muted, #666); }
  .orz-el-cv-header .orz-cv-contacts { justify-content: center; font-size: 0.85em; gap: 0.3em 1em; }
  .orz-doc.markdown-body h2 {
    text-align: center;
    font-size: 1em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    color: var(--text-main, #222);
    border-bottom: 0;
    margin: 1.7em 0 0.7em;
  }
  .orz-doc.markdown-body h2::after {
    content: "";
    display: block;
    width: 2.5em;
    height: 1px;
    background: var(--accent, #999);
    margin: 0.5em auto 0;
  }
  .orz-doc.markdown-body table { width: 100%; border: 0; margin: 0.2em 0; }
  .orz-doc.markdown-body thead { display: none; }
  .orz-doc.markdown-body td {
    border: 0;
    border-bottom: 1px solid var(--border-soft, #eee);
    padding: 0.5em 0.4em;
    vertical-align: top;
  }
  .orz-doc.markdown-body td:first-child {
    white-space: nowrap;
    width: 9em;
    text-align: right;
    color: var(--text-muted, #777);
    font-variant: small-caps;
    font-size: 0.92em;
  }
  .orz-doc.markdown-body .cv-skills { text-align: center; font-size: 0.95em; line-height: 1.9; }
}}

{{nyml
kind: cv-header
full_name: Your Name
title: Job Title / Professional Tagline
contacts: |
  you@example.com
  City, Country
  linkedin.com/in/you
}}

A one-sentence profile, set centered and understated, introducing who you are and the work you do.
{{attrs[class="cv-skills"]}}

## Experience

| Years | Detail |
|---|---|
| 2022 – Present | **Senior Role**, Company Name — led the team and shipped a measurable result. |
| 2019 – 2022 | **Earlier Role**, Previous Company — built a core product used by many. |
| 2016 – 2019 | **First Role**, First Employer — delivered an improvement with a clear outcome. |

## Education

| Years | Detail |
|---|---|
| 2015 – 2019 | **Degree, Field of Study** — University Name, City. |

## Skills

Skill One · Skill Two · Skill Three · Skill Four · Skill Five · Skill Six
{{attrs[class="cv-skills"]}}
