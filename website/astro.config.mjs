import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://stealman364.github.io',
  base: '/annotationsDesignPatterns/',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Annotations Design Patterns',
      favicon: '/favicon.ico',
      defaultLocale: 'root',
      locales: {
        root: { label: 'Español', lang: 'es' },
        en: { label: 'English', lang: 'en' },
      },
      logo: {
        light: './public/img/logo.png',
        dark: './public/img/logo-dark.png',
        replacesTitle: false,
      },
      head: [
        {
          tag: 'meta',
          attrs: {
            property: 'og:image',
            content: 'https://stealman364.github.io/annotationsDesignPatterns/img/social-card.jpg',
          },
        },
      ],
      sidebar: [
        { label: 'Inicio', translations: { en: 'Home' }, slug: 'index' },
        { label: 'Empezar', translations: { en: 'Getting started' }, slug: 'docs/intro' },
        {
          label: 'Guías',
          translations: { en: 'Guides' },
          items: [{ autogenerate: { directory: 'docs/guides' } }],
        },
        {
          label: 'Migración',
          translations: { en: 'Migration' },
          items: [{ autogenerate: { directory: 'docs/migration' } }],
        },
        // The localized English API entry redirects to the shared reference.
        { label: 'API', link: '/api/' },
        { label: 'npm', link: 'https://www.npmjs.com/package/annotations-design-patterns' },
      ],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/stealman364/annotationsDesignPatterns',
        },
      ],
    }),
  ],
});
