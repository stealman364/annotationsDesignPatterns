# Plan de consolidación de 2.3 y criterios para 3.0

Alcance aprobado por el usuario: ejecutar la consolidación con agentes pequeños.
Se mantienen las APIs y la versión publicada. No se publica ni despliega otra versión.

## Reparto de trabajo

1. Agente `website_security` (gpt-6-luna): revisar y actualizar dependencias de
   `website/`, clasificar alertas restantes y comprobar traducciones/build.
2. Agente `audit_automation` (gpt-6-luna): ampliar el workflow de seguridad y
   Dependabot a `website/`, conservando informes y permisos mínimos.
3. Agente principal: integrar resultados, comprobar compatibilidad de la biblioteca,
   mantener la evidencia fechada y definir el cierre de 2.3 frente a posibles 3.x.

## Tareas y aceptación

- [x] Reducir alertas de documentación mediante actualizaciones compatibles.
  No forzar downgrades/majors para limpiar cifras. Registrar bloqueos restantes.
- [x] Validar instalación reproducible, paridad i18n y build ES/EN/API del sitio.
- [x] Incorporar vigilancia semanal/manual y por cambios de dependencias para
  raíz y sitio, con artefactos separados; incluir `/website` en Dependabot.
- [x] Confirmar que no cambian código fuente público, versión, runtime dependencies
  ni presupuestos. Reutilizar evidencia previa si nada relevante cambia.
- [x] Actualizar el índice de auditorías con lo completado y lo pendiente.
- [x] Documentar criterios de 2.3 estable y condiciones justificadas para 3.0.

## Cierre de 2.3

La estabilización requiere validación del commit final en CI Node 20/22,
pruebas reales de consumidores sobre la RC y clasificación explícita de APIs
experimentales. La experiencia de usuarios externos no puede inventarse ni
sustituirse por las pruebas internas. No se promociona `next` a `latest` aquí.

## Cuándo plantear 3.0

Solo ante cambios incompatibles justificados por usos reales: simplificación de
contratos, retirada de APIs deprecadas o cambios de formatos/requisitos con plan
de migración. Seguridad de herramientas, documentación y mejoras compatibles
de tamaño pueden resolverse sin 3.0. No se añade funcionalidad por alcanzar un
número de versión ni por mejorar un badge.
