import { register } from '../registry.js';
import { escapeAttr, escapeScriptText } from '../html.js';

register({
  type: 'block',
  aliases: ['yaml', 'yml'],
  render(_args, body, _env) {
    // Reversible escape of every `</script` / `<script` spelling (`</script >`,
    // `</script/>` and `</script\tx>` all close the island; replacing only the
    // literal `</script>` let the rest run as HTML: round 11, H3). Read the
    // island back with `unescapeScriptText`.
    const content = escapeScriptText(body ?? '');
    const directive = escapeAttr(`{{yaml\n${(body ?? '').trim()}\n}}`);
    return `<script type="application/yaml" data-md="${directive}">\n${content}\n</script>\n`;
  },
});
