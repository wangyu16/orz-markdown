import { register } from '../registry.js';
import { parseNymlV2 } from './nyml_parser.js';

register({
  type: 'block',
  aliases: ['nyml'],
  render(_args: string | null, body: string | null, _env: object): string {
    const rawContent = body ?? '';
    let parsedContent;
    try {
      parsedContent = parseNymlV2(rawContent);
    } catch {
      parsedContent = { error: 'Failed to parse NYML' };
    }
    const jsonContent = JSON.stringify(parsedContent, null, 2).replace(/<\/script>/gi, '<\\/script>');
    return `<script type="application/json" id="nyml-data">\n${jsonContent}\n</script>\n`;
  },
});
