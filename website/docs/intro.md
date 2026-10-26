---
sidebar_position: 1
---

# Bienvenida a annotations-design-patterns

**Patrones de diseño como decoradores TypeScript estándar (TC39) y como funciones componibles.** Los patrones GoF clásicos, inyección de dependencias, un toolkit de resiliencia completo y utilidades de método. La resiliencia y la caché también están disponibles como operadores funcionales: consulta la guía de [operadores](./guides/operators.md).

```ts
import { Singleton, Retry, Timeout, Fallback } from 'annotations-design-patterns';

@Singleton
class ApiClient {
  @Fallback<User[]>([])
  @Retry({ attempts: 3, delayMs: 200, backoffFactor: 2 })
  @Timeout(5000)
  async fetchUsers(): Promise<User[]> {
    /* ... */
  }
}
```

## ¿Por qué esta librería?

- **Decoradores TC39 estándar** — funciona con TypeScript 5+ sin `experimentalDecorators` ni `reflect-metadata`. Las colecciones clásicas siguen ancladas al sistema legacy.
- **Cero dependencias** — cada patrón autocontenido, tree-shakeable.
- **Tipado estricto** — con tests de tipos además de los de comportamiento; cualquier `any` queda acotado.
- **15 patrones GoF** + inyección de dependencias + resiliencia + utilidades de método, cubiertos en esta documentación.

## Requisitos

- TypeScript **5.0+** con target `ES2022` o superior.
- **No** actives `experimentalDecorators`: esta librería usa los decoradores estándar.
- Node 20+ (o cualquier bundler moderno).

## Instalación

```bash
npm install annotations-design-patterns
```

## Próximos pasos

Elige una guía en el menú lateral según lo que busques hacer:

- **[Decoradores GoF y de resiliencia](guides/decorators)** — catálogo completo de patrones clásicos y resilientes.
- **[API funcional con `pipe`, `run` y operadores](guides/operators)** — composición sin decoradores.
- **[Políticas reutilizables con `definePolicy`](guides/policy)** — configuración inmutable y validada.
- **[Observabilidad: errores y eventos](guides/observability)** — estructura log de eventos sin dependencias.
- **[Concurrencia e invalidación](guides/concurrency)** — `overlap`, `keyedLock` y caches con handles.
- **[Store async y contexto Node](guides/store-node)** — integración con Node.js.
- **[Experimental: `switchOverlap` y `hedge`](guides/experimental)** — APIs no estables bajo investigación.

Para una referencia detallada de tipos y firmas, consulta la [Referencia de API](/docs/api/root).
