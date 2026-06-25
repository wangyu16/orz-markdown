import { describe, it, expect } from 'vitest';
import { md } from '../src/index';

// Pull the JSON config out of the data-chart attribute and parse it.
function extractConfig(html: string): any {
  const match = html.match(/data-chart="([^"]*)"/);
  if (!match) throw new Error('no data-chart attribute found');
  const json = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&#10;/g, '\n')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  return JSON.parse(json);
}

describe('Chart plugin', () => {
  it('emits a <canvas class="orz-chart"> placeholder', () => {
    const html = md.render('{{chart\ntype: bar\nlabels: A, B\ndata: 1, 2\n}}');
    expect(html).toContain('<canvas class="orz-chart"');
    expect(html).toContain('data-chart=');
    expect(html).toContain('width="600"');
    expect(html).toContain('height="400"');
  });

  it('parses type, labels and multiple named series into the config', () => {
    const html = md.render(
      '{{chart\ntype: bar\nlabels: Q1, Q2, Q3, Q4\nseries: Revenue = 10, 14, 9, 17\nseries: Cost = 6, 7, 8, 9\n}}'
    );
    const config = extractConfig(html);
    expect(config.type).toBe('bar');
    expect(config.data.labels).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(config.data.datasets).toHaveLength(2);
    expect(config.data.datasets[0]).toEqual({ label: 'Revenue', data: [10, 14, 9, 17] });
    expect(config.data.datasets[1]).toEqual({ label: 'Cost', data: [6, 7, 8, 9] });
  });

  it('supports the single-series `data:` shorthand', () => {
    const html = md.render('{{chart\ntype: pie\nlabels: A, B, C\ndata: 30, 50, 20\n}}');
    const config = extractConfig(html);
    expect(config.type).toBe('pie');
    expect(config.data.labels).toEqual(['A', 'B', 'C']);
    expect(config.data.datasets).toHaveLength(1);
    expect(config.data.datasets[0].data).toEqual([30, 50, 20]);
    expect(config.data.datasets[0].label).toBeUndefined();
  });

  it('supports line charts', () => {
    const html = md.render('{{chart\ntype: line\nlabels: Jan, Feb\nseries: Users = 5, 8\n}}');
    const config = extractConfig(html);
    expect(config.type).toBe('line');
    expect(config.data.datasets[0]).toEqual({ label: 'Users', data: [5, 8] });
  });

  it('defaults to bar when no type is given', () => {
    const html = md.render('{{chart\nlabels: A, B\ndata: 1, 2\n}}');
    const config = extractConfig(html);
    expect(config.type).toBe('bar');
  });

  it('attaches a title via options when provided', () => {
    const html = md.render('{{chart\ntype: bar\ntitle: Sales\nlabels: A\ndata: 1\n}}');
    const config = extractConfig(html);
    expect(config.options.plugins.title.text).toBe('Sales');
    expect(config.options.plugins.title.display).toBe(true);
  });

  it('turns non-numeric data points into null gaps', () => {
    const html = md.render('{{chart\ntype: line\nlabels: A, B, C\ndata: 1, x, 3\n}}');
    const config = extractConfig(html);
    expect(config.data.datasets[0].data).toEqual([1, null, 3]);
  });

  it('embeds a data-md breadcrumb carrying the {{chart …}} source', () => {
    const html = md.render('{{chart\ntype: bar\nlabels: A, B\ndata: 1, 2\n}}');
    // newlines encoded so multi-line source survives the attribute; this is
    // what the copy-as-markdown walker reads back to recover the source.
    expect(html).toContain('data-md="{{chart&#10;type: bar&#10;labels: A, B&#10;data: 1, 2&#10;}}"');
  });

  it('HTML-escapes dangerous content in the source breadcrumb', () => {
    const html = md.render('{{chart\ntitle: <script>evil</script>\n}}');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
