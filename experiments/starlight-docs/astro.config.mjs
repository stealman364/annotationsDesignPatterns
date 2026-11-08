import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://stealman364.github.io',
  base: '/annotationsDesignPatterns/',
  integrations: [
    starlight({
      title: 'Annotations Design Patterns',
      favicon: '/favicon.ico',
      defaultLocale: 'root',
      locales: {
        root: { label: 'Español', lang: 'es' },
        en: { label: 'English', lang: 'en' },
      },
      sidebar: [{ label: 'Inicio', slug: 'index' }],
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
