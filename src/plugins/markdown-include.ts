import fs from 'fs';
import path from 'path';
import type MarkdownIt from 'markdown-it';
import { register } from '../registry.js';

export function registerMarkdownInclude(md: MarkdownIt): void {
  register({
    type: 'block',
    aliases: ['markdown', 'md', 'md-include'],
    render(_args, body, env) {
      const filePath = body?.trim();
      if (!filePath) return '';

      const envObj = env as Record<string, unknown>;

      // Guard against nested includes
      if (envObj['markdownIncludeActive']) return '';

      // Resolve path: prefer env.markdownBasePath (document dir) over process.cwd()
      const basePath = (envObj['markdownBasePath'] as string | undefined) ?? process.cwd();
      const resolved = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(basePath, filePath);

      let source: string;
      try {
        source = fs.readFileSync(resolved, 'utf8');
      } catch {
        return '';
      }

      envObj['markdownIncludeActive'] = true;
      try {
        return md.render(source, env);
      } finally {
        envObj['markdownIncludeActive'] = false;
      }
    },
  });
}
