# Prueba aislada de Astro Starlight

Fecha: 9 de noviembre de 2026. El usuario aprobó probar Starlight con una página
por idioma, generación de API y auditoría completa antes de decidir migrar.

## Diseño aprobado

Proyecto privado separado en `experiments/starlight-docs/`, con manifiesto y
lockfile propios, sin modificar el sitio Docusaurus ni la biblioteca. Usar
versiones estables exactas de Astro, Starlight y TypeDoc, con el menor número de
plugins necesario. Mantener el base path de GitHub Pages. Registrar el requisito
de Node de este tooling por separado del requisito de la biblioteca.

## Plan de ejecución

- [x] Montar una página ES y su equivalente EN, con navegación entre idiomas.
- [x] Generar documentación de las APIs públicas desde las fuentes TypeScript;
  enlazar la salida desde ambos idiomas y conservar un comando reproducible.
- [x] Instalar con lockfile, compilar con una versión de Node admitida y auditar
  todo el árbol, incluidas herramientas. No usar excepciones para ocultar avisos.
- [x] Comprobar HTML, enlaces, rutas bajo el base path y generación de búsqueda.
- [x] Revisar el prototipo de forma independiente y documentar alertas y costes
  de migración. Una instalación aislada sin alertas no garantiza seguridad futura.

No se migra el contenido completo, no se retira Docusaurus, no se despliega
GitHub Pages y no se publica otra versión de la biblioteca durante esta prueba.

## Decisión

Solo recomendar migrar si la combinación completa, incluida generación de API,
mejora el resultado de seguridad y preserva las funciones necesarias. Si la
auditoría revela bloqueos, registrar sus causas antes de proponer la migración.
