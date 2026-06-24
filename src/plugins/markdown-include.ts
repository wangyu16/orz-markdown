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

      // Resolve path: prefer env.markdownBasePath (document dir) over the cwd.
      // Guard `process` so this stays usable in a browser bundle (no Node
      // globals); there the fs read below fails and the include renders empty.
      const cwd = typeof process !== 'undefined' && process.cwd ? process.cwd() : '.';
      const basePath = (envObj['markdownBasePath'] as string | undefined) ?? cwd;
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
