---
sidebar_position: 4
---

# Run: ejecución con contexto y observabilidad

`run` invoca una pipeline preparada con `pipe`, conservando el receiver y la tupla de argumentos tipados, con soporte opcional para observabilidad (eventos estructurados).

## Sintaxis básica

```ts
import { run } from 'annotations-design-patterns/run';
import { pipe } from 'annotations-design-patterns/pipe';

const format = pipe<Receiver, readonly [id: string], string>(
  function (id: string) {
    return `account:${id}`;
  },
);

const result = run(receiver, ['42'] as const, format);
// result: string = 'account:42'
```

## Generics

```ts
run<Receiver, Args extends readonly unknown[], Return>(
  receiver: Receiver,
  args: Args,
  pipeline: (this: Receiver, ...args: Args) => Return,
  options?: RunOptions<Return>
): Return | Promise<Return>
```

**Args debe ser una tupla readonly tipada** (usa `as const` al pasar el array).

## Con observabilidad

El cuarto parámetro `RunOptions` activa contexto de observabilidad (opcional):

```ts
import { LoggerEventSink } from 'annotations-design-patterns/observability';
import { run } from 'annotations-design-patterns/run';

const events = new LoggerEventSink({
  log: (event) => console.info(event)
});

const load = pipe(
  async (id: string) => fetchProfile(id),
  retry({ attempts: 3 }),
);

await run(
  {},
  ['42'] as const,
  load,
  {
    operationId: 'profile-42',
    metadata: { requestId: 'request-7' },
    eventSink: events,
  }
);
```

## Flujo

1. **Sin observabilidad (3 parámetros):** `run(receiver, args, pipeline)` simplemente invoca la pipeline.
2. **Con observabilidad (4 parámetros):** cada operador emite eventos (`retry-attempt`, `timeout-exceeded`, etc.) al sink configurado.

Los eventos incluyen:
- Tipo (`retry-attempt`, `circuit-open`, etc.)
- Timestamp
- Contexto (`operationId`, `metadata`, tupla de argumentos)

## Ejemplo completo

```ts
import { run } from 'annotations-design-patterns/run';
import { pipe } from 'annotations-design-patterns/pipe';
import { retry, fallback } from 'annotations-design-patterns/operators';
import { LoggerEventSink } from 'annotations-design-patterns/observability';

const api = { baseUrl: 'https://api.example.com' };

const getUser = pipe<typeof api, readonly [id: string], User>(
  async function (id: string): Promise<User> {
    const res = await fetch(`${this.baseUrl}/users/${id}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  retry({ attempts: 3, delayMs: 100 }),
  fallback<typeof api, readonly [id: string], User>({ name: 'Unknown' } as User),
);

const sink = new LoggerEventSink({
  log: (event) => console.log(`[${event.type}]`, event.metadata),
});

const user = await run(
  api,
  ['42'] as const,
  getUser,
  { operationId: 'fetch-user', eventSink: sink }
);
```

## Para tipos y opciones

Consulta la [Referencia de run](/docs/api/run).
