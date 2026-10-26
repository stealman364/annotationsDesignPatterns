---
sidebar_position: 6
---

# Observabilidad: errores y eventos

La librería emite eventos estructurados desde operadores funcionales sin añadir dependencias de logging. Los decoradores pueden capturar errores específicos como `TimeoutError` o `CircuitBreakerOpenError`.

## Errores específicos

### `PolicyError`

Clase base para errores de política. Expone:

- `code: PolicyErrorCode` — código estable (`'TIMEOUT'`, `'CIRCUIT_OPEN'`, `'SEMAPHORE_TIMEOUT'`, etc.)
- `cause: unknown` — error original que causó el rechazo
- `metadata: Readonly<Record<string, unknown>>` — contexto de la operación

```ts
import { TimeoutError, CircuitBreakerOpenError } from 'annotations-design-patterns/observability';

try {
  await method.call(receiver);
} catch (e) {
  if (e instanceof TimeoutError) {
    console.log(`Timeout tras ${e.metadata.ms}ms`);
  } else if (e instanceof CircuitBreakerOpenError) {
    console.log('Circuito abierto');
  }
}
```

### `TimeoutError`

Se lanza cuando un método async excede el límite de `@Timeout(ms)`.

- `code: 'TIMEOUT'`
- `metadata: { ms: number }` — límite en milisegundos

### `CircuitBreakerOpenError`

Se lanza cuando el circuito se abre tras N fallos consecutivos.

- `code: 'CIRCUIT_OPEN'`
- `metadata: { failures: number, resetMs: number }`

### `SemaphoreTimeoutError`, `MutexTimeoutError`

Se lanzan si se alcanza el timeout esperando un slot en `@Semaphore` o `@Mutex`.

## Eventos con `LoggerEventSink`

La API funcional puede emitir eventos estructurados a través de un sink personalizado:

```ts
import { LoggerEventSink } from 'annotations-design-patterns/observability';
import { retry } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';

const events = new LoggerEventSink({
  log: (event) => console.info(event)
});

const load = pipe(fetchProfile, retry({ attempts: 3 }));

await run(api, ['42'] as const, load, {
  operationId: 'profile-42',
  metadata: { requestId: 'request-7' },
  eventSink: events,
});
```

### Estructura de evento

Cada evento incluye:

```ts
{
  type: string;                              // 'retry-attempt', 'circuit-open', etc.
  timestamp: Date;
  metadata: {
    operationId: string;
    requestId?: string;
    args: readonly unknown[];
    // + metadatos específicos del evento
  };
}
```

### Tipos de evento

- `retry-attempt` — reintento en curso
- `circuit-open` — circuito abierto, operación rechazada
- `timeout-exceeded` — timeout alcanzado
- `fallback-triggered` — fallback devuelto
- Y más según los operadores activos

## Sink personalizado

Implementa la interfaz `EventSink` para capturar eventos en tu sistema de logging:

```ts
import type { EventSink, ResilienceEvent } from 'annotations-design-patterns/observability';

class MyEventSink implements EventSink {
  emit(event: ResilienceEvent): void {
    // Envía a tu sistema de logging (Winston, Pino, etc.)
    logger.info(`[${event.type}]`, {
      operationId: event.metadata.operationId,
      ms: event.metadata.ms,
    });
  }
}

await run(api, args, pipeline, {
  operationId: 'my-op',
  eventSink: new MyEventSink(),
});
```

## Ciclo de vida de errores

**Los errores de usuario se propagan sin envolverse.** Solo `PolicyError` enuelve operaciones que fallan por política (timeout, circuit breaker, etc.):

```ts
try {
  await method.call(receiver);
} catch (e) {
  if (e instanceof TimeoutError) {
    // Causado por timeout, no por el usuario
  } else if (e instanceof TypeError) {
    // Error de usuario: se propaga tal cual
  }
}
```

## Para tipos exactos y eventos detallados

Consulta la [Referencia de observability](/docs/api/observability).
