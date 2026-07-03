# Diseño: annotations-design-patterns

**Fecha:** 2026-07-03
**Estado:** Aprobado

## Resumen

Librería TypeScript sin dependencias que ofrece patrones de diseño como decoradores
estándar TC39 (TypeScript 5+, sin flags especiales), aplicables a clases y métodos.
Ejemplo de uso:

```ts
import { Singleton, Memoize } from 'annotations-design-patterns';

@Singleton
class Database {
  connect() { /* ... */ }
}

class Api {
  @Memoize
  fetchUser(id: string) { /* ... */ }
}
```

## Objetivo

- Uso personal inicialmente, pero preparada para publicarse en npm sin cambios
  estructurales.
- Catálogo amplio de patrones, implementado por fases de menor a mayor dificultad.
- Peso mínimo para el consumidor: tree-shaking real y imports granulares.

## Decisiones técnicas

| Decisión | Elección | Motivo |
|---|---|---|
| Sistema de decoradores | Estándar TC39 (TS 5+) | Estándar oficial de JS, sin flags en el tsconfig del consumidor, future-proof. Se descarta `experimentalDecorators` (legacy). |
| Arquitectura | Paquete único, un módulo por patrón | Simplicidad; la granularidad se logra con tree-shaking y subpath exports, no con monorepo ni registro central. |
| Formato de publicación | ESM + CJS con `"sideEffects": false` | El bundler del consumidor elimina los patrones no usados. |
| Imports granulares | Subpath exports (`'lib/singleton'`) además del barrel (`'lib'`) | Granularidad explícita sin dividir el paquete. |
| Build | tsup | Genera `.js` (ESM), `.cjs` y `.d.ts` con configuración mínima. |
| Tests | vitest | Rápido, soporta `expectTypeOf` para tests de tipos. |
| Dependencias runtime | Ninguna | Cada decorador son ~10–40 líneas autocontenidas. |

## Estructura del proyecto

```
src/
  patterns/           // cada patrón: implementación + tipos + JSDoc con ejemplo
    creational/       // singleton, factory, builder
    structural/       // adapt, decorate, intercept, frozen
    behavioral/       // observer, strategy, command
    utility/          // memoize, debounce, throttle, retry, lazy (no-GoF)
  index.ts            // re-exporta todo (tree-shakeable)
tests/
  singleton.test.ts   // un archivo de test por patrón (planos, sin carpetas)
  ...
package.json          // type: module, exports con subpaths, sideEffects: false
tsconfig.json         // strict: true, target ES2022
tsup.config.ts
```

Los imports granulares incluyen la categoría:
`import { Singleton } from 'annotations-design-patterns/creational/singleton'`
(el subpath export `"./*"` de Node cubre rutas anidadas sin cambios en package.json).

## Contrato de cada patrón

Cada módulo en `src/patterns/`:

- Exporta un decorador con tipos estrictos (sin `any`).
- No comparte estado global con otros patrones.
- Está documentado con JSDoc que incluye un ejemplo de uso.
- Los decoradores de clase preservan el tipo original: `new MiClase()` sigue
  tipando correctamente tras aplicar el decorador.
- Los decoradores de método preservan la firma del método.

## Manejo de errores

El uso incorrecto de un decorador (p. ej. `@Memoize` aplicado a una clase en vez
de a un método) lanza `TypeError` con un mensaje claro en el momento de aplicar
el decorador. Nunca fallos silenciosos.

## Testing

Vitest, con un archivo de test por patrón que cubre:

1. Comportamiento del patrón (p. ej. `@Singleton` devuelve siempre la misma instancia).
2. Preservación de tipos con `expectTypeOf`.
3. Errores ante uso incorrecto del decorador.

## Fases de implementación

Cada fase termina con tests en verde y es usable por sí sola.

| Fase | Contenido | Dificultad |
|---|---|---|
| 0 | Scaffolding: tsconfig, tsup, vitest, package.json con exports | — |
| 1 | `@Singleton`, `@Memoize`, `@Frozen` (Immutable) | Fácil: decoradores puros sin estado compartido |
| 2 | `@Debounce`, `@Throttle`, `@Retry`, `@Lazy` | Media: temporización y estado interno por método |
| 3 | `Subject` + `@Emits` (Observer), `Factory` + `@RegisterIn`, `builderFor` (Builder) | Media-alta: requieren event-emitter o registro propio |
| 4 | `@Intercept` (Proxy), `StrategySelector` + `@StrategyFor`, `CommandHistory` + `@Revertible` (Command), `@Decorate`, `@Adapt` (Adapter) | Alta: tipado avanzado con genéricos |

Nota: Builder se expone como helper `builderFor(Clase)` y no como decorador
`@Buildable`, porque los decoradores TC39 no pueden ampliar el tipo estático de
una clase y el decorador no podría tiparse honestamente.

## Fuera de alcance (v1)

- Decoradores de parámetros e inyección de dependencias (requieren el sistema
  legacy o metadata adicional; posible evolución futura).
- Soporte del sistema legacy `experimentalDecorators`.
- Monorepo o paquetes por categoría.
