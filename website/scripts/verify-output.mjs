import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { languages, markdownFiles } from './content-sources.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(project, 'dist');
const base = '/annotationsDesignPatterns/';
const origin = 'https://trial.invalid';

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

assert(existsSync(output), 'Run build:all before verifying the generated site.');
const htmlFiles = walk(output).filter((file) => file.endsWith('.html'));
const failures = [];
let checkedLinks = 0;
let checkedFragments = 0;
const ids = new Map();

for (const file of htmlFiles) {
  const source = readFileSync(file, 'utf8');
  const page = new URL(base + relative(output, file).replaceAll('\\', '/'), origin);
  const links = source.matchAll(/<(?:a|link|script|img)\b[^>]*?\b(?:href|src)="([^"]+)"/g);
  for (const [, value] of links) {
    if (/^(?:https?:|mailto:|data:|javascript:|\/\/)/.test(value)) continue;
    const url = new URL(value.replaceAll('&amp;', '&'), page);
    checkedLinks += 1;
    if (!url.pathname.startsWith(base)) {
      failures.push(`${relative(output, file)}: outside base path: ${value}`);
      continue;
    }
    let target = resolve(output, decodeURIComponent(url.pathname.slice(base.length)));
    if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
    if (!existsSync(target)) {
      failures.push(`${relative(output, file)}: missing target: ${value}`);
    } else if (url.hash && target.endsWith('.html')) {
      if (!ids.has(target))
        ids.set(
          target,
          new Set(
            [...readFileSync(target, 'utf8').matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
          ),
        );
      checkedFragments += 1;
      if (!ids.get(target).has(decodeURIComponent(url.hash.slice(1))))
        failures.push(`${relative(output, file)}: missing fragment: ${value}`);
    }
  }
}

for (const [language, path] of [
  ['es', 'index.html'],
  ['en', 'en/index.html'],
]) {
  const html = readFileSync(join(output, path), 'utf8');
  assert.match(html, new RegExp(`<html\\b[^>]*\\blang="${language}"`));
  assert(html.includes(`href="${base}api/"`), `${path}: shared API link is missing`);
  for (const locale of [base, `${base}en/`]) {
    assert(html.includes(`value="${locale}"`), `${path}: locale option ${locale} is missing`);
  }
}

const pagefind = JSON.parse(readFileSync(join(output, 'pagefind/pagefind-entry.json'), 'utf8'));
for (const language of ['es', 'en']) {
  const source = languages.find((item) => item.lang === language).source;
  assert(
    pagefind.languages[language]?.page_count >= markdownFiles(source).length + 1,
    `Missing guides in search index for ${language}`,
  );
}
const manifest = JSON.parse(readFileSync(join(output, 'content-manifest.json'), 'utf8'));
const oldHeadings = JSON.parse(
  readFileSync(join(project, 'scripts/fixtures/legacy-guide-anchors.json'), 'utf8'),
);
for (const { route, anchors } of oldHeadings) {
  const html = readFileSync(join(output, route.slice(base.length), 'index.html'), 'utf8');
  for (const id of anchors)
    assert(html.includes(`id="${id}"`), `${route}: old heading anchor ${id} was lost`);
}
let guidePages = 0;
for (const { lang, prefix, source } of languages) {
  const files = markdownFiles(source);
  const entries = manifest.filter((entry) => entry.lang === lang);
  assert.equal(entries.length, files.length, `${lang}: source/output page count mismatch`);
  for (const name of files) {
    const entry = entries.find((item) => item.source === `${prefix}${name}`);
    assert(entry, `${lang}/${name}: source missing from manifest`);
    const hash = createHash('sha256')
      .update(readFileSync(join(source, name), 'utf8').replaceAll('\r\n', '\n'))
      .digest('hex');
    assert.equal(entry.sourceSha256, hash, `${name}: built content is stale`);
    const id = `docs/${name.slice(0, -3)}/`;
    const html = readFileSync(join(output, prefix, id, 'index.html'), 'utf8');
    assert.match(html, new RegExp(`<html\\b[^>]*\\blang="${lang}"`));
    for (const locale of ['', 'en/'])
      assert(
        html.includes(`value="${base}${locale}${id}"`),
        `${lang}/${name}: missing equivalent locale ${locale}`,
      );
    const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/
      .exec(html)?.[1]
      .replace(/<[^>]*>/g, '')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll('&#39;', "'");
    assert.equal(heading, entry.title, `${name}: page title differs from source`);
    guidePages += 1;
  }
}
const legacy = JSON.parse(readFileSync(join(output, 'api/legacy-routes.json'), 'utf8'));
const inventory = JSON.parse(
  readFileSync(join(project, 'scripts/fixtures/legacy-api-routes.json'), 'utf8'),
);
const expectedAliases = inventory.routes
  .flatMap((route) => inventory.locales.map((locale) => `${base}${locale}docs/api/${route}`))
  .sort();
assert.deepEqual(
  legacy.map(({ from }) => from).sort(),
  expectedAliases,
  'Legacy route coverage differs from the old site inventory',
);
for (const { from, to } of legacy) {
  assert(from.startsWith(base) && to.startsWith(`${base}api/`), 'Legacy route escapes the site');
  const alias = readFileSync(join(output, from.slice(base.length), 'index.html'), 'utf8');
  assert(alias.includes(`href="${to}"`), `${from}: alias target mismatch`);
  assert(
    existsSync(join(output, to.slice(base.length).split(/[?#]/)[0])),
    `${from}: missing alias destination`,
  );
}
const modules = readdirSync(join(output, 'api/modules')).filter((file) => file.endsWith('.html'));
const entryPoints = JSON.parse(readFileSync(join(project, 'typedoc.json'), 'utf8')).entryPoints;
assert.equal(modules.length, entryPoints.length, 'Not all public API modules were generated');
assert(existsSync(join(output, 'api/assets/search.js')), 'TypeDoc search assets are missing');
assert.equal(failures.length, 0, failures.slice(0, 20).join('\n'));
console.log(
  JSON.stringify(
    {
      htmlFiles: htmlFiles.length,
      checkedLinks,
      checkedFragments,
      guidePages,
      preservedGuideAnchors: oldHeadings.reduce((count, page) => count + page.anchors.length, 0),
      legacyAliases: legacy.length,
      apiModules: modules.length,
      searchLanguages: Object.keys(pagefind.languages),
      failures,
    },
    null,
    2,
  ),
);
