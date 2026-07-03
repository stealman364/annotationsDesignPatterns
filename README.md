# annotations-design-patterns

**Patrones de diseño como decoradores TypeScript estándar (TC39).** Los patrones GoF clásicos, un toolkit de resiliencia completo y utilidades de método — todo como anotaciones declarativas sobre tus clases.

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

- **Decoradores TC39 estándar** — funciona con TypeScript 5+ sin `experimentalDecorators` ni `reflect-metadata`. Las colecciones clásicas de decoradores (core-decorators, lodash-decorators, decko…) siguen ancladas al sistema legacy.
- **Cero dependencias** — cada patrón son unas decenas de líneas autocontenidas.
- **Tree-shakeable** — `sideEffects: false` + ESM: tu bundle solo incluye lo que importas. También hay imports granulares por ruta.
- **Tipado estricto** — sin `any`, con tests de tipos (`expectTypeOf`) además de los de comportamiento (137 tests).
- **34 símbolos públicos**: 14 patrones GoF + resiliencia + utilidades.

## Requisitos

- TypeScript **5.0+** con target `ES2022` o superior.
- **No** actives `experimentalDecorators`: esta librería usa los decoradores estándar.
- Node 18+ (o cualquier bundler moderno: Vite, esbuild, webpack…).

## Instalación

```bash
npm install annotations-design-patterns
```

## Catálogo

### Creacionales

| Símbolo | Qué hace |
| --- | --- |
| `@Singleton` | Todas las llamadas a `new` devuelven la misma instancia |
| `Factory<Base>` + `@RegisterIn(factory, clave)` | Registro de constructores por clave; `factory.create('clave', args)` |
| `builderFor(Clase)` | Builder fluido generado por tipos: `withNombre(v)…build()` |
| `@Cloneable` + `WithClone<T>` | Patrón Prototype: añade `clone()` (copia superficial) |

### Estructurales

| Símbolo | Qué hace |
| --- | --- |
| `@Adapt({ alias: 'metodoExistente' })` + `Adapted<T, M>` | Adapter: expone métodos bajo nombres nuevos |
| `@Decorate(wrapper)` + `MethodWrapper` | Decorator clásico: envuelve el método; apilable |
| `@Intercept(interceptor)` + `Invocation` | Proxy: observa, corta o modifica cada llamada (`proceed()`) |
| `@Flyweight` | Comparte instancias por argumentos del constructor |
| `@Frozen` / `@Sealed` | Instancias congeladas (`Object.freeze`) o selladas (`Object.seal`) |

### De comportamiento

| Símbolo | Qué hace |
| --- | --- |
| `Subject<Events>` + `@Emits('evento')` | Observer con mapa de eventos tipado |
| `StrategySelector<S>` + `@StrategyFor(selector, clave)` | Strategy intercambiable en runtime (`use`/`current`) |
| `CommandHistory` + `@Revertible(history, 'metodoInverso')` | Command con deshacer LIFO |
| `SnapshotHistory` + `@Snapshot(history)` | Memento: guarda el estado antes de cada mutación |
| `HandlerChain<Req, Res>` + `@HandlerFor(chain, prioridad)` | Chain of Responsibility con prioridades |
| `@IterableOver('propiedad')` + `WithIterator<T, I>` | Iterator: la clase funciona con `for...of` y spread |
| `StateMachine<S>` + `@When(...estados)` + `@TransitionTo(estado)` | State: guardas y transiciones declarativas |

### Utilidades de método

| Símbolo | Qué hace |
| --- | --- |
| `@Memoize` / `@Memoize({ key })` | Cache por argumentos e instancia; clave personalizable |
| `@MemoizeByRef` | Memoización por identidad (trie de `WeakMap`; admite circulares y funciones) |
| `@CachedFor(ttlMs, { key? })` | Memoize con caducidad |
| `@Debounce(ms)` / `@Throttle(ms)` / `@RateLimit(n, ventanaMs)` | Control de frecuencia de llamadas |
| `@Retry({ attempts, delayMs?, backoffFactor? })` | Reintentos con backoff exponencial opcional |
| `@Timeout(ms)` | Rechaza métodos async que exceden el límite |
| `@CircuitBreaker({ failures, resetMs })` | Corta llamadas tras fallos consecutivos; semiabierto tras el reset |
| `@Fallback(valor \| fn)` | Valor o función de respaldo cuando el método async rechaza |
| `@Semaphore(n)` / `@Mutex` | Máximo N ejecuciones concurrentes / exclusión mutua (Bulkhead) |
| `@Once` / `@Lazy` | Ejecuta una sola vez / getter calculado una sola vez |
| `@Bind` | Liga `this` al desestructurar o pasar como callback |
| `@Deprecated(mensaje?)` | Aviso de obsolescencia por `console.warn` (una vez) |
| `@Validate(guard)` | Precondiciones de argumentos: lanza `TypeError` con el motivo |

## Ejemplos destacados

### Observer con eventos tipados

```ts
import { Subject, Emits } from 'annotations-design-patterns';

class UserService extends Subject<{ 'user:created': User }> {
  @Emits('user:created')
  create(name: string): User {
    return { name };
  }
}

const service = new UserService();
service.on('user:created', (user) => console.log(user.name)); // user: User
service.create('Ana');
```

### Máquina de estados declarativa

```ts
import { StateMachine, When, TransitionTo } from 'annotations-design-patterns';

class Doc extends StateMachine<'draft' | 'review' | 'published'> {
  constructor() {
    super('draft');
  }

  @When('draft')
  @TransitionTo('review')
  submit(): void {}

  @When('review')
  @TransitionTo('published')
  approve(): void {}
}

const doc = new Doc();
doc.submit(); // doc.state === 'review'
doc.submit(); // Error: no puede llamarse en el estado "review"
```

### Factory por registro

```ts
import { Factory, RegisterIn } from 'annotations-design-patterns';

const shapes = new Factory<Shape>();

@RegisterIn(shapes, 'circle')
class Circle implements Shape {
  constructor(private radius: number) {}
  area(): number {
    return Math.PI * this.radius ** 2;
  }
}

shapes.create('circle', 5).area();
```

### Builder fluido generado por tipos

```ts
import { builderFor } from 'annotations-design-patterns';

class User {
  name = '';
  age = 0;
}

const user = builderFor(User).withName('Ana').withAge(30).build();
```

### Memoización: por valor, por clave o por identidad

```ts
import { Memoize, MemoizeByRef } from 'annotations-design-patterns';

class Repo {
  @Memoize // clave JSON.stringify(args): ideal para primitivos
  square(n: number): number { ... }

  @Memoize({ key: (user: User) => user.id }) // tú decides la clave
  permissions(user: User): Permission[] { ... }

  @MemoizeByRef // identidad: entidades, funciones, objetos con ciclos
  layout(document: Document): Layout { ... }
}
```

## Imports granulares

Además del barrel, cada patrón se puede importar por su ruta (categoría/patrón):

```ts
import { Singleton } from 'annotations-design-patterns/creational/singleton';
import { Retry } from 'annotations-design-patterns/utility/retry';
```

Con un bundler moderno no lo necesitas: el barrel es tree-shakeable.

## Limitaciones conocidas

- **Clave por defecto de `@Memoize`/`@CachedFor`** (`JSON.stringify`): lanza con argumentos circulares, colisiona con funciones/`Symbol` y es sensible al orden de propiedades. Escapes: la opción `key` o `@MemoizeByRef`.
- **`@Cloneable`, `@Adapt` e `@IterableOver`** añaden miembros en runtime que el sistema de tipos no puede ver (limitación de los decoradores TC39): usa los type helpers `WithClone<T>`, `Adapted<T, M>` y `WithIterator<T, I>`.
- **`@Fallback`** no puede cruzar el tipo del respaldo con el retorno del método (las factorías fijan sus genéricos antes de ver el método); pasa el genérico explícito `@Fallback<T>(valor)` para validar el valor.
- **`@Flyweight`** retiene sus instancias para siempre (es la esencia del patrón): úsalo con argumentos de cardinalidad acotada.

## Licencia

[ISC](./LICENSE) © Enrique
