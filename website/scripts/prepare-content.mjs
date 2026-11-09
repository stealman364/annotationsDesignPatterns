import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { base, languages, markdownFiles, project } from './content-sources.mjs';

const manifest = [];
for (const { lang, prefix, source } of languages) {
  const files = markdownFiles(source);
  const known = new Set(files.map((file) => file.slice(0, -3)));
  const generated = resolve(project, 'src/content/docs', prefix, 'docs');
  assert(generated.startsWith(resolve(project, 'src/content/docs') + sep));
  mkdirSync(generated, { recursive: true });
  // Only generated Markdown in these two dedicated output directories.
  for (const old of markdownFiles(generated)) unlinkSync(join(generated, old));
  for (const file of files) {
    const original = readFileSync(join(source, file), 'utf8').replaceAll('\r\n', '\n');
    const match = /^---\nsidebar_position: (\d+)\n---\n\n# ([^\n]+)\n/.exec(original);
    assert(match, `${lang}/${file}: unsupported metadata or missing title`);
    const [, order, heading] = match;
    let fence;
    const converted = original
      .slice(match[0].length)
      .split('\n')
      .map((line) => {
        const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
        if (marker) {
          if (!fence) fence = marker;
          else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
          return line;
        }
        if (fence) return line;
        return line.replace(/\]\(([^\s)]+)\)/g, (whole, href) => {
          if (/^(?:[a-z]+:|\/\/|#)/i.test(href)) return whole;
          const split = href.search(/[?#]/);
          const path = split < 0 ? href : href.slice(0, split);
          const suffix = split < 0 ? '' : href.slice(split);
          if (path.startsWith('/docs/api/'))
            return `](${base}${prefix}${path.slice(1).replace(/\/$/, '')}/${suffix})`;
          const target = path.startsWith('/docs/')
            ? path.slice('/docs/'.length)
            : posix.normalize(posix.join(posix.dirname(file), path));
          const id = target.replace(/\.md$/, '').replace(/\/$/, '');
          assert(known.has(id), `${lang}/${file}: unresolved Markdown link ${href}`);
          return `](${base}${prefix}docs/${id}/${suffix})`;
        });
      })
      .join('\n');
    const title = heading.replaceAll('`', '');
    const target = join(generated, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      `---\ntitle: ${JSON.stringify(title)}\nsidebar:\n  order: ${order}\n---\n${converted}`,
    );
    manifest.push({
      lang,
      source: `${prefix}${file}`,
      route: `${base}${prefix}docs/${file.slice(0, -3)}/`,
      title,
      sourceSha256: createHash('sha256').update(original).digest('hex'),
    });
  }
}
mkdirSync(join(project, 'public'), { recursive: true });
writeFileSync(
  join(project, 'public/content-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log(
  `Prepared ${manifest.length} documentation pages from existing Spanish/English sources.`,
);
