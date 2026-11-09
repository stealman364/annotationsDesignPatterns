import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const project = fileURLToPath(new URL('..', import.meta.url));
export const base = '/annotationsDesignPatterns/';
export const languages = [
  { lang: 'es', prefix: '', source: join(project, 'docs') },
  {
    lang: 'en',
    prefix: 'en/',
    source: join(project, 'i18n/en/docusaurus-plugin-content-docs/current'),
  },
];
export function markdownFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (prefix === '' && entry.name === 'api') return [];
      const relative = prefix + entry.name;
      if (entry.isFile() && /\.(mdx|markdown)$/i.test(relative)) {
        throw new Error(
          `${relative}: source migration supports Markdown .md only; adapt the converter before adding another format.`,
        );
      }
      return entry.isDirectory()
        ? markdownFiles(join(directory, entry.name), relative + '/')
        : relative.endsWith('.md')
          ? [relative]
          : [];
    })
    .sort();
}
