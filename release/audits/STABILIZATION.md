# Cierre de 2.3 y decisión sobre 3.0

Este documento define criterios de aceptación, no anuncia otra publicación.
El paquete disponible sigue siendo `2.3.0-rc.1` en `next` y `2.2.0` en `latest`.

## La biblioteca no necesita más funciones para cerrar 2.3

El trabajo inmediato es consolidar contratos, compatibilidad y mantenimiento.
Añadir funciones, proveedores o dependencias sin un caso concreto aumentaría el
alcance de validación sin resolver los pendientes actuales.

## Lista de cierre

| Criterio | Evidencia o pendiente |
| --- | --- |
| Pruebas internas con herramientas actualizadas | 135 archivos y 1.115 pruebas correctas en Node 22.18.0 y Node 20.20.2 localmente. |
| Cobertura y límites existentes | Superados en la revisión anterior con las herramientas actualizadas; sin cambios posteriores de runtime. |
| Tipos y paquete | publint, ATTW, fixtures TS 5.0/5.9 y consumidores empaquetados correctos en la revisión anterior. |
| RC publicada instalada desde npm | Huella verificada; consumidores aislados correctos en Node 20.20.2 y 22.18.0, fixture ESM/CJS 2.3 y pipeline retry/memoize/rateLimit. |
| Revisar el commit final en remoto | Pendiente hasta incorporar los cambios actuales y comprobar CI Node 20/22. No confundir ejecución local con Actions. |
| Dependencias de la documentación | Seguir el resultado de la consolidación y su JSON específico; separado del tarball de la biblioteca. |
| Uso externo de la RC | Pendiente: registrar proyectos, versiones de Node/TS, composición real y cualquier incidencia. Un fixture aislado es evidencia técnica, no adopción externa. |
| Condiciones experimentales | Conservar las etiquetas y límites de cancelación compartida, caché externa/CAS y observación de operaciones. |
| Decisión de publicar estable | Revisar las incidencias de RC y el commit final antes de preparar una versión nueva. Esta tarea no mueve dist-tags. |

## Validación de consumidores antes de estable

Registrar al menos un caso concreto de uso funcional y otro de decoradores
TC39, con el paquete de npm y los compiladores realmente utilizados. Verificar
sincronía e identidad de promesas cuando el consumidor dependa de ellas; probar
la composición usada de timeout/retry/fallback/breaker y sus eventos.

Para cancelación compartida, comprobar consumidores con y sin señal, última
retirada, reemplazo y settlement tardío. Para StateMachine, usar finalizaciones
invertidas y modificaciones manuales. Las pruebas internas ya cubren estos
contratos; aquí se busca confirmar integración en escenarios de aplicación.

## Promoción de APIs experimentales

- Cancelación compartida: exigir experiencia de integración que confirme la
  procedencia de señales, reentrancia y diferencia entre cancelación observable
  y ejecución física.
- Caché externa/CAS: exigir pruebas de un proveedor concreto con expiración,
  fallos I/O, escrituras tardías y capacidades reales. El store de memoria no
  certifica coordinación distribuida.
- Observación: confirmar que la duración y el resultado medidos corresponden a
  la capa observada y que las etiquetas tienen cardinalidad controlada.

Si esa evidencia falta, las APIs pueden seguir experimentales en 2.3. Una
publicación estable del paquete no convierte automáticamente cada API en estable.

## Cambios que podrían justificar 3.0

| Posible decisión incompatible | Evidencia necesaria antes de proponerla |
| --- | --- |
| Unificar o reducir firmas/opciones de operadores | Casos reales de confusión o limitaciones; alternativa compatible evaluada; migración explícita. |
| Rediseñar cancelación/contexto | Defecto o uso relevante que el contrato actual no pueda resolver de forma compatible. |
| Retirar APIs o exportaciones deprecadas | Deprecación previa, sustitución documentada y ejemplos de migración. |
| Retirar CJS o cambiar requisitos de Node/TS | Necesidad demostrada, inventario de consumidores afectados y beneficio medido. No es una recomendación actual. |

No justifican por sí solos 3.0: actualizar herramientas, corregir vulnerabilidades
de documentación, mejorar ejemplos, reducir tamaño sin cambiar comportamiento,
añadir opciones compatibles o conseguir una puntuación externa mayor.

## Disciplina de publicación

No modificar la RC ya publicada ni reutilizar su versión. Una corrección del
contenido distribuido necesita una nueva versión, con gates sobre su tarball
exacto. Las correcciones exclusivas de herramientas o del sitio no requieren
por sí solas publicar otra versión de la biblioteca.
