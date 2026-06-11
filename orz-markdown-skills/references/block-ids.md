# Stable Block IDs — Preservation Rules

Host applications built on orz-markdown attach stable block identifiers to headings so that sections keep their identity across edits, AI rewrites, and document versions. This file is the contract an AI editor MUST follow whenever a document uses these IDs. Violating it silently breaks cross-references, progress tracking, and anything else the host keys off block identity.

---

## What a block ID looks like

A block ID is `blk-` followed by 8 or more lowercase base36 characters (`a–z`, `0–9`), attached with the `attrs` plugin immediately after a heading:

```markdown
## Acid-Base Theory{{attrs[#blk-abc12345]}}
```

Canonical form: the `{{attrs[...]}}` marker comes **directly after the heading text with no space before it**. (A space before the marker also parses, but the no-space form is canonical — emit it when writing new headings.)

Renders as:

```html
<h2 id="blk-abc12345" tabindex="-1">Acid-Base Theory</h2>
```

The ID overrides the auto-generated `markdown-it-anchor` slug, so the anchor stays fixed no matter what the heading says.

---

## The rules

1. **IDs are immutable.** When editing or rewriting a section, NEVER change, remove, regenerate, or "fix" its `{{attrs[#...]}}` marker. Preserve it character-for-character — even when you rewrite the heading text completely.

   ```markdown
   Before:  ## Acid-Base Theory{{attrs[#blk-abc12345]}}
   After:   ## Brønsted–Lowry Acids and Bases{{attrs[#blk-abc12345]}}   ← same ID
   ```

2. **Never reuse an ID from a deleted block** for new content. A deleted block's identity dies with it.

3. **Replacing is not editing.** When a section is deliberately replaced with new content (rather than edited), the host application mints the new ID. Do not invent one yourself unless explicitly asked.

4. **Copies do not inherit IDs.** When copying a section into another document, do not carry the ID along verbatim if the host supplies a new one. An ID must never appear twice within one document.

5. **Never convert to or from Pandoc-style `{#id}` syntax.** orz-markdown does not support it: `## Title {#blk-x}` renders the braces as literal heading text and corrupts the anchor slug. The only supported form is `{{attrs[#...]}}` (or `{{attrs[id="..."]}}`).

---

## Quick checklist before saving an edit

- Every heading that had a `{{attrs[#blk-...]}}` marker before your edit still has the **same** marker.
- No new ID was invented, regenerated, or copied from elsewhere.
- No ID appears more than once in the document.
- No Pandoc `{#id}` syntax anywhere.
