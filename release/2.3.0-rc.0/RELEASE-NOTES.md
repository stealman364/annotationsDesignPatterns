# 2.3.0-rc.0 — notas de candidato

Prerelease de 2.3. Referencia estable de compatibilidad: 2.2.0.

## Nuevas capacidades

- `rateLimit` funcional con ventana deslizante, error reconocible entre ESM/CJS
  y `retryAfterMs`. Las admisiones síncronas permanecen síncronas; los excesos
  devuelven promesas rechazadas.
- Capacidad FIFO `maxEntries` en `memoize`, incluidas entradas pendientes.
- `executionMethod` expone el contexto y la señal efectiva mediante `pipe/run`.
- `TransitionTo` opt-in con `reject-stale`, detección A-B-A y primer commit válido.
- Adaptadores de eventos y handles explícitos para breaker, keyed lock y semaphore.

## Experimental

- `cancelWhenUnused` retira consumidores de memoize/cachedFor/overlap share y
  aborta la raíz compartida cuando desaparece el último consumidor.
- `observeOperation` mide el resultado visible de una capa.
- `asyncCachedFor`, contratos versionados y VersionedMemoryStore de referencia.
  No se certifican proveedores remotos ni coordinación distribuida.

## Correcciones y migración

AsyncMemoryStore ordena las mutaciones para impedir que un update tardío revierta
set/delete/clear. Las lecturas siguen siendo no bloqueantes. Los updaters no deben
esperar mutaciones de su propia clave ni barreras que esperan al updater.

Los getters/proxies de sobres externos que fallen se clasifican como errores
de esquema. Los valores CAS se conservan por referencia y deben tratarse como
inmutables. Los callbacks de los adaptadores y de sinks directos quedan aislados,
incluidos los rechazos asíncronos devueltos accidentalmente.

No se añaden dependencias de runtime ni se amplían las uniones cerradas de eventos,
códigos de error o capas. Las nuevas opciones no se activan por defecto.

## Tamaño y comprobaciones

El consumidor memoize crece de 1.664 a 2.800 bytes gzip en las mediciones locales.
Se revisó su presupuesto explícitamente. El informe de validación y la revisión
independiente documentan los resultados, las APIs experimentales y los límites.

- [Migración en español](../../website/docs/migration/2.3.md)
- [Validación local](VALIDATION.md)
- [Revisión final](FINAL-REVIEW.md)

Estas notas no representan una release publicada ni una ejecución de CI remota.
