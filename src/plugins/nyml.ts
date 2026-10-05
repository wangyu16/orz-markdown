import { register } from '../registry.js';
import { escapeAttr, jsonForScript } from '../html.js';
import { parseNymlV2 } from './nyml_parser.js';

register({
  type: 'block',
  aliases: ['nyml'],
  render(_args: string | null, body: string | null, env: object): string {
    const rawContent = body ?? '';
    let parsedContent;
    try {
      parsedContent = parseNymlV2(rawContent);
    } catch {
      parsedContent = { error: 'Failed to parse NYML' };
    }
    // The first block keeps the historical `nyml-data` id; later blocks in the
    // same render get `nyml-data-2`, `-3`, … so a document never carries
    // duplicate ids.
    const state = env as Record<string, unknown>;
    const n = ((state['__orzNymlCount'] as number | undefined) ?? 0) + 1;
    state['__orzNymlCount'] = n;
    const id = n === 1 ? 'nyml-data' : `nyml-data-${n}`;
    // data-md: copy-as-Markdown restores the block (the island is invisible).
    const directive = escapeAttr(`{{nyml\n${rawContent.trim()}\n}}`);
    return `<script type="application/json" id="${id}" data-md="${directive}">\n${jsonForScript(parsedContent, 2)}\n</script>\n`;
  },
});

