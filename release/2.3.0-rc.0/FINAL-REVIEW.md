# Revisión independiente del candidato integrado

Fecha: 2026-11-07. Alcance: working tree local de `2.3.0-rc.0`, sin commit ni
publicación. Tres revisores `gpt-6-luna` recibieron áreas distintas de sus
implementaciones anteriores. Los documentos se usaron como contratos a
contrastar, no como evidencia de corrección.

## Resultado

Viable como candidato de 2.3 con las APIs indicadas como experimentales. La
revisión encontró dos fallos reproducibles en las fronteras de proveedor y
observabilidad, corregidos con regresiones. No encontró otros defectos reproducibles
en las áreas examinadas. Esto no demuestra ausencia de carreras ni sustituye
pruebas de proveedores remotos o CI.

### Corregido: inspección del sobre fuera de la frontera de errores

Severidad media, API experimental. En `src/experimental/async-cached-for.ts`,
un proxy del proveedor que lanzaba al leer `version`, comprobar la propiedad
`payload` o leer su getter rechazaba con un Error sin marca, en vez de un
`AsyncCacheError` con fase `schema`. El usuario no podía clasificar el fallo
según el contrato. No se producía un fallback de negocio indebido.

Tres pruebas nuevas reprodujeron el error antes del cambio. Ahora la inspección
y captura del payload ocurren dentro de la frontera de esquema, conservando
el error original en `cause`. Se comprobó con ambas políticas `bypass/reject`:
el error de esquema rechaza, no ejecuta negocio, no escribe y no se informa
como si fuera un fallo I/O tolerable.

Pruebas: `tests/operators/async-cached-for.test.ts`. Suite enfocada: 30 pruebas
aprobadas. Suite completa posterior: 133 archivos, 1.106 pruebas aprobadas y
umbrales originales de cobertura superados.

### Corregido: rechazos de un EventSink directo sin observar

Severidad media, aislamiento de observabilidad. `EventSink.emit(): void` acepta
implementaciones async en TypeScript. `emitPolicyEvent` descartaba su resultado:
un rechazo del sink llegaba a `unhandledRejection`, aunque el negocio devolviera
su resultado. Dependiendo de la política de Node, podía terminar el proceso.
El revisor reprodujo el fallo con un evento de timeout y un sink async.

Las regresiones de `tests/core/event-sink-errors.test.ts` reprodujeron tanto el
thenable descartado como el rechazo nativo sin manejar. Ahora la frontera directa
observa retornos asíncronos accidentales sin esperarlos. Se conserva `void`, el
orden de emisión y el resultado síncrono de negocio. Se probaron callbacks con
primitivos, funciones, getters que lanzan y rechazos nativos.

Después de ambos arreglos: **134 suites, 1.112 pruebas aprobadas**, con los
umbrales originales de cobertura intactos. La falta de espera del sink sigue
siendo un contrato sin backpressure; no se garantiza flushing al salir del proceso.

### Aclarado: propiedad de los valores CAS

El snapshot de `VersionedMemoryStore` congela sus metadatos, pero conserva los
valores por referencia. Mutar un objeto desde fuera del store no avanza su
versión. Se aclaró en los tipos, JSDoc y documentación de ambos idiomas: los
valores deben tratarse como inmutables o copiarse en la frontera de aplicación.
No se añadió clonación genérica ni se prometió aislamiento profundo.

## Áreas revisadas sin nuevos hallazgos reproducibles

- Cancelación compartida y contexto: cinco suites enfocadas, 60 pruebas. Reserva
  reentrante, última retirada antes de abort, reemplazos, identidad por defecto,
  resultados síncronos y procedencia de señales con timeout/retry/fallback/breaker.
- Handles, observabilidad y memoria: cuatro suites enfocadas, 52 pruebas. Reset
  por generaciones, callbacks reentrantes, métodos distintos en una misma cola,
  permisos físicos hasta settlement, aislamiento de callbacks y lecturas dentro
  de un updater sin bloqueo.
- StateMachine y CAS: lectura de implementación y pruebas de finalizaciones
  invertidas, A-B-A, mismo estado, herencia, copias de módulo, TTL y versiones.

No se hizo fuzzing con señales impostoras ni una prueba exhaustiva del
planificador. Ningún proveedor remoto fue certificado.

## Decisiones cerradas para el candidato

- Mantener `memoize` en su fábrica existente, con el coste medido de 2.800 bytes
  gzip en el consumidor de referencia. No se encontró una reducción sencilla
  sin cambiar la API o separar entradas. Se conserva el presupuesto específico
  revisado; los demás consumidores conservan sus límites.
- Mantener el orden de mutaciones de AsyncMemoryStore como corrección de
  atomicidad. Preservar las lecturas sin espera. Advertir expresamente de la
  temporización y de updaters que esperan mutaciones de su propia clave o barreras.
- Mantener cancelación compartida, caché externa/CAS y observeOperation como
  experimentales; no inferir coordinación distribuida de un contrato local.
- Mantener el paquete como `2.3.0-rc.0` hasta validar el commit elegido en CI.

## Pendiente externo

La revisión de CI remota necesita un commit concreto que contenga estos cambios.
No se creó ni envió uno. Tampoco se creó tag, release ni publicación npm, ni se
configuraron permisos de cuentas. La documentación y las notas quedan preparadas
localmente para la siguiente revisión.
