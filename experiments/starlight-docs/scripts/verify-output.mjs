import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    if (!existsSync(target)) failures.push(`${relative(output, file)}: missing target: ${value}`);
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
  assert(pagefind.languages[language]?.page_count >= 1, `Missing search index for ${language}`);
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
      apiModules: modules.length,
      searchLanguages: Object.keys(pagefind.languages),
      failures,
    },
    null,
    2,
  ),
);
