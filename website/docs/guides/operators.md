---
sidebar_position: 2
---

# API funcional: Operadores y composición

Además de decoradores, puedes usar una API funcional sin decoradores: **`pipe`**, **operadores funcionales** y **`run`** para componer pipelines que se ejecutan contra un receiver (objeto) con una tupla de argumentos explícita.

## Importación

```ts
import { fallback, retry, timeout, circuitBreaker } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';
```

## Operadores disponibles

Los operadores funcionales mapean 1:1 con los decoradores de resiliencia:

- `fallback(value | fn)` — Respaldo
- `retry(options)` — Reintentos
- `timeout(ms)` — Límite de tiempo
- `circuitBreaker(options)` — Corta tras fallos
- `overlap(options)` — Deduplicación por clave
- `keyedLock(options)` — Serialización por clave
- `memoize(options)` / `memoizeWithHandle(options)` — Cache
- Y más...

## Ejemplo 1: Pipeline síncrona

Una pipeline síncrona conserva su retorno síncrono cuando sus operadores lo permiten:

```ts
const safeDivide = pipe<object, readonly [divisor: number], number>(
  function (this: object, divisor: number): number {
    if (divisor === 0) throw new Error('division by zero');
    return 100 / divisor;
  },
  fallback<object, readonly [divisor: number], number>(0)
);

// Úsalo como función normal
safeDivide.call({}, 0); // 0 (fallback)
safeDivide.call({}, 2); // 50
```

**`pipe` acepta:**
1. Una función base (receiver, args, retorno)
2. Cero o más operadores (se aplican de afuera hacia adentro)

**Generics:**
- `<ReceiverType, readonly [arg1, arg2, ...], ReturnType>`

## Ejemplo 2: Pipeline asíncrona

Cuando los operadores o el método son async, la pipeline retorna Promise:

```ts
const load = pipe<object, readonly [id: string], string>(
  async function (this: object, id: string): Promise<string> {
    return fetchProfile(id);
  },
  retry<object, readonly [id: string], string>({ attempts: 3 }),
);

const profile = await load.call({}, '42');
```

## Composición con varios operadores

El orden en `pipe` es: **el primer operador es el más externo**. Se ejecutan de afuera hacia adentro:

```ts
const safeFetch = pipe<API, readonly [id: string], User>(
  async (id: string) => API.getUser(id),
  timeout<API, readonly [id: string], User>(5000),      // 1º (más externo)
  retry<API, readonly [id: string], User>({ attempts: 3 }), // 2º
  fallback<API, readonly [id: string], User>(DEFAULT_USER)  // 3º (más interno)
);
```

Orden de ejecución: fallback → retry → timeout → método.

## Para `pipe` y `run` en detalle

Consulta las guías dedicadas: [Pipe](pipe) y [Run](run).

## Para operadores específicos

Consulta la [Referencia de operadores](/docs/api/operators) para:
- Opciones exactas de cada operador
- Manejo de errores
- Semántica de colas y deduplicación
- Handles para invalidación de caches
