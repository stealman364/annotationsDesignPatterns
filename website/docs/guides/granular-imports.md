---
sidebar_position: 10
---

# Imports granulares por categoría

Además del barrel (importación desde el root), cada patrón puede importarse por su ruta de categoría. **Esto no añade nuevos símbolos** — son los mismos reexportados desde `/decorators`, `/operators`, `/pipe`, `/run` y `/policy`.

## Por categoría de patrón

Cada patrón GoF puede importarse desde su categoría:

```ts
// Creacionales
import { Singleton } from 'annotations-design-patterns/creational/singleton';
import { Factory, RegisterIn } from 'annotations-design-patterns/creational/factory';
import { builderFor } from 'annotations-design-patterns/creational/builder';

// Estructurales
import { Adapt } from 'annotations-design-patterns/structural/adapt';
import { Decorate, Intercept } from 'annotations-design-patterns/structural/decorate';
import { Frozen, Sealed } from 'annotations-design-patterns/structural/frozen';

// De comportamiento
import { Subject, Emits } from 'annotations-design-patterns/behavioral/observer';
import { StateMachine, When, TransitionTo } from 'annotations-design-patterns/behavioral/state-machine';
import { CommandHistory, Revertible } from 'annotations-design-patterns/behavioral/command';
```

## Fachada estable de decoradores

Para resiliencia, hay una fachada estable en `/decorators`:

```ts
import {
  Retry,
  Timeout,
  CircuitBreaker,
  Fallback,
  Memoize,
  CachedFor,
  Semaphore,
  Mutex,
} from 'annotations-design-patterns/decorators';
```

Esta fachada **no incluye** los decoradores GoF (Singleton, Factory, etc.) ni adaptadores internos de TC39.

## API funcional: subpaths explícitos

La API funcional usa subpaths explícitos, no granulares por categoría:

```ts
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';
import { retry, fallback, timeout } from 'annotations-design-patterns/operators';
import { definePolicy } from 'annotations-design-patterns/policy';
```

## Optimización de bundle

Con un bundler moderno (Vite, esbuild, webpack 5+), **no necesitas imports granulares** para optimizar. Los barrels ya son tree-shakeable:

```ts
// Equivalente en bundle (ambos caben igual de pequeño):

// Import granular
import { Singleton } from 'annotations-design-patterns/creational/singleton';

// Import del barrel
import { Singleton } from 'annotations-design-patterns';
```

Usa granulares si prefieres **claridad explícita** en tus imports, no por optimización.

## Ubicación interna (no público)

**No importes** desde rutas como:

```ts
// ❌ No estas, son internas
import { Operator } from 'annotations-design-patterns/core/operator';
import { ObserverEvents } from 'annotations-design-patterns/core/events';
```

El directorio `/core` contiene tipos de implementación no reexportados públicamente. Cualquier símbolo que necesites de esas rutas está disponible desde los subpaths públicos.

## Para referencia de todos los símbolos públicos

Consulta la [Referencia raíz](/docs/api/root) para el barrel completo, o las referencias específicas:

- [Decoradores](/docs/api/decorators) — Fachada de resiliencia
- [Operadores](/docs/api/operators) — API funcional
- [Pipe](/docs/api/pipe) — Composición con pipe
- [Run](/docs/api/run) — Ejecución con contexto
- [Policy](/docs/api/policy) — Políticas reutilizables
- [Store](/docs/api/store) — Store async
- [Node](/docs/api/node) — Contexto Node.js
- [Observability](/docs/api/observability) — Errores y eventos
- [Experimental](/docs/api/experimental) — APIs experimentales
