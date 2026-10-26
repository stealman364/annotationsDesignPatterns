---
sidebar_position: 8
---

# Store async y contexto Node

Para almacenamiento async (local o distribuido) y propagación de contexto en Node.js, la librería ofrece dos subpaths opt-in que **no se importan automáticamente** del entrypoint raíz.

## AsyncMemoryStore

Un store local en memoria con soporte de TTL (time-to-live) y operaciones atómicas:

```ts
import { AsyncMemoryStore } from 'annotations-design-patterns/store';

const store = new AsyncMemoryStore<string, number>();

// Almacena un valor con TTL
await store.update('attempts', (value) => (value ?? 0) + 1, { ttlMs: 60_000 });

// Lee un valor
const attempts = await store.get('attempts');

// Verifica si el valor tiene TTL
await store.requireAtomicStore(store, 'circuitBreaker');
```

### Métodos

- `get(key: K): Promise<V | undefined>` — Lee un valor
- `set(key: K, value: V, options?: { ttlMs?: number }): Promise<void>` — Asigna un valor
- `update(key: K, fn: (value: V | undefined) => V, options?: { ttlMs?: number }): Promise<void>` — Actualiza aplicando una función
- `delete(key: K): Promise<boolean>` — Borra una entrada
- `clear(): Promise<void>` — Borra todo el store

### Atomicidad y TTL

`requireAtomicStore(store, operationName)` valida que el store soporte:
- **Operaciones atómicas** — `get`/`set`/`update` sin race conditions
- **TTL** — expiración automática tras `ttlMs`

Lanza si el store no garantiza ambos.

## Contexto Node con AsyncLocalStorage

`AsyncLocalStorage` (nativa en Node.js) permite asociar datos a un async context sin parámetros:

```ts
import { getRequestContext, runWithRequestContext } from 'annotations-design-patterns/node';

// En el inicio de una request HTTP
await runWithRequestContext({ requestId: 'req-42', userId: '123' }, async () => {
  // Dentro, recupera el contexto
  const ctx = getRequestContext();
  console.log(ctx?.requestId); // 'req-42'

  // Fluye a través de operaciones async
  await someAsyncFunction();
});
```

### Métodos

- `runWithRequestContext<T>(context: RequestContext, fn: () => T): Promise<T | Awaited<T>>` — Ejecuta una función con contexto
- `getRequestContext(): RequestContext | undefined` — Lee el contexto actual (o `undefined` si no hay)

### Uso en middleware

```ts
// Ejemplo con Express
app.use((req, res, next) => {
  runWithRequestContext(
    { requestId: req.id, userId: req.user?.id },
    () => next()
  );
});

// En tus handlers
app.get('/users/:id', async (req, res) => {
  const ctx = getRequestContext();
  const user = await fetchUser(req.params.id);
  console.log(`[${ctx?.requestId}] Loaded user ${ctx?.userId}`);
  res.json(user);
});
```

## Combinación: store + contexto

Puedes combinarlos para almacenar datos por request o por sesión:

```ts
import { AsyncMemoryStore } from 'annotations-design-patterns/store';
import { getRequestContext, runWithRequestContext } from 'annotations-design-patterns/node';

const requestStore = new AsyncMemoryStore<string, number>();

await runWithRequestContext({ requestId: 'req-42' }, async () => {
  const ctx = getRequestContext();
  
  // Almacena contadores por request
  await requestStore.update(`${ctx?.requestId}:calls`, (v) => (v ?? 0) + 1);
});
```

## Limitaciones

- **AsyncMemoryStore es local al proceso** — no se distribuye entre instancias. Para clustered/distributed scenarios, usa un store remoto que implemente la interfaz.
- **Node 20+ requerido** — `AsyncLocalStorage` es nativa desde Node.js 12, pero el subpath `/node` solo se publica para Node 20+.
- **No lo importes en navegador** — `AsyncLocalStorage` no existe en clientes web.

## Para tipos y métodos avanzados

Consulta la [Referencia de store](/docs/api/store) y [Referencia de node](/docs/api/node).
