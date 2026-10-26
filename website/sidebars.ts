import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

/**
 * Creating a sidebar enables you to:
 - create an ordered group of docs
 - render a sidebar for each doc of that group
 - provide next/previous navigation

 The sidebars can be generated from the filesystem, or explicitly defined here.

 Create as many sidebars as you want.
 */
const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/decorators',
        'guides/operators',
        'guides/pipe',
        'guides/run',
        'guides/policy',
        'guides/observability',
        'guides/concurrency',
        'guides/store-node',
        'guides/experimental',
        'guides/granular-imports',
      ],
    },
    'migration/2.0',
    // API reference is auto-injected by docusaurus-plugin-typedoc
    // (each instance with autoConfiguration: true adds its own sidebar entry)
  ],
};

export default sidebars;
