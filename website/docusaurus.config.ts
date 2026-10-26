import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import typedocBaseJson from './typedoc.base.json';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const typedocBaseConfig = {
  ...typedocBaseJson,
  sidebar: {
    autoConfiguration: true,
  },
};

const config: Config = {
  title: 'Annotations Design Patterns',
  tagline: 'Design patterns as standard TC39 TypeScript decorators',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true,
  },

  // Set the production url of your site here
  url: 'https://stealman364.github.io',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/annotationsDesignPatterns/',

  // GitHub pages deployment config.
  organizationName: 'stealman364',
  projectName: 'annotationsDesignPatterns',

  onBrokenLinks: 'throw',

  // Internationalization configuration
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    // Root entrypoint: ./
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-root',
        entryPoints: ['../src/index.ts'],
        out: 'docs/api/root',
        ...typedocBaseConfig,
      },
    ],
    // Decorators entrypoint: ./decorators
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-decorators',
        entryPoints: ['../src/decorators/index.ts'],
        out: 'docs/api/decorators',
        ...typedocBaseConfig,
      },
    ],
    // Operators entrypoint: ./operators
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-operators',
        entryPoints: ['../src/public/operators.ts'],
        out: 'docs/api/operators',
        ...typedocBaseConfig,
      },
    ],
    // Pipe entrypoint: ./pipe
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-pipe',
        entryPoints: ['../src/public/pipe.ts'],
        out: 'docs/api/pipe',
        ...typedocBaseConfig,
      },
    ],
    // Run entrypoint: ./run
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-run',
        entryPoints: ['../src/public/run.ts'],
        out: 'docs/api/run',
        ...typedocBaseConfig,
      },
    ],
    // Policy entrypoint: ./policy
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-policy',
        entryPoints: ['../src/policy/index.ts'],
        out: 'docs/api/policy',
        ...typedocBaseConfig,
      },
    ],
    // Observability entrypoint: ./observability
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-observability',
        entryPoints: ['../src/observability/index.ts'],
        out: 'docs/api/observability',
        ...typedocBaseConfig,
      },
    ],
    // Node entrypoint: ./node
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-node',
        entryPoints: ['../src/node/index.ts'],
        out: 'docs/api/node',
        ...typedocBaseConfig,
      },
    ],
    // Store entrypoint: ./store
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-store',
        entryPoints: ['../src/store/index.ts'],
        out: 'docs/api/store',
        ...typedocBaseConfig,
      },
    ],
    // Experimental entrypoint: ./experimental
    [
      'docusaurus-plugin-typedoc',
      {
        id: 'api-experimental',
        entryPoints: ['../src/experimental/index.ts'],
        out: 'docs/api/experimental',
        ...typedocBaseConfig,
      },
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Annotations Design Patterns',
      logo: {
        alt: 'Annotations Design Patterns',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://github.com/stealman364/annotationsDesignPatterns',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/intro',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/stealman364/annotationsDesignPatterns',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Annotations Design Patterns. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
