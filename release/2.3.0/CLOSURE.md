# Cierre de 2.3.0

Fecha: 9 de noviembre de 2026. Estado inicial: versión estable preparada;
publicación pendiente del workflow de release y verificación del registro npm.

## Decisión de alcance

Se promueve el runtime revisado de 2.3 sin añadir funciones. Se conservan Node
20+, TypeScript 5.0+, TC39, ESM/CJS, subrutas y cero dependencias de ejecución.
`cancelWhenUnused`, `observeOperation`, caché externa y CAS siguen experimentales.
No hay proveedor remoto ni protocolo distribuido certificado.

El cambio de orden de mutaciones de AsyncMemoryStore corrige escrituras perdidas
y está documentado. Cambia temporización bajo contención; las lecturas siguen sin
bloqueo. Los updaters no deben esperar escrituras de su propia clave ni barreras
que dependan de ellos. La revisión no encontró otro bloqueo reproducible en las
áreas examinadas, lo que no demuestra ausencia de defectos.

## Evidencia y límites

- [Validación local de la identidad 2.3.0](LOCAL-VALIDATION.json): tests, tipos,
  lint, build, publint, ATTW, paquete, consumidores, TS 5.0/5.9 y presupuestos.
- [Paquete local preliminar](local-pack.json): identidad e integridad del tarball
  preparado antes del commit; no se confunde con el artefacto definitivo del tag.
- [Revisión de issues](issues-review.json): no hay issues de GitHub actualizadas
  desde el 7 de noviembre que reporten incidencias. No equivale a uso externo.
- [Aplicaciones controladas](INTEGRATION.md): cuatro combinaciones Node 20/22 y
  TS 5.0/5.9 correctas con la RC exacta de npm y otras cuatro con el tarball local
  preliminar 2.3.0. Se verificaron flujos HTTP de resiliencia/caché, decoradores
  TC39, finalizaciones invertidas, cambios manuales y orden del store.
  No se afirma adopción independiente; esa experiencia no se ha observado.
- [Migración y auditorías](../audits/STARLIGHT-MIGRATION-RESULTS.md): CI y web
  desplegadas en `4ba2e27`, cero alertas conocidas y excepciones de mantenimiento
  explícitas para overrides del tooling y el parche privado de documentación.

## Publicación

Publicar únicamente con tag `v2.3.0` que coincida con package.json. El workflow
release.yml valida su propio tarball, verifica identidad/integridad y lo publica
con procedencia mediante trusted publishing y dist-tag `latest`. Tras completarse,
registrar run, commit del tag, metadata/integridad npm e instalaciones aisladas.
No reutilizar una versión publicada ni describir un job pendiente como publicado.
