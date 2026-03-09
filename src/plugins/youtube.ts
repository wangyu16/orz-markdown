import { register } from '../registry.js';

register({
  type: 'block',
  aliases: ['youtube', 'yt'],
  render(_args, body, _env) {
    const id = body?.trim();
    if (!id) return '';
    return (
      `<div class="youtube-embed">\n` +
      `  <iframe src="https://www.youtube.com/embed/${id}"\n` +
      `    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"\n` +
      `    referrerpolicy="strict-origin-when-cross-origin"\n` +
      `    allowfullscreen></iframe>\n` +
      `</div>\n`
    );
  },
});
