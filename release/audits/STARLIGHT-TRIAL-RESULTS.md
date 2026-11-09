# Resultado de la prueba aislada de Starlight

Fecha: 9 de noviembre de 2026. Rama local: `experiment/starlight-docs-audit`.
Prototipo: `experiments/starlight-docs/`. El sitio Docusaurus actual, la
biblioteca, sus dependencias y su versión publicada no se han modificado.

## Veredicto

**Viable para estudiar una migración, pero todavía no cumple «cero alertas».**
La combinación probada elimina todas las alertas altas y críticas observadas
en el árbol actualizado de Docusaurus. Conserva dos entradas moderadas por una
misma causa: TypeDoc depende de una versión afectada de minimatch.

| Árbol completo | Críticas | Altas | Moderadas | Bajas | Total de entradas |
| --- | --- | --- | --- | --- | --- |
| Docusaurus después de su actualización compatible | 15 | 1 | 11 | 3 | 30 |
| Starlight + Astro + TypeDoc del prototipo | 0 | 0 | 2 | 0 | 2 |

Los recuentos incluyen paquetes padres afectados indirectamente; no representan
30 ni 2 vulnerabilidades independientes. Se comparan los árboles completos,
incluyendo herramientas. Todos los paquetes de este prototipo privado se declaran
como devDependencies: su resultado de producción vacío **no** acredita seguridad
del tooling. La evidencia relevante es `starlight-audit-full.json`.

La causa pendiente es
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
TypeDoc 0.28.20 admite minimatch `^10.2.5`; el parche disponible empieza en 11.0.1.
No se forzó una versión fuera de rango ni se degradó TypeDoc para limpiar el
contador. El aviso describe amplificación de patrones con `optimizationLevel >= 2`;
no se ha demostrado explotación en este prototipo. Tampoco se afirma que una
auditoría sin avisos equivalga a ausencia de defectos.

## Versiones y aislamiento

- Astro 7.4.7; Starlight 0.42.10; @astrojs/markdown-remark 7.3.0.
- TypeDoc 0.28.20; TypeScript 5.9.3; @types/node 20.19.43.
- Versiones directas exactas, manifiesto privado y lockfile separados.
- Build comprobado con Node 22.23.4 y npm 11.21.2, usados temporalmente sin
  reemplazar la instalación global. Astro exige Node >=22.23.4; la biblioteca
  conserva su soporte de Node 20.
- Instalación desde cero independiente: se copiaron solo manifiesto/lockfile a
  un directorio temporal nuevo; `npm ci --ignore-scripts --no-audit --no-fund`
  añadió 375 paquetes y terminó correctamente. Su lockfile coincide con el del
  prototipo: SHA256 `662faa3df5ced7dea633d5257c0d2fe91fd10bd8f66b95ce73408e644e60589a`.

La instalación inicial del prototipo sufrió un solapamiento de procesos npm en
Windows y errores ENOTEMPTY; se detuvieron y se completó una sola instalación
con rutas explícitas. La instalación independiente anterior es la evidencia de
reproducibilidad, sin depender de ese árbol parcial.

## Comprobaciones ejecutadas

- `npm run build:all`, con el runtime admitido: API → Astro → verificación de salida.
- TypeDoc generó los diez módulos públicos, con warnings tratados como errores.
  Se adaptó el baseline de tipos auxiliares no exportados al conjunto de entradas;
  no se desactivó la política de warnings.
- Página española en `/annotationsDesignPatterns/` y equivalente inglesa en
  `/annotationsDesignPatterns/en/`, con metadatos de idioma y selector entre ambas.
- TypeDoc produjo 210 páginas HTML de API. Con las páginas ES/EN y el 404 generado,
  la salida contiene 213 HTML.
- `scripts/verify-output.mjs`: 6.968 enlaces locales `href/src` comprobados,
  diez módulos API, índices de búsqueda ES/EN y cero fallos. Comprueba existencia
  de destinos y prefijo de despliegue; no verifica fragmentos ni destinos externos.
- HTTP local: portada ES, portada EN, API, script de búsqueda TypeDoc, manifiesto
  Pagefind y favicon respondieron 200. Evidencia: `starlight-http.json`.
- Pagefind indexa una página redactada por idioma; no se confunden los 213 HTML
  escaneados con las dos páginas indexadas. TypeDoc conserva su propio buscador.
- Revisión independiente de un segundo agente sobre la salida corregida: sin
  nuevos defectos materiales dentro del alcance de la prueba.
- Formato comprobado con Prettier; los tres archivos inicialmente señalados se
  formatearon antes de cerrar el trabajo.

Durante la prueba se reprodujeron y corrigieron enlaces a `/api/` que perdían el
prefijo, enlaces ingleses a una API traducida inexistente y un favicon ausente.
La comprobación de salida detectó el fallo antes de las correcciones y pasó después.

Permanece un warning no fatal de Starlight por no proporcionar una entrada de
contenido personalizada para 404; existe un 404 generado. No se presenta como
una advertencia de TypeDoc ni como un fallo de seguridad.

## Límites funcionales frente al sitio actual

- Solo se han creado dos páginas de muestra: no se han migrado las 30 páginas
  redactadas actuales ni sus rutas históricas `/docs/...`.
- La API es HTML independiente de TypeDoc, compartida por ambos idiomas, con UI
  inglesa. Está enlazada desde las portadas; no tiene la navegación localizada
  ni está integrada en Pagefind.
- No se han trasladado todavía todos los menús, estilos, enlaces históricos,
  redirecciones ni personalizaciones de accesibilidad del sitio actual.
- Se comprobaron build, salida estática y HTTP. No se realizó una prueba exhaustiva
  de interacción en navegador, accesibilidad o experiencia de búsqueda.
- No se ha cambiado el workflow de despliegue ni se ha publicado el prototipo.

## Próxima decisión recomendada

Si el requisito es cero alertas en todo el tooling, esta prueba todavía no lo
satisface: primero habría que resolver la dependencia de TypeDoc con compatibilidad
demostrada. Si se acepta seguir ese aviso moderado, la reducción de altas/críticas
justifica preparar una migración aparte con estas condiciones:

1. Conservar contenidos ES/EN y mapear todas las URLs antiguas a las nuevas.
2. Decidir si se acepta la API compartida con buscador propio o se necesita una
   integración de API/búsqueda; volver a auditar cualquier plugin que se añada.
3. Llevar el tooling de docs a Node >=22.23.4 sin cambiar el runtime de la biblioteca.
4. Validar enlaces, selectores, búsqueda, accesibilidad y despliegue en preview
   antes de sustituir Docusaurus.

## Limpieza temporal

La revisión automática bloqueó la eliminación del directorio de instalación
independiente con el motivo «blocked by policy». Se dejó intacto:
`C:\Users\Enrique\AppData\Local\Temp\adp-starlight-lock-5a9adbf4a1b3424ba50df61e4c53b4ed`.
No forma parte del repositorio ni es necesario para reproducir el prototipo.

## Referencias

- [Starlight: instalación](https://starlight.astro.build/manual-setup/).
- [Starlight: idiomas y locale raíz](https://starlight.astro.build/guides/i18n/).
- [TypeDoc](https://typedoc.org/documents/Overview.html).
- Evidencias locales: `starlight-audit-full.json`, `starlight-audit-production.json`
  y `starlight-http.json`; comparación Docusaurus en `audit-website-after.json`.
