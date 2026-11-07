---
sidebar_position: 2
---

# API funcional: operadores y composición

pipe aplica operadores a una función y run añade contexto explícito con
operationId, metadata, EventSink, key y AbortSignal. Los operadores son funciones
componibles independientes de los decoradores de clase.

~~~ts
import {
  fallback, retry, timeout, circuitBreaker, semaphore, memoize, cachedFor,
} from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';
~~~

También existen overlap, keyedLock, memoizeWithHandle y cachedForWithHandle.
Los experimentales tienen su entrada propia.

## Composición y retorno

El primer operador es el más externo. Esta pipeline entra en fallback, retry,
timeout y finalmente el método; los resultados vuelven hacia afuera.

~~~ts
const load = pipe<object, readonly [id: string], string>(
  async (id) => id,
  fallback('recovered'),
  retry({ attempts: 3, delayMs: 100, backoffFactor: 2 }),
  timeout(5_000),
);
await run({}, ['42'], load, { operationId: 'load-42' });
~~~

Una pipeline síncrona conserva su retorno síncrono cuando los operadores lo
permiten; timeout y semaphore siempre devuelven Promise. Receiver y tupla de
argumentos se conservan. Los genéricos son Receiver, Args readonly y Result.

## Retry y CircuitBreaker

Retry permite maxDelayMs y jitter none/full/equal. El delay exponencial se limita
por el máximo portable y el cap configurado antes del jitter. none es el default.
Un delay final cero usa una microtask cancelable.

CircuitBreaker admite isFailure(error, info) síncrono. info contiene datos
readonly de la invocación; false ignora sin incrementar ni resetear fallos y
sin convertir el error en éxito. HALF_OPEN libera la probe sin cerrar. Caller
cancellation y generaciones obsoletas no pasan por el predicado.

~~~ts
const protectedRead = circuitBreaker<object, readonly [id: string], string>({
  failures: 5,
  resetMs: 30_000,
  isFailure: (error, info) => info.args[0] !== 'optional' && error instanceof Error,
});
~~~

El error original sigue rechazando si se ignora. Si el predicado lanza, rechaza
con ese error de decisión. Las opciones también llegan a los decoradores y
definePolicy; describe solo muestra las nuevas opciones cuando se configuran.

## Caché y capacidad

memoize/cachedFor comparten por pipeline por defecto. perReceiver true permite
aislar objetos y funciones; un receiver primitivo produce TypeError. Las variantes
WithHandle ofrecen invalidate/clear y no admiten ese flag.

cachedFor acepta maxEntries entero seguro positivo: FIFO por inserción, sin
reordenar hits. Pending entries cuentan; eviction no cancela consumidores.
Las cachés limitadas limpian expirados en misses sin timers. TTL empieza al
invocar, Infinity no caduca y cachedFor(0) funcional desactiva la reutilización.

La clave default sigue siendo JSON.stringify(args), con sus colisiones y
restricciones; aporta key para identificar valores especiales o entidades.
[Contratos y tabla de claves](../migration/2.2.md).

## Semaphore y cancelación

semaphore limita ejecuciones por pool o key, mantiene FIFO y retira waiters
abortados. Una cancelación activa rechaza al llamante con signal.reason; el
permiso dura hasta que termine el trabajo interno. Un SemaphoreQueueFullError
puede ser tratado por otras políticas como error normal.

semaphore externo a retry mantiene permiso durante intentos y delays; retry
externo solicita permiso en cada intento. La [guía de concurrencia](concurrency.md)
describe estas diferencias con overlap, keyedLock, Mutex y RateLimit.

La cancelación individual no activa fallback ni altera el contador del breaker.
Las operaciones compartidas aíslan señales por consumidor y pueden continuar
aunque todos abandonen. Un timeout no fuerza la terminación de código que ignore
la señal. Consulta [Pipe](pipe.md), [Run](run.md) y la
[referencia de operadores](/docs/api/operators).
