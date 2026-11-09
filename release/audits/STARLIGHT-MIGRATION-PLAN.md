# Migración completa de documentación y reducción de alertas

Fecha: 9 de noviembre de 2026. Ejecución autorizada por «complétalo» tras la
recomendación de completar Starlight y revisar el árbol principal.

## Diseño y alcance

Conservar `website/` como proyecto independiente; sustituir sus dependencias y
generador por el prototipo Starlight ya validado. Mantener los 15 documentos por
idioma en sus rutas fuente actuales para conservar enlaces del repositorio.
Generar contenido Starlight adaptando metadatos y enlaces, con las mismas URL
`/docs/...` y `/en/docs/...`. Mantener activos selector de idioma, búsqueda de
guías, imágenes, diez módulos públicos de API y referencias de migración.

La API usa el renderer HTML oficial de TypeDoc, con su búsqueda y enlaces de
regreso a las guías; las rutas antiguas tienen redirecciones estáticas al símbolo
correspondiente. No añadir plugins de Markdown ni dependencias de runtime. El
parche local revisado de TypeDoc permanece explícito y documentado. Mantener
Docusaurus añade el árbol vulnerable; integrar API con un nuevo plugin añade
otra dependencia y acoplamiento: se adopta el renderer independiente existente.

Actualizar CI de documentación a Node 22.23.4 o superior y salida `website/dist`;
mantener Node 20 para consumidores y CI de la biblioteca. Auditar el árbol raíz
por separado y corregir versiones soportadas antes de estudiar excepciones.
No publicar npm, incorporar a master ni desplegar durante este trabajo. La
autorización posterior «haz la subida entonces» permite actualizar la rama de
la PR #9 en GitHub después de validar los cambios.

## Trabajo delegado y comprobaciones

- [x] Inventariar páginas, rutas de API, enlaces y características Docusaurus.
- [x] Sustituir manifiesto/lock de website por Starlight y el parche TypeDoc
      ya revisado; instalar con Node 22.23.4 y npm 11.
- [x] Generar las 30 páginas desde fuentes conservadas, con títulos, orden,
      enlaces relativos/absolutos correctos y páginas de inicio ES/EN.
- [x] Capturar rutas antiguas y generar redirecciones a módulos y símbolos API;
      rechazar destinos sin resolver y verificar enlaces de vuelta.
- [x] Adaptar checker de idiomas y salida: paridad exacta, títulos, rutas,
      selector equivalente, Pagefind de ambos idiomas, diez módulos y aliases.
- [x] Actualizar workflow de documentación y auditoría, instrucciones y evidencias.
- [x] Agente independiente: corregir alertas del tooling raíz conservando
      outputs ESM/CJS, declaraciones, exports, bundle y Node mínimo.
- [x] Ejecutar instalación/build completo y auditoría completa en website;
      pruebas de globs, enlaces y rutas heredadas. Verificar instalación limpia.
- [x] Ejecutar lint/tipos/tests y gates de publicación/consumidores según cambie
      la raíz. Documentar cualquier bloqueo demostrado sin ocultarlo.
- [x] Revisar diff final y registrar resultados/commit local, sin publicación.

Comandos de aceptación: `npm ci --ignore-scripts`, `npm run build`,
`npm run check:i18n`, `npm run verify:typedoc`, `npm run verify`,
`npm audit --json` desde website. En raíz: auditoría completa y de producción,
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
`npm run lint:package`, `npm run types:package`, `npm run pack:verify`,
`npm run test:package`, `npm run bundle:check`, `npm run bundle:consumers`.

Se considera terminado localmente cuando todo contenido existente está servido,
las rutas heredadas tienen destino verificable, CI apunta al nuevo sitio y no
quedan avisos conocidos corregibles sin romper los contratos de la biblioteca.
Un bloqueo real debe identificarse con dependencia, aviso y prueba que impida
el cambio; no equivale a una tarea completada ni a auditoría limpia.
