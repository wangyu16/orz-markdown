import { existsSync, readFileSync } from 'node:fs';

const docsDir = new URL('../docs/', import.meta.url);
const origin = 'https://markdown.orz.how';
const pages = [
  { file: 'index.html', url: `${origin}/` },
  { file: 'family.html', url: `${origin}/family.html` },
  { file: 'features.html', url: `${origin}/features.html` },
  { file: 'guide.html', url: `${origin}/guide.html` },
  { file: 'agents.html', url: `${origin}/agents.html` },
  { file: 'verify.html', url: `${origin}/verify.html` },
  { file: 'editor.html', url: `${origin}/editor.html` },
  { file: 'slides.html', url: `${origin}/slides.html` },
  { file: 'paged.html', url: `${origin}/paged.html` },
] as const;

const failures: string[] = [];
const requiredFiles = ['robots.txt', 'sitemap.xml', 'llms.txt', 'media/orz-markdown-social.png'];

for (const file of requiredFiles) {
  if (!existsSync(new URL(file, docsDir))) {
    failures.push(`${file}: missing`);
  }
}

const robots = readFileSync(new URL('robots.txt', docsDir), 'utf8');
if (!robots.includes(`Sitemap: ${origin}/sitemap.xml`)) {
  failures.push('robots.txt: sitemap declaration is missing or incorrect');
}

const sitemap = readFileSync(new URL('sitemap.xml', docsDir), 'utf8');
for (const page of pages) {
  if (!sitemap.includes(`<loc>${page.url}</loc>`)) {
    failures.push(`sitemap.xml: missing ${page.url}`);
  }
}

for (const page of pages) {
  const source = readFileSync(new URL(page.file, docsDir), 'utf8');
  const checks = [
    ['description', /<meta name="description" content="[^"]+">/],
    ['canonical', new RegExp(`<link rel="canonical" href="${page.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`)],
    ['robots', /<meta name="robots" content="index,follow,max-image-preview:large">/],
    ['Open Graph title', /<meta property="og:title" content="[^"]+">/],
    ['Open Graph description', /<meta property="og:description" content="[^"]+">/],
    ['Open Graph URL', new RegExp(`<meta property="og:url" content="${page.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`)],
    ['Open Graph image', /<meta property="og:image" content="https:\/\/markdown\.orz\.how\/media\/orz-markdown-social\.png">/],
    ['Twitter card', /<meta name="twitter:card" content="summary_large_image">/],
  ] as const;

  for (const [label, pattern] of checks) {
    if (!pattern.test(source)) {
      failures.push(`${page.file}: missing ${label}`);
    }
  }

  if (/self-contained/i.test(source)) {
    failures.push(`${page.file}: marketing copy still contains "self-contained"`);
  }
}

if (failures.length > 0) {
  console.error(`Site discovery check failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('Site discovery check passed.');
}
