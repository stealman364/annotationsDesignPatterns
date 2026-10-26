---
sidebar_position: 7
---

# Concurrencia e invalidación

Para operaciones concurrentes, usa `overlap` (deduplicación por clave), `keyedLock` (serialización por clave) o caches con handles (control explícito de invalidación).

## `overlap`: deduplicación y cola FIFO

`overlap` evita que múltiples llamadas con la misma clave ejecuten el método paralelamente. Ofrece tres modos:

### `drop` — ignora llamadas duplicadas

```ts
import { overlap } from 'annotations-design-patterns/operators';

@overlap({ mode: 'drop', key: ({ args }) => args[0] })
async getUser(id: string): Promise<User> {
  return fetch(`/users/${id}`).then(r => r.json());
}

// Primera llamada con id='42' inicia
const p1 = getUser('42');
// Segunda llamada con id='42' se ignora (devuelve undefined)
const p2 = getUser('42');
```

### `share` — comparte resultado

```ts
@overlap({ mode: 'share', key: ({ args }) => args[0] })
async getUser(id: string): Promise<User> {
  return fetch(`/users/${id}`).then(r => r.json());
}

// Primera y segunda llamada con id='42' devuelven la misma Promise
const p1 = getUser('42');
const p2 = getUser('42');
// p1 === p2 (misma Promise)
```

### `queue` (FIFO) — serializa con cola

```ts
@overlap({ mode: 'queue', key: ({ args }) => args[0] })
async saveUser(id: string, data: User): Promise<void> {
  return fetch(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(() => {});
}

// Primera llamada se ejecuta
const p1 = saveUser('42', { name: 'Ana' });
// Segunda llamada espera en cola
const p2 = saveUser('42', { name: 'Bob' });
// p2 se ejecuta solo tras p1 completar
```

## `keyedLock`: serialización por clave

`keyedLock` es similar a `overlap` con `mode: 'queue'`, pero más controlable:

```ts
import { keyedLock } from 'annotations-design-patterns/operators';

@keyedLock({ key: ({ args }) => args[0] })
async updateProfile(id: string, data: Profile): Promise<void> {
  // Solo una actualización por id concurrente
  return api.put(`/profiles/${id}`, data);
}
```

**Diferencia:** `keyedLock` hace que los waiters esperen a que la operación anterior complete; `overlap` con `queue` (aunque similar) tiene semántica ligeramente distinta en términos de abortos.

## Caches con handles: invalidación explícita

Para tener control sobre cuándo invalidar un cache, usa `memoizeWithHandle` o `cachedForWithHandle`:

```ts
import { memoizeWithHandle, overlap } from 'annotations-design-patterns/operators';

const deduplicate = overlap({ mode: 'share', key: ({ args }) => args[0] });
const cache = memoizeWithHandle({ key: (id: string) => id });

const load = pipe(
  loadProfile,
  deduplicate,
  cache.operator
);

// Úsalo
const profile = await load.call({}, '42');

// Invalida una entrada
cache.handle.invalidate('42');

// Borra todo el cache
cache.handle.clear();
```

### `MemoizeHandle<K>` API

- `invalidate(key: K): boolean` — Borra una entrada, retorna `true` si existía
- `clear(): void` — Borra todo el cache

## Resolver de clave personalizado

Tanto `overlap`, `keyedLock` como `memoizeWithHandle` aceptan un resolver de clave personalizado:

```ts
const cache = memoizeWithHandle({
  key: (user: User) => user.id  // Extrae ID de usuario
});

const deduplicate = overlap({
  mode: 'share',
  key: ({ args }) => {
    const [id, options] = args;
    return `${id}:${options?.version ?? 'default'}`;
  }
});
```

## Coexistencia con `run` y operationId

Cuando usas `run` con un `operationId` y además tienes `overlap`/`keyedLock`, el `operationId` no afecta el resolver de clave — es metadata separada para observabilidad:

```ts
const load = pipe(fetchProfile, overlap({ mode: 'share', key: ({ args }) => args[0] }));

await run(
  api,
  ['42'] as const,
  load,
  { 
    operationId: 'profile-load-1',  // Para logs/traces
    metadata: { requestId: '...' },
  }
);
```

## Nota sobre experimentales

[`switchOverlap`](/docs/guides/experimental#switchoverlap) y [`hedge`](/docs/guides/experimental#hedge-hedged-requests) son experimentales — no están estables. Usa `overlap` con `share` para la mayoría de casos de producción.

## Para detalles y límites

Consulta la [Referencia de operadores](/docs/api/operators).
