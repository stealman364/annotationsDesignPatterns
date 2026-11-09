# Reducción adicional del prototipo Starlight

Fecha: 9 de noviembre de 2026. Alcance: `experiments/starlight-docs`, privado.

La auditoría completa pasa de **dos entradas moderadas a cero alertas conocidas**,
sin omitir desarrollo ni ocultar avisos. Evidencia:
[auditoría completa](starlight-audit-patched.json). Esto requiere un parche local
de compatibilidad: no equivale a soporte oficial de TypeDoc para minimatch 11 ni
a una garantía de ausencia de vulnerabilidades.

## Cambio y contrapartida

TypeDoc 0.28.20 declara minimatch 10.x. El override acotado a minimatch 11.0.5
elimina el aviso, pero por sí solo falla con `mini.matchOne is not a function`
en el recorrido recursivo. Se reprodujo ese fallo antes de aplicar la adaptación.

`scripts/prepare-typedoc.mjs` sustituye esa llamada por el matcher público parcial.
Un matcher separado con `flipNegate: true` conserva la semántica anterior de
recorrido de directorios; la selección ordinaria de archivos mantiene la negación.
No se fuerza este override en ESLint, en la biblioteca ni en Docusaurus.

El script comprueba TypeDoc 0.28.20 y minimatch 11.0.5, instalación dentro del
prototipo y hashes del archivo completo `typedoc/dist/node-utils.js`:

- Original: `44982772d80190c9065e29081826b9586c2f65ab71a8d4dd0bbfdeecfecd9ebc`.
- Adaptado: `2eba941168420daca6cd489a8a9e3a24c9a3f3382c6a767a19361d17f6b0c34f`.

No hay hook de instalación. La preparación es explícita en los comandos de API
y validación. Cambiar versiones o contenido exige revisar el parche; entradas
desconocidas fallan antes de escribir. Se comprobó idempotencia y rechazo sin
modificar archivos para fuente desconocida, versión incorrecta y dependencia
resuelta desde un directorio padre: [resultados](starlight-patch-guards.json).

## Comprobaciones ejecutadas

- Node 22.23.4 y npm 11.21.2; requisitos propios del prototipo, sin cambiar Node
  mínimo de la biblioteca.
- `npm run build:all`: TypeDoc sin warnings, 26 casos de glob correctos, build
  ES/EN, 213 HTML, 6.968 enlaces locales y diez módulos públicos; cero fallos del
  verificador de salida.
- Instalación independiente desde cero en una réplica ignorada del proyecto:
  `npm ci --ignore-scripts --no-audit --no-fund`, seguida de `npm run build:all`.
  Ambos comandos correctos; no se copiaron dependencias instaladas del proyecto.
- `npm audit --json` también en esa réplica: salida 0, cero alertas en el árbol
  completo (490 dependencias según los metadatos de npm).
- Los 26 casos permanentes contrastan el recorrido real de TypeDoc con una
  fixture capturada con TypeDoc 0.28.20/minimatch 10.2.6 sin modificar. Incluyen
  recursión, negación, llaves, extglob, directorios ocultos, node_modules y
  devolución opcional de directorios. Se usa un directorio nuevo por ejecución.
- Tres modelos JSON completos de TypeDoc idénticos byte a byte antes/después:
  configuración de diez entrypoints; siete entrypoints explícitos más
  `src/public/*.ts` excluyendo `**/public/types.ts`; y `src/**/index.ts` más
  `src/public/{operators,pipe,run}.ts`. Cada ejecución usó su configuración con
  `typedoc --options <configuración> --json <salida>`.
  [Hashes y resumen](starlight-compatibility.json).
- Comparación puntual de 14 patrones sobre 118 rutas, con y sin matching parcial:
  3.304 resultados iguales. La estructura de prefijos de `**/*.{ts,tsx}` sí cambia
  por deduplicación; no cambian sus prefijos distintos ni los resultados probados.

Los modelos originales, capturas del matcher y configuraciones auxiliares de esa
comparación puntual permanecen en `.validation/`, ignorado; no son una suite
versionada ni prueba exhaustiva entre plataformas. Los casos permanentes y su
baseline sí están versionados. Las cadenas normalizadas de unidad Windows y UNC
no demuestran recorrido real de un recurso UNC ni soporte de globs con backslash.
Un subagente independiente revisó la adaptación y sus guardas sin encontrar
problemas materiales pendientes.

## Límites y siguiente decisión

Permanece visible el warning de Starlight por una entrada personalizada `docs/404`
ausente; Astro sí genera `404.html`. No se ha ocultado para aparentar un build
sin advertencias. La API continúa siendo HTML independiente, con búsqueda propia,
fuera de la navegación y del índice Pagefind de Starlight.

El árbol raíz conserva sus 11 alertas conocidas y `website/` sus 30, según la
consolidación anterior; no se ha vuelto a certificar esos árboles en esta prueba.
No hay cambios de runtime, publicación npm, sustitución del sitio ni despliegue.

Antes de migrar documentación, decidir si se acepta mantener este parche privado
o se espera una versión de TypeDoc compatible oficialmente. Preferir retirar la
adaptación cuando exista solución upstream, repitiendo las comprobaciones. Un
contador limpio por sí solo no justifica adoptar la migración completa.

Fuentes primarias:
[aviso minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249),
[cambios de minimatch 11](https://github.com/isaacs/minimatch/blob/v11.0.5/changelog.md),
[TypeDoc](https://github.com/TypeStrong/typedoc).
