# Estado y próximos pasos de las auditorías

Registro actualizado el 8 de noviembre de 2026. Este índice consolida lo realizado
y lo pendiente. No representa una certificación de seguridad.

**Cierre de 2.3, 9 de noviembre:** [2.3.0 publicada y verificada en npm](../2.3.0/CLOSURE.md)
como `latest`, con procedencia, artefacto idéntico al validado en Actions y
consumidores Node 20/22 y TS 5.0/5.9 correctos. Las referencias anteriores a
prerrelease o publicación pendiente se conservan como registros históricos.

**Estado actualizado el 9 de noviembre:** la
[migración completa a Starlight](STARLIGHT-MIGRATION-RESULTS.md) deja las auditorías
completas de raíz y website sin alertas conocidas, con las excepciones de rangos
y el parche privado documentados. Conserva guías ES/EN, rutas y referencias API.
Las cifras anteriores de este índice son históricas; consultar el nuevo informe
para validación local, subida a GitHub y límites pendientes.

**Reducción adicional del 9 de noviembre:** el prototipo alcanza
[cero alertas completas con un parche privado de compatibilidad](STARLIGHT-REDUCTION-RESULTS.md).
Se verificaron instalación limpia, build y regresiones de TypeDoc. El parche
requiere mantenimiento y no cambia las alertas del árbol raíz ni de `website/`.

**Prueba inicial del 9 de noviembre:** la
[prueba aislada de Starlight](STARLIGHT-TRIAL-RESULTS.md) reduce las alertas de
tooling a dos moderadas, sin altas/críticas, y valida ES/EN y generación de API.
No se ha sustituido Docusaurus ni desplegado el prototipo.

**Estado posterior a la ejecución delegada:** consultar
[resultados de consolidación](CONSOLIDATION-RESULTS.md),
[plan ejecutado](CONSOLIDATION-PLAN.md) y
[criterios para 2.3 estable/3.0](STABILIZATION.md).

- [Resultados y comprobaciones ejecutadas](2026-11-08-RESULTS.md).
- [Plan local completado](2026-11-08-PLAN.md).
- Evidencias JSON: [producción](audit-production.json), [árbol completo](audit-full.json)
  y [consumidores](consumer-bundles.json).
- Auditoría independiente del proyecto de documentación: [website](audit-website.json).

## Qué está publicado y qué está solo preparado

| Estado                                    | Contenido                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Publicado en npm                          | `latest`: 2.3.0; `next`: 2.3.0-rc.1 histórico. La estable tiene procedencia de GitHub Actions e integridad verificada. |
| Consolidación separada de la RC publicada | Actualización de herramientas, lockfiles, workflow de seguridad e informes de este directorio. Incorporación a la rama predeterminada pendiente de revisión. |
| Sin activar todavía en GitHub             | Nuevo workflow de seguridad: requiere incorporar estos archivos a la rama predeterminada.                                                                    |
| Sin publicación adicional                 | Las mejoras de herramientas no han cambiado el contenido de RC1 en npm.                                                                                      |

## Qué significa pasar cada revisión

| Revisor                 | Qué comprueba                                                         | Estado conocido                                                                                       | Acción útil                                                                                                              |
| ----------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Bundlephobia            | Coste de incluir el paquete en un bundle                              | RC1 se construye: 37.278 bytes minificados, 10.240 gzip; cero dependencias, ESM, `sideEffects: false` | Mantener esos contratos; medir el coste de imports usados antes de optimizar. No existe un umbral universal de aprobado. |
| publint                 | Compatibilidad de publicación y metadatos de resolución               | Correcto en el paquete local validado; también se validó el candidato antes de publicarlo             | Mantenerlo como gate sobre el tarball de cada release.                                                                   |
| Are the Types Wrong     | Correspondencia entre módulos JS, declaraciones y resolución de tipos | Sin problemas detectados; fixtures NodeNext con TS 5.0.4 y 5.9.3 correctos                            | Conservar ESM/CJS y validar los subpaths mediante consumidores empaquetados.                                             |
| npm audit de producción | Dependencias de ejecución con avisos conocidos                        | Cero alertas; contrato de cero dependencias de ejecución                                              | Rechazar alertas de cualquier severidad y autodependencias.                                                              |
| npm audit completo      | Incluye herramientas de desarrollo                                    | 0 altas/críticas, 10 moderadas y 1 baja                                                               | Seguir las dos causas pendientes, sin confundir el gate por severidad con un árbol sin alertas.                          |
| npm audit de `website/` | Árbol separado de la documentación                                    | Tras la consolidación: 30 entradas, 15 críticas, 1 alta, 11 moderadas y 3 bajas                       | Bloqueos de tinypool/serialize-javascript en tooling; no pertenece al tarball npm de la biblioteca.                      |
| Snyk                    | Avisos registrados en su base de datos                                | No registra vulnerabilidades directas para RC1                                                        | Seguir revisando versiones concretas; no interpretarlo como análisis exhaustivo.                                         |
| Socket                  | Señales de riesgo del paquete                                         | Badge RC1: 81; detalle bloqueado                                                                      | Examinar sus alertas concretas cuando el panel esté accesible. No inferir causas desde el número.                        |
| npms.io                 | Disponibilidad de análisis e indicadores de calidad/adopción          | API: 404                                                                                              | Reconsultar su indexación; no añadir código para compensar una ficha inexistente.                                        |
| Packagephobia           | Tamaño de instalación                                                 | Acceso automatizado: 429                                                                              | Consultar manualmente; usar mientras tanto los metadatos npm de la versión exacta.                                       |
| OpenSSF Scorecard       | Prácticas de seguridad del repositorio                                | API del proyecto: 404                                                                                 | Considerar un análisis explícito; no asignar puntuación ni deducir configuraciones no inspeccionadas.                    |

Las distintas herramientas miden cosas diferentes. No se puede garantizar una
puntuación ni prometer que todos sus indicadores estén verdes con cambios de código.

## Mejoras priorizadas

### P1. Corregir el árbol de dependencias de la documentación

Comprobación ejecutada: `npm audit --prefix website --json`; evidencia completa
en `audit-website.json`. Las 17 entradas críticas incluyen padres afectados
indirectamente; no son 17 vulnerabilidades críticas independientes. Los avisos
críticos directos identificados por npm corresponden a `proxy-addr`, `shell-quote`
y dos avisos de `tinypool`.

- [x] Actualizar el lockfile de `website/` y estudiar cada causa que permanezca.
      Revisar Docusaurus y plugins como un conjunto compatible.
- [ ] Clasificar la exposición de servidor de desarrollo, compilación y código
      que llega al navegador. No se ha demostrado explotación en la web estática.
- [x] Validar instalación desde cero, `check:i18n`, build ES/EN, generación de API
      y enlaces antes de incorporar cambios.
- [x] Ampliar la auditoría y Dependabot al directorio `/website`.

No aplicar `npm audit fix --force` sin revisión: el resultado propone, entre otras
cosas, Docusaurus 3.7.0 aunque el manifiesto actual fija 3.10.2. Esa sugerencia
es una resolución fuera del rango vigente, no una decisión de migración validada.

Criterio: eliminar altas/críticas compatibles y documentar cualquier bloqueo
restante con su condición de explotación y prueba de compatibilidad. La actualización
compatible y su validación están completadas; los bloqueos fuera de rango siguen
pendientes. No se ha desplegado el sitio durante esta revisión.

### P1. Incorporar y activar la mejora ya validada

- [ ] Revisar e incorporar `package.json`, `package-lock.json`,
      `.github/workflows/security.yml` y estas evidencias.
- [ ] Confirmar CI remota en Node 20/22 sobre el commit final; las comprobaciones
      nuevas de este informe se ejecutaron localmente con Node 22.18.0.
- [ ] Ejecutar el workflow de seguridad y comprobar los dos JSON guardados.
- [ ] Conservar los gates existentes de publint, tipos, consumidores y tamaño;
      no sustituirlos por badges externos.

Criterio: CI del commit incorporado correcta; producción sin alertas y ninguna
alta/crítica en herramientas. Las severidades menores siguen visibles.
Estos cambios de herramientas por sí solos no exigen otra publicación npm.

### P1. Eliminar las dos causas pendientes con revisión de compatibilidad

- [ ] Seguir `minimatch`: el parche disponible exige 11.0.1 o superior, mientras
      los padres actuales declaran 10.x. Preferir un backport o rangos actualizados
      de los padres. Si se estudia un override acotado, comparar selección de archivos
      de ESLint, patrones con `partial`, rutas Windows, lint, tipos y toda la suite.
      Aun pasando estas pruebas, quedaría una excepción a los rangos soportados.
- [ ] Seguir `esbuild`: tsup 8 exige 0.27.x y el parche empieza en 0.28.1.
      Evaluar una actualización compatible de tsup cuando exista; una migración de
      herramienta necesita comparar outputs, declaraciones, tarball, tamaños y
      consumidores ESM/CJS en Node 20/22. No subir la versión mínima de Node por accidente.

Criterio para afirmar «audit completo limpio»: `npm audit --json` sin alertas,
sin omitir desarrollo, sin allowlists que oculten avisos y con las pruebas de
compatibilidad correctas. El estado actual todavía no cumple este criterio.

### P2. Reducir tamaño solo donde haya un beneficio medido

- [ ] Investigar el coste del camino opcional de cancelación compartida en
      `src/operators/memoize.ts` y `src/operators/shared-cache.ts`. Es una hipótesis
      de optimización: hoy la misma fábrica contiene las rutas normal y opcional,
      y los presupuestos existentes ya pasan. No hay una reducción demostrada.
- [ ] Comparar import raíz y subpaths documentados para casos reales; conservar
      resultados de builder, retry, memoize, semaphore, policy y decoradores.
- [ ] Si se estudia deduplicar outputs CJS para reducir instalación, medirlo
      aparte del bundle de navegador y comprobar identidad entre subpaths y estado
      compartido. No quitar CJS ni exportaciones públicas para bajar el contador.

Criterio: mejora reproducible con el mismo bundler/target; sin subir presupuestos
ni cambiar firmas, resultados síncronos, identidad de promesas, eventos o valores
predeterminados. La RC publicada seguirá teniendo sus medidas originales hasta
una futura publicación con contenido distinto.

### P2. Ampliar mantenimiento y trazabilidad

- [x] Auditar el proyecto `website/` por separado. Resultado y corrección pendiente
      descritos en la primera prioridad de este documento.
- [x] Añadir seguimiento de dependencias de `website/` a Dependabot si se decide
      mantener ese alcance: la configuración preparada sigue raíz, sitio y Actions.
- [ ] Considerar CodeQL o Scorecard si aportan hallazgos accionables. Reutilizar
      infraestructura de GitHub; no añadir dependencias de runtime.
- [ ] Revisar protecciones de rama/release y opciones de publicación por etapas
      como decisión de mantenimiento. No se han cambiado ajustes de cuentas ni se
      presupone que estén mal por no existir un informe público.

### P3. Mejorar presentación sin prometer puntuaciones

- [ ] Enlazar evidencia versionada de tamaño, tipos, seguridad y procedencia.
- [ ] Mantener ejemplos mínimos de importación y requisitos claros.
- [ ] Revisar manualmente el desglose de Socket cuando pueda consultarse.

Descargas, estrellas, número de mantenedores y antigüedad no se arreglan mediante
una actualización del código. No añadir dependencias, colaboradores ficticios,
campos de financiación inventados ni eliminar funcionalidades para mejorar una nota.

## Fuentes y alcance

- [Bundlephobia: propósito y funcionamiento](https://github.com/pastelsky/bundlephobia).
- [publint: alcance de las comprobaciones](https://publint.dev/docs/).
- [Are the Types Wrong](https://github.com/arethetypeswrong/arethetypeswrong.github.io).
- [npm: interpretación de informes](https://docs.npmjs.com/about-audit-reports/).
- [OpenSSF Scorecard](https://scorecard.dev/).

Consultar el informe fechado para versiones exactas, enlaces de avisos,
limitaciones y pruebas ya ejecutadas. La remediación y validación de `website/`,
nuevos análisis de código y experimentos de reducción de tamaño son tareas separadas;
este índice no los presenta como completados.
