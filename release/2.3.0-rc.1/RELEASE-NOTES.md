# 2.3.0-rc.1

Prerelease de 2.3. La referencia estable sigue siendo 2.2.0.

Incluye rateLimit funcional, capacidad FIFO en memoize, executionMethod,
transiciones optimistas de StateMachine, adaptadores de observabilidad y
handles de diagnóstico. Cancelación compartida, observeOperation, caché externa
y CAS permanecen experimentales. No añade dependencias de runtime.

La RC1 conserva el runtime revisado de RC0 y corrige el workflow de empaquetado:
los mensajes de prepare ya no invalidan el JSON de npm pack. Tres regresiones
ejecutan el paso real contra un tarball, con salida limpia, salida con ruido y
una versión incorrecta. RC0 no llegó a publicarse en npm.

AsyncMemoryStore ordena las mutaciones; los updaters no deben esperar mutaciones
de su propia clave ni barreras. Las lecturas del valor confirmado siguen sin
bloqueo. Los proveedores remotos no están certificados, y los valores CAS deben
tratarse como inmutables. El consumidor memoize mide 2.800 bytes gzip frente a
1.664 en la referencia local de 2.2.

Instalación del canal candidato tras su publicación:

```sh
npm install annotations-design-patterns@next
```

- [Migración a 2.3](https://stealman364.github.io/annotationsDesignPatterns/docs/migration/2.3)
- [Revisión del runtime](../2.3.0-rc.0/FINAL-REVIEW.md)
- [Contratos y ejemplos](../../V2.3-RUNTIME.md)
