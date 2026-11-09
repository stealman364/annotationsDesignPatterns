# Cierre de 2.3.0

Fecha: 9 de noviembre de 2026. **2.3.0 publicada y verificada en npm como
`latest`**, mediante trusted publishing y con procedencia comprobada.

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

- PR de cierre: [#17](https://github.com/stealman364/annotationsDesignPatterns/pull/17).
  CI Node 20/22, documentación y seguridad correctas antes de fusionar.
- [Release pública de GitHub](https://github.com/stealman364/annotationsDesignPatterns/releases/tag/v2.3.0)
  creada como estable; web pública comprobada con HTTP 200 y contenido 2.3.0.
- Tag anotado `v2.3.0`, commit `1d8cb44b9da8822e02703838d0693e0746e6565e`.
- [Release 42610848603](https://github.com/stealman364/annotationsDesignPatterns/actions/runs/42610848603):
  validate, build y publish completados correctamente. Se publicó el tarball
  descargado del artefacto validado, sin reconstruirlo en publish.
- [Metadata verificada](PUBLISHED.json): npm devuelve `2.3.0` para `latest`,
  sin dependencias de ejecución. SHA-256 del tarball descargado del registro:
  `f1dfe074f0cf33c92adadefe0d93647f6445f992a0672f1a44df6ccf71ff8077`.
  Coinciden SHA-256, SHA-1 e integridad SHA-512 con el artefacto de Actions.
- [Firma y atestación](SIGNATURES.json): `npm audit signatures` verificó la firma
  del registro y la atestación. La procedencia enlaza el mismo tag, commit,
  workflow y digest del paquete; [atestaciones públicas](npm-attestations.json).
- [Artefacto definitivo](integration/WORKFLOW-EVIDENCE.json) y
  [paquete instalado desde npm](integration/PUBLISHED-EVIDENCE.json): cuatro
  combinaciones Node 20/22 × TS 5.0/5.9 correctas por cada origen.
- [Runtime publicado ESM/CJS](PUBLISHED-RUNTIME.json): fixtures de cancelación,
  colas, caché, retry y contratos 2.3 correctos en Node 20.20.2 y 22.23.4.

La fuente de runtime y sus pruebas no cambian respecto al tag RC1 revisado.
El tarball definitivo puede diferir del preliminar local por la plataforma de
build; la comparación de publicación utiliza el artefacto definitivo de Actions.
`next` conserva la RC1 histórica; la instalación normal usa la estable `latest`.

```sh
npm install annotations-design-patterns
```
