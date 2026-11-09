import assert from 'node:assert/strict';
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Application, ReflectionKind, ReferenceReflection } from 'typedoc';

const projectDir = fileURLToPath(new URL('..', import.meta.url));
const configPath = join(projectDir, 'typedoc.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const publicDir = resolve(projectDir, 'public');
const apiDir = resolve(projectDir, config.out);
const legacyRoutesPath = join(projectDir, 'scripts/fixtures/legacy-api-routes.json');
const legacy = JSON.parse(readFileSync(legacyRoutesPath, 'utf8'));
const siteBase = '/annotationsDesignPatterns/';

assert.equal(apiDir, resolve(publicDir, 'api'), 'TypeDoc output must stay in public/api.');
assert.equal(legacy.version, 1);
assert.equal(legacy.basePath, siteBase);
assert.deepEqual(legacy.locales, ['', 'en/']);

function htmlEscape(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
}

function deepTarget(reflection) {
  return reflection instanceof ReferenceReflection
    ? reflection.tryGetTargetReflectionDeep()
    : reflection;
}

function resolveLegacyTarget(project, router, route) {
  const parts = route.split('/').filter(Boolean);
  const oldModule = parts.shift();
  assert(oldModule, `Invalid legacy route: ${route}`);
  const expectedModule = Object.entries(legacy.modules).find(
    ([, legacyName]) => legacyName === oldModule,
  )?.[0];
  assert(expectedModule, `${route}: no TypeDoc module mapping for ${oldModule}`);
  const expectedName = parts.at(-1);
  const candidates = Object.values(project.reflections).filter((reflection) => {
    if (parts.length === 0)
      return reflection.kindOf(ReflectionKind.Module) && reflection.name === expectedModule;
    return reflection.name === expectedName && reflection.parent?.kindOf(ReflectionKind.Module);
  });
  if (parts.length === 0) {
    assert.equal(
      candidates.length,
      1,
      `${route}: expected one TypeDoc module named ${expectedModule}; found ${candidates.length}`,
    );
    assert(router.hasUrl(candidates[0]), `${route}: TypeDoc module ${expectedModule} has no URL`);
    return router.getFullUrl(candidates[0]);
  }
  const matches = candidates
    .map((reflection) => ({ reflection, target: deepTarget(reflection) }))
    .filter(({ target }) => target && router.hasUrl(target))
    .filter(({ reflection }) => reflection.parent?.name === expectedModule);
  assert.equal(
    matches.length,
    1,
    `${route}: expected one URL-bearing reflection in ${expectedModule}; found ${matches.length}`,
  );
  return router.getFullUrl(matches[0].target);
}

function makeRedirect(from, to) {
  const destination = `${siteBase}api/${to}`;
  const safeDestination = htmlEscape(destination);
  const base = JSON.stringify(destination);
  return `<!doctype html><html lang="${from.startsWith(`${siteBase}en/`) ? 'en' : 'es'}"><head><meta charset="utf-8"><meta name="robots" content="noindex,follow"><link rel="canonical" href="${safeDestination}"><title>API reference moved</title><script>(()=>{const target=new URL(${base},location.href);if(location.search)target.search=location.search;if(location.hash)target.hash=location.hash;location.replace(target.href)})()</script></head><body><p>This API reference moved. <a href="${safeDestination}" id="destination">Open the current reference</a>.</p><script>(()=>{const target=new URL(${base},location.href);if(location.search)target.search=location.search;if(location.hash)target.hash=location.hash;document.getElementById('destination').href=target.href})()</script></body></html>`;
}

const app = await Application.bootstrapWithPlugins({ ...config, out: apiDir });
const project = await app.convert();
assert(project, 'TypeDoc did not produce a project.');
app.validate(project);
assert(!app.logger.hasErrors(), 'TypeDoc reported conversion or validation errors.');
assert(
  !(config.treatWarningsAsErrors && app.logger.hasWarnings()),
  'TypeDoc warnings are treated as errors.',
);
const spanishRedirectDir = resolve(publicDir, 'docs/api');
const englishRedirectDir = resolve(publicDir, 'en/docs/api');
assert.equal(spanishRedirectDir, resolve(publicDir, 'docs/api'));
assert.equal(englishRedirectDir, resolve(publicDir, 'en/docs/api'));
rmSync(apiDir, { recursive: true, force: true });
rmSync(spanishRedirectDir, { recursive: true, force: true });
rmSync(englishRedirectDir, { recursive: true, force: true });
let router;
app.renderer.on('beginRender', () => {
  router = app.renderer.router;
});
await app.generateDocs(project, apiDir);
assert(!app.logger.hasErrors(), 'TypeDoc reported errors while rendering HTML.');
assert(
  !(config.treatWarningsAsErrors && app.logger.hasWarnings()),
  'TypeDoc warnings are treated as errors.',
);
assert(router, 'TypeDoc did not initialize its HTML router.');

const manifest = [];
const unresolved = [];
for (const route of legacy.routes) {
  let target;
  try {
    target = resolveLegacyTarget(project, router, route);
  } catch (error) {
    unresolved.push(error.message);
    continue;
  }
  for (const locale of legacy.locales) {
    const source = `${siteBase}${locale}docs/api/${route}`;
    const destination = `${siteBase}api/${target}`;
    manifest.push({ from: source, to: destination });
    const redirectDir = locale ? englishRedirectDir : spanishRedirectDir;
    const outputFile = resolve(redirectDir, `${route}index.html`);
    assert(
      outputFile.startsWith(`${redirectDir}${sep}`),
      `Unsafe legacy output path: ${outputFile}`,
    );
    mkdirSync(dirname(outputFile), { recursive: true });
    writeFileSync(outputFile, makeRedirect(source, target));
  }
}
assert.deepEqual(unresolved, [], `Unresolved legacy API routes:\n${unresolved.join('\n')}`);

// Starlight localizes navigation links; both languages use the same API renderer.
const englishApiEntry = resolve(publicDir, 'en/api/index.html');
assert.equal(englishApiEntry, join(publicDir, 'en/api/index.html'));
mkdirSync(dirname(englishApiEntry), { recursive: true });
writeFileSync(englishApiEntry, makeRedirect(`${siteBase}en/api/`, ''));

const manifestPath = join(apiDir, 'legacy-routes.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated TypeDoc HTML and ${manifest.length} legacy API redirects.`);
