---
sidebar_position: 3
---

# Pipe: composición de operadores

`pipe` es la función base que toma un método y cero o más operadores funcionales, retornando una función pipeline que conserva los tipos de receiver, argumentos y retorno.

## Sintaxis

```ts
import { pipe } from 'annotations-design-patterns/pipe';

const pipeline = pipe<Receiver, readonly [Arg1, Arg2], Return>(
  function methodOrPipeline(this: Receiver, arg1: Arg1, arg2: Arg2): Return | Promise<Return> {
    // tu lógica
  },
  operator1<Receiver, readonly [Arg1, Arg2], Return>(...),
  operator2<Receiver, readonly [Arg1, Arg2], Return>(...),
);
```

**Importante:** todos los operadores en la misma pipeline deben tener **los mismos genéricos** — el receiver, la tupla de argumentos y el tipo de retorno no pueden cambiar entre operadores.

## Ejemplo: pila de resiliencia

```ts
const safeFetch = pipe<object, readonly [url: string], Promise<Response>>(
  async function (this: object, url: string): Promise<Response> {
    return fetch(url);
  },
  timeout<object, readonly [url: string], Promise<Response>>(5000),
  retry<object, readonly [url: string], Promise<Response>>({ attempts: 3 }),
  fallback<object, readonly [url: string], Promise<Response>>(
    new Response('{}', { status: 503 })
  ),
);

// Úsalo
await safeFetch.call({}, 'https://api.example.com/data');
```

## Orden de operadores: de afuera hacia adentro

El **primer operador en la lista es el más externo**. La ejecución fluye:

1. Llamada externa → primer operador (más externo)
2. → segundo operador
3. → ... más operadores ...
4. → método base (más interno)
5. ← respuesta

En el ejemplo anterior:
- `timeout` es el más externo (detecta operaciones lentas)
- `retry` reintenta tras timeout
- `fallback` devuelve valor por defecto si todo falla
- El método `fetch` es el más interno

## Conserva sincronía cuando es posible

Si todos los operadores y el método base son síncronos, la pipeline retorna sincronía:

```ts
const compute = pipe<object, readonly [n: number], number>(
  function (n: number) {
    return n * 2;
  },
  fallback<object, readonly [n: number], number>(0),
);

// Retorna number, no Promise
const result = compute.call({}, 5); // 10
```

Si cualquier operador o el método es async, la pipeline retorna Promise.

## Invocación

La pipeline retornada se invoca como una función normal, con `.call(receiver, ...args)`:

```ts
const result = await pipeline.call(receiver, arg1, arg2);
```

Para invocar con argumentos tipados y contexto de observabilidad integrado, usa [`run`](run).

## Para detalles de composición

Consulta la [Referencia de pipe](/docs/api/pipe).
