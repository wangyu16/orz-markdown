"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registry_js_1 = require("../registry.js");
const html_js_1 = require("../html.js");
function parseNumberList(value) {
    return value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => {
        const n = Number.parseFloat(part);
        return Number.isNaN(n) ? null : n;
    });
}
function parseList(value) {
    return value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}
/** Chart.js's built-in chart types by their lower-case spelling (its names are case-sensitive: `polarArea`). */
const CHART_TYPES = { bar: 'bar', line: 'line', pie: 'pie', doughnut: 'doughnut', radar: 'radar', polararea: 'polarArea', scatter: 'scatter', bubble: 'bubble' };
function parseChart(body) {
    let type = 'bar';
    let title = '';
    let labels = [];
    const datasets = [];
    for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        if (!line)
            continue;
        const colon = line.indexOf(':');
        if (colon === -1)
            continue;
        const key = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();
        switch (key) {
            case 'type':
                // Chart.js's own names, in any case the author writes them (`polarArea`: lower-cased, Chart.js refused it; M.41)
                if (value)
                    type = CHART_TYPES[value.toLowerCase()] ?? value.toLowerCase();
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
                }
                else {
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
    const config = {
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
(0, registry_js_1.register)({
    type: 'block',
    aliases: ['chart'],
    render(_args, body, _env) {
        const source = body?.trim() ?? '';
        // `data-md` lets copy-as-markdown recover the source after the client
        // runtime paints the <canvas> (which has no recoverable text content).
        const directive = `{{chart\n${source}\n}}`;
        const md = (0, html_js_1.escapeAttr)(directive);
        let config;
        try {
            config = parseChart(source);
        }
        catch {
            // Degrade gracefully: emit an empty, erroring canvas rather than throwing.
            return `<canvas class="orz-chart" data-chart-error="parse error" data-md="${md}" width="600" height="400"></canvas>\n`;
        }
        const json = (0, html_js_1.escapeAttr)(JSON.stringify(config));
        return `<canvas class="orz-chart" data-chart="${json}" data-md="${md}" width="600" height="400"></canvas>\n`;
    },
});
//# sourceMappingURL=chart.js.map