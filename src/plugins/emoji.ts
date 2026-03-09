import * as nodeEmoji from 'node-emoji';
import { register } from '../registry.js';

register({
  type: 'inline',
  aliases: ['emoji', 'em'],
  render(_args, body, _env) {
    const name = body?.trim() ?? '';
    const result = nodeEmoji.get(name);
    // node-emoji returns undefined for unknown names; fall back to original text
    if (!result) {
      return `{{emoji ${name}}}`;
    }
    return result;
  },
});
