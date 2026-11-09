# Migración de documentación y auditorías completas

Fecha: 9 de noviembre de 2026. Sustituye el estado pendiente de los informes de
consolidación y del prototipo; esos documentos conservan sus resultados históricos.

## Resultado local

`website/` utiliza Astro Starlight en lugar de Docusaurus. Se mantienen los 15
documentos españoles y sus 15 traducciones, las rutas públicas de guías, los
198 enlaces a secciones existentes y los diez módulos públicos de API.
Las 222 rutas de API anteriores en cada idioma tienen redirecciones al módulo
o símbolo correspondiente: 444 aliases, más la entrada inglesa de API compartida.

Auditorías completas, incluyendo herramientas de desarrollo y sin allowlists:

| Árbol                       | Antes de esta migración                     | Resultado local     |
| --------------------------- | ------------------------------------------- | ------------------- |
| Raíz                        | 10 moderadas y 1 baja                       | 0 alertas conocidas |
| Website                     | 15 críticas, 1 alta, 11 moderadas y 3 bajas | 0 alertas conocidas |
| Producción de la biblioteca | 0                                           | 0                   |

Evidencias: [raíz](migration-root-audit.json),
[producción](migration-root-audit-prod.json), [website](migration-website-audit.json).
El gate de seguridad ahora rechaza cualquier severidad conocida, incluidas bajas;
no se han ocultado las alertas ni excluido dependencias de desarrollo.

## Compatibilidad y decisiones

- La biblioteca conserva versión, API, exports y requisito de Node 20. No hay
  cambios de código en `src/` ni nuevas dependencias de ejecución.
- Las herramientas raíz actualizan ESLint/typescript-eslint y fijan overrides
  acotados de minimatch/esbuild. Son excepciones a rangos declarados por sus
  padres, verificadas con las comprobaciones del paquete; deben revisarse con
  futuras actualizaciones. Ver [informe de herramientas](ROOT-TOOLCHAIN-REDUCTION.md).
- La documentación requiere Node 22.23.4 o superior. Su workflow utiliza esa
  versión y sube `website/dist`; la matriz de la biblioteca sigue en Node 20/22.
- TypeDoc conserva el parche privado de compatibilidad con minimatch 11.0.5,
  aplicado explícitamente después de instalar. Se comprueban versiones, ubicación
  local y hashes completos; no es una combinación soportada oficialmente.
  [Motivo, pruebas y contrapartida](STARLIGHT-REDUCTION-RESULTS.md).
- Las fuentes Markdown se mantienen en sus ubicaciones históricas para no romper
  enlaces del repositorio. La generación adapta metadatos, orden y enlaces; falla
  ante destinos desconocidos o formatos de documento no soportados.
- El buscador Pagefind contiene 16 páginas por idioma: inicio y 15 guías.
  La API comparte HTML, navegación y búsqueda de símbolos propios de TypeDoc;
  sus comentarios conservan el idioma original y no se traducen automáticamente.
- Los aliases conservan query y fragmento enviados por el cliente. Los 198
  fragmentos de guías se verifican contra la salida anterior. Los anchors de
  secciones generadas de API pueden cambiar al usar otro renderer: reenviar el
  fragmento no garantiza que una sección antigua tenga el mismo identificador.

## Validación ejecutada

`npm ci --ignore-scripts --no-audit --no-fund` desde website, seguido de build
completo con Node 22.23.4/npm 11.21.2: correcto. El build ejecuta paridad ES/EN,
conversión de las 30 páginas, TypeDoc, 26 regresiones de recorrido de archivos,
Astro y verificación de salida.

[Resultado de salida](migration-website-output.json): 689 HTML, 10.528 enlaces,
4.565 fragmentos, 198 anchors de guías preservados, 444 aliases de API y diez
módulos, sin fallos. Se comprueban también títulos, hashes de fuentes,
selección equivalente de idioma y cobertura exacta del inventario de rutas anterior.

[Prueba HTTP local](migration-website-http.json): 689 rutas respondieron 200;
una ruta inexistente respondió 404. Se ejecutaron los scripts de los 444 aliases
en un contexto aislado de Node para comprobar redirección y enlace alternativo
con query y fragmento. Esta comprobación puntual no sustituye un navegador.

Se intentó revisar la interfaz con el navegador integrado, pero su host no estaba
disponible. No se afirma validación visual o interactiva de los buscadores.
El build conserva visible un warning de Starlight por la coincidencia del
documento personalizado 404 con su ruta especial; se sirve `404.html` y la
respuesta HTTP de una página inexistente es 404. No es una alerta de npm audit.

La raíz conserva los gates existentes: consultar los
[resultados por comando](migration-root-checks.json) y el informe de herramientas
para las pruebas ejecutadas sobre la combinación final. Los subagentes revisaron
inventario/conversión y rutas de API; se corrigieron los problemas detectados,
incluida la eliminación de puntos en slugs de versiones y la localización del
enlace a la API compartida.

También se ejecutaron build/dist ESM+CJS, las 1.115 pruebas, lint, tipos y
consumidores empaquetados con Node 20.20.2: todos correctos
([evidencia](migration-node20-checks.json)). La selección real de ESLint cubrió
los 249 archivos versionados previstos, sin omisiones ni extras
([evidencia](migration-eslint-selection.json)).

## Publicación y seguimiento

El usuario autorizó subir los cambios a GitHub. La subida actualiza la rama de
la PR #9 para mantener una única revisión de consolidación y migración.
La validación remota debe comprobarse sobre el commit final subido.
Un push a esa rama no incorpora a master ni despliega GitHub Pages.
No se ha publicado una nueva versión npm durante esta migración.

Retirar los overrides y el parche cuando los padres ofrezcan versiones
compatibles; repetir auditoría, instalación limpia y gates del paquete. Cero
avisos conocidos en esta fecha no es una certificación de ausencia de defectos.
