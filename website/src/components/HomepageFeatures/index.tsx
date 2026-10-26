import type { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: ReactNode;
  description: ReactNode;
  to: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: <Translate id="home.features.tc39.title">Decoradores TC39 estándar</Translate>,
    description: (
      <Translate id="home.features.tc39.text">
        Funciona con TypeScript 5+ sin experimentalDecorators ni reflect-metadata.
      </Translate>
    ),
    to: '/docs/guides/decorators',
  },
  {
    title: <Translate id="home.features.gof.title">Patrones GoF e inyección</Translate>,
    description: (
      <Translate id="home.features.gof.text">
        15 patrones clásicos (Singleton, Observer, State, Builder…) e inyección de dependencias con
        Container.
      </Translate>
    ),
    to: '/docs/guides/decorators',
  },
  {
    title: <Translate id="home.features.resilience.title">Resiliencia</Translate>,
    description: (
      <Translate id="home.features.resilience.text">
        Retry, Timeout, CircuitBreaker y Fallback, y políticas reutilizables con definePolicy.
      </Translate>
    ),
    to: '/docs/guides/policy',
  },
  {
    title: <Translate id="home.features.concurrency.title">Concurrencia y caché</Translate>,
    description: (
      <Translate id="home.features.concurrency.text">
        Memoize, CachedFor, overlap y keyedLock, con invalidación explícita por clave.
      </Translate>
    ),
    to: '/docs/guides/concurrency',
  },
  {
    title: <Translate id="home.features.observability.title">Observabilidad opt-in</Translate>,
    description: (
      <Translate id="home.features.observability.text">
        Eventos estructurados y errores con códigos estables, sin dependencias de logging.
      </Translate>
    ),
    to: '/docs/guides/observability',
  },
  {
    title: <Translate id="home.features.deps.title">Cero dependencias</Translate>,
    description: (
      <Translate id="home.features.deps.text">
        ESM y CJS, tree-shakeable, con imports granulares por ruta.
      </Translate>
    ),
    to: '/docs/guides/granular-imports',
  },
];

function Feature({ title, description, to }: FeatureItem) {
  return (
    <div className={clsx('col col--4', styles.feature)}>
      <Link to={to} className={styles.card}>
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </Link>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
