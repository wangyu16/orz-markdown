import { register } from '../registry.js';

register({
  type: 'block',
  aliases: ['yaml', 'yml'],
  render(_args, body, _env) {
    const content = (body ?? '').replace(/<\/script>/gi, '<\\/script>');
    return `<script type="application/yaml">\n${content}\n</script>\n`;
  },
});
