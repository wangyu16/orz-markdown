import { register } from '../registry.js';

register({
  type: 'block',
  aliases: ['test-block'],
  render: (_args, _body, _env) =>
    '<div class="test-block">TestPluginBlock</div>\n',
});

register({
  type: 'inline',
  aliases: ['test-inline'],
  render: (_args, _body, _env) =>
    '<span class="test-inline">TestPluginInline</span>',
});
