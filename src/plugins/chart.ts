import { register } from '../registry.js';

/*
 * {{chart …}} — declarative chart blocks.
 *
 * The plugin parses a tiny, line-based config into a Chart.js-style config
 * object and emits a single <canvas class="orz-chart"> carrying that config as
 * HTML-escaped JSON in `data-chart`. It does NOT draw anything: the host's
 * client runtime is expected to read `data-chart` and call Chart.js, exactly
 * like smiles canvases are painted by smiles-drawer. A `data-md` breadcrumb
 * carries the original {{chart …}} source so copy-as-markdown can recover it.
 *
 * Syntax (one directive per line, `key: value`):
 *
 *   type: bar            # bar | line | pie | doughnut | ... (default: bar)
 *   title: My Chart      # optional chart title
 *   labels: Q1, Q2, Q3   # comma-separated x-axis / slice labels
 *   series: Revenue = 10, 14, 9, 17   # a named dataset (repeatable)
 *   series: Cost = 6, 7, 8, 9
 *
 * Single-series shorthand (no name needed):
 *
 *   type: pie
 *   labels: A, B, C
 *   data: 30, 50, 20
 *
 * Unknown keys are ignored. Numbers parse with parseFloat; non-numeric values
 * become null (a gap). On any parse failure the plugin degrades gracefully and
 * emits an empty canvas carrying an `data-chart-error` attribute rather than
 * throwing.
 */

// Encode a value for a double-quoted HTML attribute, preserving newlines (as
// &#10;) so multi-line source survives in `data-md`.
function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '&#10;');
}

interface ChartConfig {
  type: string;
  data: {
    labels: string[];
    datasets: { label?: string; data: (number | null)[] }[];
  };
  options?: Record<string, unknown>;
}

function parseNumberList(value: string): (number | null)[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const n = Number.parseFloat(part);
      return Number.isNaN(n) ? null : n;
    });
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parseChart(body: string): ChartConfig {
  let type = 'bar';
  let title = '';
  let labels: string[] = [];
  const datasets: { label?: string; data: (number | null)[] }[] = [];

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    switch (key) {
      case 'type':
        if (value) type = value.toLowerCase();
        break;
      case 'title':
        title = value;
        break;
      case 'labels':
        labels = parseList(value);
        break;
      case 'data':
        // single-series shorthand
        datasets.push({ data: parseNumberList(value) });
        break;
      case 'series': {
        const eq = value.indexOf('=');
        if (eq === -1) {
          datasets.push({ data: parseNumberList(value) });
        } else {
          const name = value.slice(0, eq).trim();
          const nums = parseNumberList(value.slice(eq + 1));
          datasets.push({ label: name || undefined, data: nums });
        }
        break;
      }
      default:
        // ignore unknown keys
        break;
    }
  }

  const config: ChartConfig = {
    type,
    data: { labels, datasets },
  };

  if (title) {
    config.options = {
      plugins: { title: { display: true, text: title } },
    };
  }

  return config;
}

register({
  type: 'block',
  aliases: ['chart'],
  render(_args, body, _env) {
    const source = body?.trim() ?? '';
    // `data-md` lets copy-as-markdown recover the source after the client
    // runtime paints the <canvas> (which has no recoverable text content).
    const directive = `{{chart\n${source}\n}}`;
    const md = escapeAttr(directive);

    let config: ChartConfig;
    try {
      config = parseChart(source);
    } catch {
      // Degrade gracefully: emit an empty, erroring canvas rather than throwing.
      return `<canvas class="orz-chart" data-chart-error="parse error" data-md="${md}" width="600" height="400"></canvas>\n`;
    }

    const json = escapeAttr(JSON.stringify(config));
    return `<canvas class="orz-chart" data-chart="${json}" data-md="${md}" width="600" height="400"></canvas>\n`;
  },
});
