# Resultado de la consolidación

Fecha: 8 de noviembre de 2026. Ejecución delegada a tres agentes `gpt-6-luna`
con archivos y tareas separados; integración revisada por el agente principal.

## Seguridad de dependencias

| Proyecto | Antes | Después |
| --- | --- | --- |
| Raíz de la biblioteca | 21 entradas: 7 altas, 13 moderadas, 1 baja | 11: 0 altas/críticas, 10 moderadas, 1 baja |
| Documentación `website/` | 47: 17 críticas, 13 altas, 14 moderadas, 3 bajas | 30: 15 críticas, 1 alta, 11 moderadas, 3 bajas |

El resultado del sitio se comprobó también contra el lockfile con
`npm audit --prefix website --package-lock-only --json`. La evidencia original
se conserva en `audit-website.json` y la posterior en `audit-website-after.json`.
Las entradas incluyen propagación a paquetes padres, no vulnerabilidades únicas.

El refresco mantiene Docusaurus 3.10.2 y los rangos del manifiesto. Los bloqueos
altos/críticos restantes del sitio tienen estas causas:

- `@docusaurus/core@3.10.2` declara `tinypool: ^1.0.2`, resuelto en 1.1.1.
  Los avisos [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3)
  y [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)
  requieren salir de 1.x para usar una versión corregida. Afectan a opciones
  de workers y condiciones de contaminación de prototipos; no se ha demostrado
  una ruta explotable en este repositorio ni en su web estática publicada.
- `copy-webpack-plugin@11.0.0` y `css-minimizer-webpack-plugin@5.0.1` requieren
  `serialize-javascript` 6.x, resuelto en 6.0.2. El aviso
  [GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq)
  incluye versiones hasta 7.0.2. Una corrección requiere revisión de los padres
  o una excepción de compatibilidad; no se aplicó un override fuera de rango.

No se usó `npm audit fix --force`, no se degradó Docusaurus y no se rebajó el
umbral del sitio. Su job de seguridad debe seguir fallando por estas alertas.
Esto **no** constituye una auditoría global sin alertas ni el cierre de 2.3 estable.

## Automatización

- Workflow de seguridad con matriz raíz/sitio, `fail-fast: false`, permisos de
  lectura, instalación sin scripts y artefactos independientes por proyecto.
- Ejecución semanal, manual y en PRs que cambien los manifiestos/lockfiles.
- Producción de la biblioteca rechaza cualquier alerta; los árboles completos
  rechazan altas/críticas y conservan las inferiores en sus informes.
- Dependabot incluye ahora `/website` además de raíz y GitHub Actions.
- Ambos YAML se analizaron con js-yaml y pasaron Prettier.

## Compatibilidad comprobada

- Instalación desde cero del sitio correcta; paridad de 15 documentos ES/15 EN
  y compilación completa de ambos idiomas correctas, incluida generación TypeDoc.
  `docusaurus-plugin-typedoc` resuelve 1.4.3 dentro del rango existente.
- Suite de la biblioteca con herramientas actualizadas en Node 20.20.2:
  135 archivos y 1.115 pruebas correctas. Node 22.18.0 y cobertura ya validados
  en el informe anterior; no se cambió `src/` durante la consolidación.
- Consumidor aislado instalado desde npm con
  `npm install --ignore-scripts --no-audit --no-fund annotations-design-patterns@2.3.0-rc.1`.
- Antes de instalar se verificaron `latest: 2.2.0`, `next: 2.3.0-rc.1` y la huella
  `0981a00459ed268d6f53672683c617621b1e879d`.
- El fixture `scripts/fixtures/v23-runtime.mjs` y un pipeline público de
  retry/memoize/rateLimit pasaron con Node 20.20.2 y Node 22.18.0, ESM/CJS.
- El consumidor temporal se eliminó después de validar su ruta dentro del
  directorio temporal del sistema. No se instalaron dependencias de runtime.

## Pendientes que no se sustituyen con estas pruebas

Cerrar los bloqueos de proveedores del sitio, comprobar CI remota del commit
final, recoger uso real externo de la RC y tomar una decisión explícita de
publicación estable. Ver `STABILIZATION.md` para los criterios de 2.3 y 3.0.
