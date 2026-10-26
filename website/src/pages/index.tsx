import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';
import ThemedImage from '@theme/ThemedImage';
import Translate, { translate } from '@docusaurus/Translate';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import Heading from '@theme/Heading';

import styles from './index.module.css';

const decoratorExample = `import { Singleton, Retry, Timeout, Fallback } from 'annotations-design-patterns';

@Singleton
class ApiClient {
  @Fallback<User[]>([])
  @Retry({ attempts: 3, delayMs: 200, backoffFactor: 2 })
  @Timeout(5000)
  async fetchUsers(): Promise<User[]> {
    /* ... */
  }
}`;

const functionalExample = `import { fallback, retry, timeout } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';

const fetchUsers = pipe(
  loadUsers,
  fallback<object, readonly [], User[]>([]),
  retry({ attempts: 3, delayMs: 200, backoffFactor: 2 }),
  timeout(5000),
);`;

function HomepageHeader() {
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <ThemedImage
          className={styles.heroLogo}
          alt=""
          sources={{ light: useBaseUrl('/img/logo.png'), dark: useBaseUrl('/img/logo-dark.png') }}
        />
        <Heading as="h1" className={clsx('hero__title', styles.heroTitle)}>
          annotations-<span className={styles.accent}>design-patterns</span>
        </Heading>
        <p className="hero__subtitle">
          <Translate id="home.hero.subtitle">
            Patrones de diseño, resiliencia y caché para TypeScript: como decoradores estándar TC39
            o como funciones componibles.
          </Translate>
        </p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/intro">
            <Translate id="home.hero.start">Empezar</Translate>
          </Link>
          <Link className="button button--outline button--secondary button--lg" to="/docs/api/root">
            <Translate id="home.hero.api">Referencia de API</Translate>
          </Link>
        </div>
        <code className={styles.install}>npm install annotations-design-patterns</code>
      </div>
    </header>
  );
}

function TwoStyles() {
  return (
    <section className={styles.styles}>
      <div className="container">
        <Heading as="h2" className="text--center">
          <Translate id="home.styles.title">Dos formas de usarla</Translate>
        </Heading>
        <p className={clsx('text--center', styles.lead)}>
          <Translate id="home.styles.lead">
            La resiliencia y la caché comparten el mismo motor en los dos estilos: elige el que
            encaje con tu código.
          </Translate>
        </p>
        <div className="row">
          <div className="col col--6">
            <Heading as="h3">
              <Translate id="home.styles.decorators">Con anotaciones</Translate>
            </Heading>
            <p>
              <Translate id="home.styles.decorators.text">
                Para clases y métodos propios: la política queda declarada junto al código.
              </Translate>
            </p>
            <CodeBlock language="ts">{decoratorExample}</CodeBlock>
          </div>
          <div className="col col--6">
            <Heading as="h3">
              <Translate id="home.styles.functions">Con funciones</Translate>
            </Heading>
            <p>
              <Translate id="home.styles.functions.text">
                Para funciones sueltas, código de terceros o proyectos sin decoradores.
              </Translate>
            </p>
            <CodeBlock language="ts">{functionalExample}</CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home(): ReactNode {
  return (
    <Layout
      title={translate({ id: 'home.meta.title', message: 'Inicio' })}
      description={translate({
        id: 'home.meta.description',
        message:
          'Patrones de diseño, resiliencia y caché para TypeScript, como decoradores TC39 o funciones componibles.',
      })}
    >
      <HomepageHeader />
      <main>
        <TwoStyles />
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
