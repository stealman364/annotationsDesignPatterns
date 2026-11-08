# Starlight documentation trial

An isolated Astro Starlight prototype for the Spanish and English documentation
landing pages. It keeps its own dependencies and lockfile; it does not change
the published Docusaurus site or library package.

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
