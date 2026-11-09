# Starlight documentation trial

An isolated Astro Starlight prototype for the Spanish and English documentation
landing pages. It keeps its own dependencies and lockfile; it does not change
the published Docusaurus site or library package.

## Private TypeDoc compatibility patch

The full trial audit now reports zero known vulnerabilities (9 November 2026).
This requires an override of TypeDoc 0.28.20's minimatch dependency to 11.0.5
**and a private local compatibility patch**. The override alone breaks recursive
file discovery because minimatch 11 removed `matchOne`. This combination is not
supported by TypeDoc upstream.

`scripts/prepare-typedoc.mjs` adapts directory traversal to the public partial
matcher, preserving the original negation behavior. It checks exact dependency
versions, installation location and full source/output SHA-256 hashes before
writing into this trial's `node_modules`. Unknown inputs fail without modification;
an already patched file is accepted unchanged. Review or remove the patch when
upgrading TypeDoc. It does not modify library sources or the current website.

There is no install lifecycle hook. `api`, `verify:typedoc` and `build:all` run
preparation explicitly, including after `npm ci --ignore-scripts`. Use
`build:all` for complete validation; `build` alone only builds Astro pages.
The 26 permanent glob regression cases use a baseline captured from unmodified
TypeDoc 0.28.20 with minimatch 10.2.6. Temporary fixtures remain ignored under
`.validation/`.

See [the reduction report](../../release/audits/STARLIGHT-REDUCTION-RESULTS.md)
for audit evidence, compatibility comparisons and remaining limitations.

## Requirements

The library currently supports Node 20, but this documentation toolchain has a
separate requirement: Astro 7.4.7 requires Node **22.23.4 or newer**. The root
`.nvmrc` remains unchanged. The commands below use temporary Node 22 and npm 11
packages, leaving the system installation alone.

From this directory, install and build with:

```powershell
npx --yes --package=node@22 --package=npm@11 npm ci
npx --yes --package=node@22 --package=npm@11 npm run build:all
```

To preview the generated site:

```powershell
npx --yes --package=node@22 --package=npm@11 npm run preview
```

The default Spanish page is at `/annotationsDesignPatterns/`; the English page
is at `/annotationsDesignPatterns/en/`. Both provide Starlight's page search,
locale switcher, and a direct link to the shared generated API at
`/annotationsDesignPatterns/api/`.

The API uses TypeDoc's standalone HTML renderer over the ten public entrypoints
used by the current Docusaurus configuration. It is shared by both locales and
linked from each landing page. This deliberately avoids coupling the API
generator to Starlight; the API pages are outside Starlight's locale-aware
navigation and Pagefind index. A full migration would need a decision about
translated API content and integrated API search/navigation.

The build keeps TypeDoc warnings visible and treats them as errors. Its
`intentionallyNotExported` list adapts the live site's baseline to the current
ten-entrypoint run: it retains known public API boundaries and explicitly
accounts for referenced helper types that are intentionally not exported.
