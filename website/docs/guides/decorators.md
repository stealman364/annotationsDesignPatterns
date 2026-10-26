---
sidebar_position: 1
---

# Decoradores GoF y de resiliencia

Esta guía cubre los 14 patrones clásicos GoF (creacionales, estructurales, de comportamiento) más el kit completo de resiliencia (Retry, Timeout, Fallback, CircuitBreaker y más) — todos como decoradores simples sobre tus métodos.

## Creacionales

| Patrón | Qué hace | Ejemplo |
|--------|----------|---------|
| `@Singleton` | Una sola instancia, aislada por constructor | `@Singleton class Api {}` |
| `Factory<T>` + `@RegisterIn` | Registro de constructores por clave | `shapes.create('circle', 5)` |
| `builderFor(Clase)` | Builder fluido con tipos | `builderFor(User).withName('Ana').build()` |
| `@Cloneable` | Copia superficial vía `clone()` | `user.clone()` |

## Estructurales

| Patrón | Qué hace | Ejemplo |
|--------|----------|---------|
| `@Adapt` | Expone métodos bajo nombres nuevos | `@Adapt({ alias: 'oldName' })` |
| `@Decorate` | Envuelve el método (apilable) | `@Decorate(wrapper)` |
| `@Intercept` | Proxy: observa y modifica cada llamada | `@Intercept(interceptor)` |
| `@Flyweight` | Comparte instancias por argumentos | `@Flyweight class Icon {}` |
| `@Frozen` / `@Sealed` | Congela o sella instancias | `@Frozen class Config {}` |

## De comportamiento

| Patrón | Qué hace | Ejemplo |
|--------|----------|---------|
| `Subject<Events>` + `@Emits` | Observer tipado con eventos | `service.on('created', user => ...)` |
| `StrategySelector<S>` + `@StrategyFor` | Strategy intercambiable | `selector.use('fast')` |
| `CommandHistory` + `@Revertible` | Command con deshacer | `history.undo()` |
| `StateMachine<S>` + `@When` + `@TransitionTo` | State con guardas | `@When('draft') @TransitionTo('review')` |

## Kit de resiliencia

### Básico

- **`@Fallback(valor | fn)`** — Valor o función de respaldo si el método falla.
- **`@Retry({ attempts, delayMs?, backoffFactor? })`** — Reintentos con backoff exponencial.
- **`@Timeout(ms)`** — Rechaza si excede el límite (no cancela el trabajo).
- **`@CircuitBreaker({ failures, resetMs })`** — Corta tras fallos; half-open después de reset.

### Control de frecuencia

- **`@Debounce(ms)`** — Espera antes de ejecutar.
- **`@Throttle(ms)`** — Máximo una ejecución por ventana.
- **`@RateLimit(n, ventanaMs)`** — Máximo N ejecuciones por ventana.

### Aislamiento

- **`@Semaphore(n)`** — Máximo N ejecuciones concurrentes.
- **`@Mutex`** — Exclusión mutua (= `@Semaphore(1)`).

### Caché y observabilidad

- **`@Memoize`** — Cache por argumentos e instancia.
- **`@MemoizeByRef`** — Cache por identidad (trie de `WeakMap`).
- **`@CachedFor(ttlMs, { key? })`** — Memoize con caducidad.
- **`@Once` / `@Lazy`** — Ejecuta una sola vez / getter calculado.
- **`@Log` / `@Measure`** — Registra o mide (soportan Promises).

## Ejemplo completo: pila de resiliencia

```ts
import { Singleton, Fallback, Retry, Timeout, CircuitBreaker } from 'annotations-design-patterns';

@Singleton
class UserService {
  @CircuitBreaker({ failures: 5, resetMs: 30_000 })
  @Timeout(5000)
  @Retry({ attempts: 3, delayMs: 100, backoffFactor: 2 })
  @Fallback<User[]>([])
  async getUsers(): Promise<User[]> {
    return fetch('https://api.example.com/users').then(r => r.json());
  }
}

const service = new UserService();
const users = await service.getUsers(); // fallback si falla
```

La pila se ejecuta **de abajo hacia arriba**: primero Fallback (más externo), luego Retry, Timeout, CircuitBreaker, y el método al centro. El fallback devuelve cuando la cadena entera falla.

## Composición con `@Decorate` y `@Intercept`

Para comportamientos cruzados que no caben en la resiliencia, usa **`@Decorate`** (envuelve el resultado) o **`@Intercept`** (antes/después/modifica la llamada):

```ts
const withLogging = (original: (...args: any[]) => any) => 
  async (...args: any[]) => {
    console.log('Llamada:', args);
    const result = await original(...args);
    console.log('Resultado:', result);
    return result;
  };

class Service {
  @Decorate(withLogging)
  async process(id: string): Promise<string> {
    return id.toUpperCase();
  }
}
```

## Para el detalle completo

Consulta la [Referencia de decoradores](/docs/api/decorators) para firmas exactas, opciones numéricas finitas (`attempts ≥ 1`, `delayMs ≥ 0`) y comportamiento con herencia.
