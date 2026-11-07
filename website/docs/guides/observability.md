---
sidebar_position: 6
---

# Observabilidad: errores y eventos

EventSink es el contrato pequeño y síncrono del motor. Las pipelines funcionales
contextuales emiten eventos al pasar un sink a run; logging, transporte, tracing
y métricas permanecen fuera del motor.

## Exports y logger reales

`/observability` exporta EventSink y PolicyEvent como tipos, LoggerEventSink y
NoopEventSink como clases, y los tipos StructuredLogger y LoggerEventSinkOptions.
Importa los errores desde su entrada correspondiente, como `/operators` o `/policy`.

```ts
import { LoggerEventSink } from 'annotations-design-patterns/observability';
import { retry } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';

const sink = new LoggerEventSink(
  { log: (event) => console.info(event.kind, event.operationId) },
  { operators: ['retry'] },
);
const load = pipe<object, readonly [id: string], string>(
  async (id) => id,
  retry({ attempts: 3 }),
);
await run({}, ['42'], load, {
  operationId: 'profile-42',
  metadata: { requestId: 'request-7' },
  eventSink: sink,
});
```

El primer argumento es un logger con método log; el segundo es un filtro opcional
por operador. NoopEventSink descarta eventos. Los fallos síncronos del sink no
cambian el resultado. emit no espera Promises: un sink con envíos async debe
gestionar sus propios errores y transporte.

## Esquema de PolicyEvent

Los campos superiores readonly son kind, operator, operationId, timestamp y
metadata. **timestamp es number: milisegundos Unix epoch**, no Date. operationId
no está dentro de metadata. metadata contiene los valores explícitos de run;
args, receiver y signal no se añaden automáticamente.

| Kinds | Campos adicionales superiores |
| --- | --- |
| `retry.attempt` | attempt |
| `retry.exhausted` | attempt, error |
| `timeout.triggered` | timeoutMs |
| `circuit.open`, `circuit.half_open`, `circuit.closed` | Ninguno |
| `cache.hit`, `cache.miss` | Ninguno |
| `cache.rejected` | error |
| `cache.invalidated` | key: string |
| `fallback.used` | error |
| `semaphore.queued`, `semaphore.acquired`, `semaphore.released` | Ninguno |
| `overlap.started`, `overlap.queued`, `overlap.dropped`, `overlap.completed` | key: PropertyKey |
| `keyedLock.queued`, `keyedLock.acquired`, `keyedLock.released` | key: PropertyKey |

```ts
import type { EventSink, PolicyEvent } from 'annotations-design-patterns/observability';

const sink: EventSink = {
  emit(event: PolicyEvent): void {
    if (event.kind === 'timeout.triggered') {
      console.info(event.operationId, event.timeoutMs, event.timestamp);
    }
  },
};
```

circuit.open representa una transición, no cada rechazo de un circuito abierto.
No hay un evento universal de fin de operación: overlap.completed o
semaphore.released pueden ocurrir después del aborto del llamante. No deduzcas
el ciclo completo de un request o span de un único evento de política.

## Errores y metadata

```ts
import { TimeoutError, CircuitBreakerOpenError, isPolicyError } from 'annotations-design-patterns/operators';
```

PolicyError ofrece code, metadata readonly y cause cuando se configura. Los
errores de negocio y signal.reason se propagan sin envolverse. metadata de run
no se copia automáticamente a cada error.

| Clase | Entrada | Código / datos propios |
| --- | --- | --- |
| TimeoutError | `/operators` | TIMEOUT; no añade ms a metadata por defecto |
| CircuitBreakerOpenError | `/operators` | CIRCUIT_OPEN; no añade failures/resetMs a metadata |
| SemaphoreQueueFullError | `/operators` | POLICY_ERROR; key opcional |
| OverlapDroppedError / OverlapQueueFullError | `/operators` | OVERLAP_DROPPED / OVERLAP_QUEUE_FULL; key |
| KeyedLockQueueFullError | `/operators` | KEYED_LOCK_QUEUE_FULL; key |
| InvalidPolicyError | `/policy` | INVALID_POLICY; path y metadata.path |

Para conocer el límite de un timeout, estrecha timeout.triggered y lee timeoutMs.
Semaphore y Mutex no añaden timeout de espera propio; se compone con señales y
políticas.

## Recetas externas para tracing y métricas

`examples/event-sink-recipes.ts` es un archivo del repositorio para copiar a tu
aplicación. createSpanEventSink y createCounterSink **no son exports npm**.
Aceptan callbacks síncronos y no importan SDKs.

Con un span que ya posee tu aplicación:

```ts
// Importa desde la copia de la receta en tu aplicación.
import { createSpanEventSink } from './event-sink-recipes';

const sink = createSpanEventSink((name, attributes, timestampMs) => {
  span.addEvent(name, attributes, timestampMs);
});
```

OpenTelemetry acepta nombre, atributos y tiempo en addEvent; TimeInput admite
milisegundos epoch. La aplicación mantiene la propiedad del span y decide cuándo
llamar end. Consulta [Span](https://open-telemetry.github.io/opentelemetry-js/interfaces/_opentelemetry_api._opentelemetry_api.Span.html) y
[TimeInput](https://open-telemetry.github.io/opentelemetry-js/types/_opentelemetry_api._opentelemetry_api.TimeInput.html).

La receta de contador mantiene labels de cardinalidad limitada:

```ts
import { createCounterSink } from './event-sink-recipes';

const sink = createCounterSink((kind, { operator }) => {
  counter.inc({ kind, operator });
});
```

Configura el contador que posee la aplicación con labelNames kind/operator.
El cliente documenta labels tipados mediante as const. No conviertas IDs, claves,
argumentos o metadata en labels. Véase la documentación oficial de
[labels tipados](https://github.com/prometheus/client_js#strongly-typed-labels).

La librería no inicia ni termina spans y no registra métricas globales. Mantén
SDKs y exporters en la aplicación o en un adapter opcional separado.
[Referencia exacta de observability](/docs/api/observability).
