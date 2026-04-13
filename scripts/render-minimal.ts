/**
 * scripts/render-minimal.ts
 *
 * Renders tests/example.md with minimal.css inlined from orz-markdown-skills/assets/
 * and writes the result to tests/example-minimal.html.
 *
 * Run with:  npx tsx scripts/render-minimal.ts
 */

import fs from 'fs';
import path from 'path';
import { md } from '../src/index.js';

const ROOT     = process.cwd();
const INPUT    = path.join(ROOT, 'tests', 'example.md');
const OUTPUT   = path.join(ROOT, 'tests', 'example-minimal.html');
const TEMPLATE = path.join(ROOT, 'orz-markdown-skills', 'assets', 'template.html');
const CSS      = path.join(ROOT, 'orz-markdown-skills', 'assets', 'minimal.css');

const body    = md.render(fs.readFileSync(INPUT, 'utf8'), { markdownBasePath: path.dirname(INPUT) });
const minCss  = fs.readFileSync(CSS, 'utf8');
let   html    = fs.readFileSync(TEMPLATE, 'utf8');

// Inline the CSS instead of keeping the relative link
html = html.replace(
  '  <link rel="stylesheet" href="./minimal.css">',
  `  <style>\n${minCss}\n  </style>`,
);

// Inject rendered body
html = html.replace('    <!-- INSERT RENDERED HTML HERE -->', body);

fs.writeFileSync(OUTPUT, html, 'utf8');
console.log(`Rendered → ${path.relative(ROOT, OUTPUT)}`);
