# Candidato local 2.3.0-rc.0

Validado el 2026-11-07 sobre el working tree local, basado en HEAD `e45a615`.
Este informe no representa un commit, una ejecución de CI remota ni una publicación.
Se conservaron los documentos y cambios locales previos. La versión publicada de
referencia es 2.2.0; la autodependencia eliminada era local y no estaba en ese artefacto.

## Alcance implementado

| Bloque               | Resultado                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| Admisión/capacidad   | rateLimit funcional; maxEntries FIFO en memoize                                                       |
| Contexto/cancelación | executionMethod; cancelWhenUnused experimental en memoize, cachedFor y overlap share                  |
| StateMachine         | reject-stale opt-in, revisión por identidad, herencia y copias ESM/CJS                                |
| Caché externa        | asyncCachedFor experimental, codec/sobre versionado, deadlines y política explícita de fallos         |
| CAS                  | Contrato experimental y VersionedMemoryStore de referencia local                                      |
| Observabilidad       | Adaptadores estables; observeOperation experimental                                                   |
| Diagnóstico          | Handles de breaker/lock/semaphore; reset del breaker por generaciones                                 |
| Almacén              | Mutaciones de AsyncMemoryStore ordenadas por clave; clear/cleanup como barreras; lecturas sin bloqueo |

La guía completa y los límites están en [V2.3-RUNTIME.md](../../V2.3-RUNTIME.md).
Se usaron tres subagentes `gpt-6-luna` para bloques acotados, pruebas y revisión,
con integración y revisión final del coordinador.

## Comprobaciones ejecutadas

- Vitest completo con cobertura: **134 suites, 1.112 pruebas aprobadas**.
- Cobertura: statements 94,94%; branches 91,76%; functions 98,60%; lines 95,26%.
  Supera los umbrales originales, incluidos los límites absolutos de deuda.
  No se modificó `vitest.config.ts`.
- TypeScript del repositorio: `tsc --noEmit` aprobado.
- ESLint y Prettier aprobados.
- Build ESM/CJS y declaraciones aprobado.
- Paquete instalado: fixtures de runtime ESM/CJS y tipos aprobadas.
- Consumidores estrictos `.ts`/`.cts`: TypeScript 5.0.4 y 5.9.3 aprobados.
- Smoke de dist ESM/CJS aprobado; verificación de paquete aprobada (269 archivos).
- publint 0.3.22 y Are the Types Wrong 0.18.5 sin problemas reportados.
- Auditoría de `any` aprobada sin aumentar sus presupuestos: 7 apariciones en fuente,
  14 en declaraciones (el auditor también cuenta palabras en comentarios).
- Presupuestos: 96 entradas ESM/CJS y seis consumidores aprobados tras revisión localizada.
- Benchmark local: 20.000 iteraciones, 5.000 de calentamiento, siete muestras,
  Node 22.18.0/Windows x64. Es evidencia descriptiva de medias por muestra, no un
  percentil de latencia individual ni una garantía en producción.

La prueba nueva del acceso a `then` falló antes de corregir la lectura duplicada,
tanto en el propietario compartido como en el camino optimista de StateMachine.
Otra prueba reprodujo el bloqueo de lecturas dentro de un updater; la implementación
final conserva lecturas del último valor confirmado sin encolarlas.

La revisión independiente final añadió regresiones para sobres del proveedor
con getters que fallan y para sinks directos asíncronos que rechazaban sin
observador. Ambos fallos se reprodujeron antes de corregirlos. Véase
[FINAL-REVIEW.md](FINAL-REVIEW.md) para escenarios y límites de la revisión.

La documentación web tiene migración 2.3 en español e inglés, con paridad de
15 páginas por idioma. El typecheck del sitio pasa y se compilan ambos locales.
Los 12 ejemplos completos de migración y guía experimental en ambos idiomas
también compilan en TypeScript estricto contra las declaraciones de dist.

## Tamaño y artefactos

Los límites de tamaño se revisaron únicamente para las 24 entradas afectadas que
superaban el presupuesto y para el consumidor memoize. Los demás límites se conservaron.
No se regeneró globalmente la línea base.

El consumidor memoize pasa de 4.377 a 7.910 bytes minificados y de 1.664 a 2.800
bytes gzip frente a la medición local de 2.2. La nueva ruta opcional permanece
alcanzable desde su fábrica existente: es un coste material de esta RC, aunque la
opción esté desactivada. Builder y decorator no crecen en estas mediciones.

- [Mediciones por entrada](entrypoints.json)
- [Consumidores reales](consumers.json)
- [Revisión de presupuestos](budget-review.json)
- [Resumen de cobertura](coverage-summary.json)
- [Benchmark](benchmark.json)
- [Observaciones externas de 2.2.0](../../QUALITY.md)

Los resultados de Bundlephobia, Socket y otros servicios corresponden al paquete
publicado 2.2.0. No se atribuyen sus puntuaciones a esta RC sin publicar.

## Límites y migración

No hay proveedor remoto real certificado ni operadores de coordinación distribuida.
Los tokens CAS pertenecen a su almacén; sin Web Crypto, su namespace entre instancias
usa un fallback probabilístico. Las versiones de ausencia pueden generar conflictos
conservadores por escrituras en otra clave.

Cancelar o agotar un deadline no detiene por sí solo el I/O del proveedor. Las lecturas
y escrituras ya enviadas pueden terminar tarde. `bypass` tolera fallos de operaciones
del proveedor, incluidos permisos/configuración; no tolera errores de esquema/codec.

El orden corregido de mutaciones de AsyncMemoryStore cambia su temporización bajo
contención. Los updaters pueden leer el almacén, pero no deben esperar mutaciones de
su propia clave ni barreras que esperan ese updater. La cola no tiene backpressure.
Debe revisarse ese patrón en consumidores antes de una versión estable.

Las opciones nuevas preservan el camino predeterminado de los operadores existentes;
la identidad anterior de promesas no se promete al activar cancelación compartida.
Las transiciones optimistas no revierten efectos externos y su commit no despacha
el override virtual de transitionTo. No se añadieron dependencias de runtime.

Quedan fuera de esta entrega: certificación de proveedores remotos, publicación,
configuración de trusted publishing y evidencia de CI remota. La configuración de
release preparada localmente no equivale a que esas acciones hayan sucedido.
