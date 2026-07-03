# Fase 7: Publicación en npm — Plan de trabajo y runbook

**Goal:** Dejar el paquete `annotations-design-patterns` listo para `npm publish`: README, LICENSE, metadatos, versión 1.0.0 y ensayo de publicación verificado. La publicación final la ejecuta Enrique con su cuenta de npm (runbook al final).

**Estado previo:** 137 tests, typecheck, lint, format y build en verde. Nombre `annotations-design-patterns` verificado como libre en el registro (E404 el 2026-07-03).

---

## Parte A — Preparación (automatizable)

### Task 1: LICENSE
- [ ] Crear archivo `LICENSE` con la licencia ISC (la ya declarada en package.json), titular "Enrique".

### Task 2: Metadatos de package.json
- [ ] `version`: `1.0.0` (primera publicación estable).
- [ ] `description` en inglés (para el buscador de npm).
- [ ] `keywords`: decorators, typescript, design-patterns, tc39, singleton, memoize, retry, circuit-breaker, observer, strategy, resilience, gof…
- [ ] `author`: `Enrique <enrique.azarquiel@gmail.com>`.
- [ ] `engines`: `node >= 18`.
- [ ] `sideEffects: false`, `files: ["dist"]`, `exports` — ya estaban; verificar.
- [ ] Script `prepublishOnly`: `npm test && npm run typecheck && npm run lint && npm run build` (candado: npm lo ejecuta automáticamente antes de publicar y aborta si algo falla).
- [ ] SIN `repository` por ahora (no hay remoto GitHub); añadirlo cuando exista (ver Parte C).

### Task 3: README.md
- [ ] En español (idioma del proyecto y de sus mensajes de error).
- [ ] Secciones: qué es + diferenciales (TC39 sin flags, cero dependencias, tree-shaking), instalación, requisitos, inicio rápido, catálogo completo por categorías (tabla), ejemplos destacados (cadena de resiliencia, Observer tipado, Factory, StateMachine, builderFor, MemoizeByRef), imports granulares, limitaciones conocidas (clave JSON, casts `WithClone`/`Adapted`, tipado de `@Fallback`), licencia.

### Task 4: Ensayo de publicación
- [ ] `npm pack --dry-run`: revisar que el tarball contiene SOLO `dist/`, `package.json`, `README.md`, `LICENSE` (ni src, ni tests, ni docs, ni configs).
- [ ] `npm publish --dry-run`: verificación final sin publicar.
- [ ] Suite completa en verde y commit.

## Parte B — Publicación (manual, la hace Enrique)

1. **Cuenta npm** (una sola vez): créala en https://www.npmjs.com/signup si no la tienes. Activa 2FA (te lo pedirá; usa una app de códigos tipo Google Authenticator).
2. **Login** (una sola vez por máquina): en la terminal del proyecto:
   ```
   npm login
   ```
   Abre el navegador; autentícate. Verifica con `npm whoami`.
3. **Publicar**:
   ```
   npm publish
   ```
   - `prepublishOnly` correrá tests+typecheck+lint+build automáticamente; si algo falla, aborta (es la red de seguridad).
   - Te pedirá el código 2FA (OTP).
   - El paquete es sin scope, así que es público por defecto.
4. **Verificar**: https://www.npmjs.com/package/annotations-design-patterns y prueba real:
   ```
   npm install annotations-design-patterns
   ```
   en cualquier proyecto TS 5+.

## Parte C — Versiones futuras (cómo trabajar a partir de aquí)

- **Publicar cambios**: haz los cambios → `npm version patch|minor|major` (actualiza package.json y crea commit+tag) → `npm publish`.
  - `patch` (1.0.x): arreglos sin cambio de API.
  - `minor` (1.x.0): patrones/opciones nuevos retrocompatibles.
  - `major` (x.0.0): cambios que rompen (p. ej. renombrar un decorador).
- **GitHub (recomendado, opcional)**: crea un repo en github.com, luego:
  ```
  git remote add origin https://github.com/<tu-usuario>/annotations-design-patterns.git
  git push -u origin master
  ```
  Después añade a package.json: `"repository": { "type": "git", "url": "https://github.com/<tu-usuario>/annotations-design-patterns.git" }` — npm lo enlazará en la página del paquete. Con el repo en GitHub se puede montar CI (GitHub Actions) y publicación con provenance; pídemelo entonces.

## Criterio de salida de la Parte A

- `npm pack --dry-run` muestra solo dist/ + README + LICENSE + package.json.
- `npm publish --dry-run` sin errores.
- Suite completa en verde. Todo commiteado.
