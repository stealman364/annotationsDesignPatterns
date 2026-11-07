---
sidebar_position: 7
---

# Concurrencia e invalidación

Los operadores se aplican mediante pipe. Elige la capacidad según qué compartes:
ejecución, permiso o resultado cacheado.

| API | Contrato |
| --- | --- |
| overlap drop | Una ejecución por clave; las solapadas rechazan con OverlapDroppedError |
| overlap share | Comparte el trabajo activo y su resultado por clave; cada señal pertenece a su llamante |
| overlap queue | Una ejecución por clave con cola FIFO |
| keyedLock | Exclusión mutua por clave con cola y retirada de waiters abortados |
| semaphore | Hasta N ejecuciones por pool o clave, con cola FIFO |
| @Semaphore / @Mutex | Permisos por instancia; Mutex equivale a un permiso |
| @RateLimit | Ventana temporal por instancia; descarta llamadas void que exceden el límite |

No hay rateLimit funcional estable en esta versión. Su diseño permanece en
POST-2.1-RFCS.md del repositorio.

## Semaphore funcional

~~~ts
import { semaphore } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';

const limited = pipe<object, readonly [tenantId: string], string>(
  async (tenantId) => tenantId,
  semaphore({ permits: 4, maxQueue: 100, key: ({ args }) => args[0] }),
);
await run({}, ['tenant-a'], limited, { operationId: 'limited-call' });
~~~

Sin key, una pipeline aplicada comparte un pool entre receivers. El resolver
recibe contexto readonly; una key explícita de run tiene prioridad. permits
requiere entero seguro positivo y maxQueue entero seguro no negativo; omitir
maxQueue conserva la cola sin límite configurado.

Siempre se devuelve Promise y el trabajo admitido empieza síncronamente.
Cada permiso se conserva hasta que termine la ejecución interna. Una cancelación
activa deja de esperar el resultado, pero no libera trabajo que sigue ejecutando.
Una señal preabortada impide ejecutar; un waiter abortado se retira y libera
capacidad de cola. La transferencia directa mantiene FIFO sin barging.

Una cola llena rechaza con SemaphoreQueueFullError y código POLICY_ERROR.
Es un error ordinario de política: retry, fallback y un CircuitBreaker externo
pueden actuar sobre él según la composición. Filtra explícitamente esos casos
cuando lo necesites, por ejemplo mediante isFailure. La cancelación del llamante
conserva su tratamiento separado.

## Orden de composición

semaphore externo a retry conserva el permiso durante todos los intentos y
delays. retry externo a semaphore solicita un permiso de nuevo en cada intento.
La primera opción limita operaciones lógicas completas; la segunda limita cada
ejecución admitida. Elige según el recurso protegido.

@Semaphore mantiene aislamiento por instancia y adapta el mismo operador.
Los eventos existentes son semaphore.queued, semaphore.acquired y
semaphore.released; no incluyen key automáticamente.

## Overlap y keyedLock

~~~ts
import { overlap, keyedLock } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';

type Args = readonly [id: string];
const shared = pipe<object, Args, string>(
  async (id) => id,
  overlap({ mode: 'share', key: ({ args }) => args[0] }),
);
const locked = pipe<object, Args, string>(
  async (id) => id,
  keyedLock({ key: ({ args }) => args[0], maxQueue: 100 }),
);
~~~

drop rechaza llamadas solapadas; share devuelve el resultado compartido.
Con señales, dos consumidores pueden obtener promesas distintas que compiten
contra sus propias señales. Cancelar al iniciador no cancela al resto. El trabajo
puede seguir aunque todos abandonen; no hay refcount de cancelación.

overlap queue y keyedLock esperan por clave y rechazan al llenarse su cola.
El aborto de un waiter lo retira antes de ejecutar. Los nombres de sus eventos
y errores siguen siendo propios de cada operador. operationId correlaciona
observaciones; la clave de concurrencia procede del resolver o de run.key.

## Cachés con handles

~~~ts
import { cachedForWithHandle } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';

const cache = cachedForWithHandle<object, readonly [id: string], string>(
  60_000,
  { key: (id) => id, maxEntries: 1_000 },
);
const load = pipe((id: string) => id, cache.operator);

load.call({}, '42');
cache.handle.invalidate('42');
cache.handle.clear();
~~~

CacheHandle tiene invalidate(key: string): void y clear(): void. La invalidación
no cancela consumidores pendientes. Las variantes WithHandle no admiten
perReceiver y no exponen size. El default sin handle comparte por pipeline;
perReceiver true permite particiones WeakMap por objeto o función.

maxEntries conserva entradas en orden de inserción, incluyendo pendientes;
los hits no reordenan. La expulsión por capacidad emite cache.invalidated. Solo
las cachés limitadas limpian expirados en misses, sin eventos de TTL ni timers.
El TTL empieza al invocar. Los límites y las claves JSON están detallados en la
[migración a 2.2](../migration/2.2.md).

switchOverlap y hedge continúan en la entrada experimental.
[Referencia de operadores](/docs/api/operators).
