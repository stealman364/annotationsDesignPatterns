# annotations-design-patterns

**Patrones de diseño como decoradores TypeScript estándar (TC39) y como funciones componibles.** Los patrones GoF clásicos, inyección de dependencias, un toolkit de resiliencia completo y utilidades de método.

📖 **[Documentación completa](https://stealman364.github.io/annotationsDesignPatterns/)**: guías, referencia de API y migración a 2.0 ([English](https://stealman364.github.io/annotationsDesignPatterns/en/)).

Se puede usar de dos formas:

- **Con anotaciones (decoradores)** sobre clases y métodos:

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

- **Con funciones**, sin decoradores, componiendo operadores sobre cualquier función:

  ```ts
  import { fallback, retry, timeout } from 'annotations-design-patterns/operators';
  import { pipe } from 'annotations-design-patterns/pipe';

  const fetchUsers = pipe(
    loadUsers,
    fallback<object, readonly [], User[]>([]),
    retry({ attempts: 3, delayMs: 200, backoffFactor: 2 }),
    timeout(5000),
  );
  ```

Consulta [Dos formas de usarla](#dos-formas-de-usarla) para saber qué está disponible en cada estilo.

## ¿Por qué esta librería?

- **Decoradores TC39 estándar** — funciona con TypeScript 5+ sin `experimentalDecorators` ni `reflect-metadata`. Las colecciones clásicas de decoradores (core-decorators, lodash-decorators, decko…) siguen ancladas al sistema legacy.
- **Cero dependencias** — cada patrón son unas decenas de líneas autocontenidas.
- **Tree-shakeable** — `sideEffects: false` + ESM: tu bundle solo incluye lo que importas. También hay imports granulares por ruta.
- **Tipado estricto** — con tests de tipos (`expectTypeOf`) además de los de comportamiento (447 tests); quedan `any` acotados en decoradores no modificados.
- **Dos estilos**: decoradores para clases y operadores funcionales (`pipe`, `run`, `definePolicy`) para funciones sueltas.
- **15 patrones GoF** + inyección de dependencias + resiliencia + utilidades de método.

> ¿Actualizas desde 1.x? Consulta la [guía de migración a 2.0](./website/docs/migration/2.0.md): `@TransitionTo` asíncrono, aislamiento de caches en herencia y el nuevo error de ciclos de DI cambian comportamientos observables.

## Requisitos

- TypeScript **5.0+** con target `ES2022` o superior.
- **No** actives `experimentalDecorators`: esta librería usa los decoradores estándar.
- Node 20+ (o cualquier bundler moderno: Vite, esbuild, webpack…).

## Instalación

```bash
npm install annotations-design-patterns
```

## Dos formas de usarla

| Estilo                 | Cuándo usarlo                                                                           | Imports                                            |
| ---------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Anotaciones (`@Retry`) | Métodos y clases propias; la política queda declarada junto al código                   | raíz `annotations-design-patterns` o `/decorators` |
| Funciones (`retry()`)  | Funciones sueltas, código de terceros, o cuando no puedes o no quieres usar decoradores | `/operators`, `/pipe`, `/run`, `/policy`           |

Los patrones GoF, la inyección de dependencias y la mayoría de utilidades de
método existen **solo como decoradores**, porque actúan sobre clases. La
resiliencia y la caché existen en los dos estilos y comparten el mismo motor
interno, así que se comportan igual:

| Decorador                     | Operador funcional       | Notas                                                       |
| ----------------------------- | ------------------------ | ----------------------------------------------------------- |
| `@Retry(opts)`                | `retry(opts)`            |                                                             |
| `@Timeout(ms)`                | `timeout(ms)`            |                                                             |
| `@Fallback(valor \| fn)`      | `fallback(valor \| fn)`  |                                                             |
| `@CircuitBreaker(opts)`       | `circuitBreaker(opts)`   |                                                             |
| `@Memoize` / `@Memoize(opts)` | `memoize(opts)`          | `memoizeWithHandle()` añade `invalidate(key)` y `clear()`   |
| `@CachedFor(ttlMs, opts)`     | `cachedFor(ttlMs, opts)` | `cachedForWithHandle()` añade `invalidate(key)` y `clear()` |
| —                             | `overlap(opts)`          | Solo funcional: `drop`, `share` o cola FIFO por clave       |
| —                             | `keyedLock(opts)`        | Solo funcional: serializa por clave                         |
| —                             | `definePolicy(config)`   | Solo funcional: agrupa las cuatro capas de resiliencia      |
| `@Mutex` / `@Semaphore(n)`    | —                        | Solo decorador                                              |

## Catálogo

Todos los símbolos del catálogo son decoradores o clases que se importan desde
la raíz del paquete. Para la versión funcional, consulta
[API funcional](#api-funcional).

### Creacionales

| Símbolo                                         | Qué hace                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `@Singleton`                                    | Todas las llamadas a `new` devuelven la misma instancia, aislada por constructor efectivo en herencia |
| `Factory<Base>` + `@RegisterIn(factory, clave)` | Registro de constructores por clave; `factory.create('clave', args)`                                  |
| `builderFor(Clase)`                             | Builder fluido generado por tipos: `withNombre(v)…build()`                                            |
| `@Cloneable` + `WithClone<T>`                   | Patrón Prototype: añade `clone()` (copia superficial)                                                 |
| `Container` + `@Injectable` + `@Inject`         | Inyección de dependencias por campos, con `InjectionToken` y scopes `singleton`/`transient`           |

### Estructurales

| Símbolo                                                  | Qué hace                                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `@Adapt({ alias: 'metodoExistente' })` + `Adapted<T, M>` | Adapter: expone métodos bajo nombres nuevos                                                   |
| `@Decorate(wrapper)` + `MethodWrapper`                   | Decorator clásico: envuelve el método; apilable                                               |
| `@Intercept(interceptor)` + `Invocation`                 | Proxy: observa, corta o modifica cada llamada (`proceed()`)                                   |
| `@Flyweight`                                             | Comparte instancias por argumentos del constructor, sin compartir cache entre base y derivada |
| `@Frozen` / `@Sealed`                                    | Instancias congeladas (`Object.freeze`) o selladas (`Object.seal`)                            |

### De comportamiento

| Símbolo                                                           | Qué hace                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Subject<Events>` + `@Emits('evento')`                            | Observer con mapa de eventos tipado; espera Promises y thenables                            |
| `@On(subject, 'evento')`                                          | Suscribe el método al evento al construir cada instancia (complemento de `@Emits`)          |
| `StrategySelector<S>` + `@StrategyFor(selector, clave)`           | Strategy intercambiable en runtime (`use`/`current`)                                        |
| `CommandHistory` + `@Revertible(history, 'metodoInverso')`        | Command con deshacer LIFO                                                                   |
| `SnapshotHistory` + `@Snapshot(history)`                          | Memento: guarda el estado antes de cada mutación                                            |
| `HandlerChain<Req, Res>` + `@HandlerFor(chain, prioridad)`        | Chain of Responsibility con prioridades                                                     |
| `@IterableOver('propiedad')` + `WithIterator<T, I>`               | Iterator: la clase funciona con `for...of` y spread                                         |
| `StateMachine<S>` + `@When(...estados)` + `@TransitionTo(estado)` | State: guardas y transiciones declarativas; las transiciones async se confirman al resolver |

### Utilidades de método

| Símbolo                                                        | Qué hace                                                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `@Memoize` / `@Memoize({ key })`                               | Cache por argumentos e instancia; clave personalizable                                                                       |
| `@MemoizeByRef`                                                | Memoización por identidad (trie de `WeakMap`; admite circulares y funciones)                                                 |
| `@CachedFor(ttlMs, { key? })`                                  | Memoize con caducidad desde la invocación (también para Promises pendientes); rechazos no quedan cacheados                   |
| `@Debounce(ms)` / `@Throttle(ms)` / `@RateLimit(n, ventanaMs)` | Control de frecuencia de llamadas                                                                                            |
| `@Retry({ attempts, delayMs?, backoffFactor? })`               | Reintentos con backoff exponencial opcional; opciones numéricas finitas (`attempts ≥ 1`, `delayMs ≥ 0`, `backoffFactor ≥ 1`) |
| `@Timeout(ms)`                                                 | Rechaza métodos async que exceden el límite; no cancela el trabajo subyacente                                                |
| `@CircuitBreaker({ failures, resetMs })`                       | Corta llamadas tras fallos consecutivos; una sonda half-open local tras el reset                                             |
| `@Fallback(valor \| fn)`                                       | Valor o función de respaldo cuando el método async rechaza                                                                   |
| `@Semaphore(n)` / `@Mutex`                                     | Máximo N ejecuciones concurrentes / exclusión mutua (Bulkhead)                                                               |
| `@Once` / `@Lazy`                                              | Ejecuta una sola vez / getter calculado una sola vez                                                                         |
| `@Bind`                                                        | Liga `this` al desestructurar o pasar como callback                                                                          |
| `@Deprecated(mensaje?)`                                        | Aviso de obsolescencia por `console.warn` (una vez)                                                                          |
| `@Validate(guard)`                                             | Precondiciones de argumentos: lanza `TypeError` con el motivo                                                                |
| `@Log(opts?)` / `@Measure(onMeasure)`                          | Registra llamadas / mide su duración; esperan Promises y thenables antes de informar éxito o error                           |

## API funcional

La API funcional no necesita decoradores: envuelve cualquier función con los
mismos operadores de resiliencia y caché. Se publica mediante tres subpaths
estables:

```ts
import { fallback, retry } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';
```

Una pipeline síncrona conserva su retorno síncrono cuando sus operadores lo permiten:

```ts
const safeDivide = pipe<object, readonly [divisor: number], number>(function (
  this: object,
  divisor: number,
): number {
  void this;
  if (divisor === 0) throw new Error('division by zero');
  return 100 / divisor;
}, fallback<object, readonly [divisor: number], number>(0));

safeDivide.call({}, 0); // 0
```

Para operaciones asíncronas, los operadores se componen de la misma forma:

```ts
const load = pipe<object, readonly [id: string], string>(
  async function (this: object, id: string): Promise<string> {
    void this;
    return fetchProfile(id);
  },
  retry<object, readonly [id: string], string>({ attempts: 3 }),
);

const profile = await load.call({}, '42');
```

`run` invoca una pipeline ya preparada conservando el receiver y la tupla de argumentos:

```ts
const receiver = { prefix: 'account' };
const format = pipe<typeof receiver, readonly [id: string], string>(function (
  this: typeof receiver,
  id: string,
): string {
  return `${this.prefix}:${id}`;
});

run(receiver, ['42'] as const, format); // 'account:42'
```

## Errores y observabilidad

La API funcional puede emitir eventos estructurados sin añadir una dependencia
de logging. Es opt-in: si no se pasa el cuarto argumento a `run`, la operación
no crea contexto de observabilidad.

```ts
import { retry } from 'annotations-design-patterns/operators';
import { LoggerEventSink } from 'annotations-design-patterns/observability';
import { pipe } from 'annotations-design-patterns/pipe';
import { run } from 'annotations-design-patterns/run';

const events = new LoggerEventSink({ log: (event) => console.info(event) });
const load = pipe(fetchProfile, retry({ attempts: 3 }));

await run(api, ['42'] as const, load, {
  operationId: 'profile-42',
  metadata: { requestId: 'request-7' },
  eventSink: events,
});
```

`TimeoutError` y `CircuitBreakerOpenError` heredan de `PolicyError` y exponen
códigos estables (`TIMEOUT` y `CIRCUIT_OPEN`), `cause` y metadata readonly.
Los errores de usuario siguen propagándose sin envolverse automáticamente.

## Políticas reutilizables

`definePolicy` agrupa los mismos operadores funcionales en una configuración
inmutable, validada antes de la primera invocación. Se exporta desde `/policy`:

```ts
import { definePolicy } from 'annotations-design-patterns/policy';
import { pipe } from 'annotations-design-patterns/pipe';

const profilePolicy = definePolicy<object, readonly [id: string], string>({
  fallback: { value: 'unavailable' },
  circuitBreaker: { failures: 3, resetMs: 5_000 },
  retry: { attempts: 3, delayMs: 100, idempotent: true },
  timeout: { ms: 1_000 },
});

const protectedLoad = pipe(loadProfile, profilePolicy.operator());
const stricterPolicy = profilePolicy.extend({ retry: { attempts: 5 } });
```

El orden por defecto es `fallback -> circuitBreaker -> retry -> timeout`. Las
capas se desactivan con `false`; `retry` exige `idempotent: true`, y las
combinaciones peligrosas se rechazan con `InvalidPolicyError` antes de ejecutar.
Consulta la [guía de políticas](./website/docs/guides/policy.md) para `describe()`
y más ejemplos.

`pipe(método, exterior, interior)` ejecuta primero el operador exterior. En esta primera
versión funcional, todas las etapas deben conservar el mismo receiver, tupla de argumentos
y tipo de resultado; no hay transformaciones heterogéneas entre operadores. Consulta la
[guía de `pipe`](./website/docs/guides/pipe.md) para el orden de los operadores y la
[guía de operadores](./website/docs/guides/operators.md) para la lista completa.

## Concurrencia e invalidación

`overlap` ofrece `drop`, `share` y cola FIFO por clave; `keyedLock` serializa
por clave sin bloquear claves independientes. Ambos aceptan un resolver de
clave explícito y respetan la clave opcional de `run`. Para caches con control
explícito, `memoizeWithHandle()` y `cachedForWithHandle()` devuelven
`{ operator, handle }`, donde el handle permite `invalidate(key)` y `clear()`.

```ts
import { memoizeWithHandle, overlap } from 'annotations-design-patterns/operators';

const deduplicate = overlap({ mode: 'share', key: ({ args }) => args[0] });
const cache = memoizeWithHandle({ key: (id: string) => id });
const load = pipe(loadProfile, deduplicate, cache.operator);

cache.handle.invalidate('42');
```

Consulta la [guía de concurrencia](./website/docs/guides/concurrency.md) para la
semántica de cola y los abortos de waiters. `switchOverlap` y `hedge` siguen
siendo [experimentales](./website/docs/guides/experimental.md) y no se exponen
como APIs estables.

## Store async y contexto Node

Los stores y la integración de request para Node se publican como subpaths
opt-in; el entrypoint raíz no importa APIs de Node.

```ts
import { AsyncMemoryStore, requireAtomicStore } from 'annotations-design-patterns/store';
import { getRequestContext, runWithRequestContext } from 'annotations-design-patterns/node';

const store = new AsyncMemoryStore<string, number>();
await store.update('attempts', (value) => (value ?? 0) + 1, { ttlMs: 60_000 });
requireAtomicStore(store, 'circuitBreaker');

await runWithRequestContext({ requestId: 'request-42' }, async () => {
  await Promise.resolve();
  console.log(getRequestContext()?.requestId);
});
```

`AsyncMemoryStore` es local al proceso e indica de forma explícita sus
capabilities; un store remoto debe declarar por separado su atomicidad y
consistencia. El subpath `/node` requiere Node 20+ y usa `AsyncLocalStorage`;
no lo importes en clientes de navegador. Consulta la [guía de stores y Node](./website/docs/guides/store-node.md)
para los límites de TTL y distribución.

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
  async submit(): Promise<void> {
    await saveDraft();
  }

  @When('review')
  @TransitionTo('published')
  approve(): void {}
}

const doc = new Doc();
const submitting = doc.submit();
doc.state; // 'draft' mientras saveDraft() sigue pendiente
await submitting;
doc.state; // 'review'
doc.submit(); // Error: no puede llamarse en el estado "review"
```

Con `@When` y `@TransitionTo`, coloca `@When` por encima de `@TransitionTo`: la guarda se evalúa antes de ejecutar el método.

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

## Fachada de decoradores

Los decoradores de resiliencia que comparten el motor interno también se pueden
importar desde una fachada estable. La raíz sigue siendo compatible para esos
exports.

```ts
import {
  CachedFor,
  CircuitBreaker,
  Fallback,
  Memoize,
  Retry,
  Timeout,
} from 'annotations-design-patterns/decorators';
```

La fachada no expone el adaptador TC39 ni los operadores internos. Para crear
pipelines sin decoradores, usa `/operators`, `/pipe` y `/run`.

## Imports granulares

Además del barrel, cada patrón se puede importar por su ruta (categoría/patrón):

```ts
import { Singleton } from 'annotations-design-patterns/creational/singleton';
import { Retry } from 'annotations-design-patterns/utility/retry';
```

La API funcional usa subpaths explícitos: `/operators`, `/pipe` y `/run`; los
decoradores de resiliencia también tienen `/decorators`. Los imports granulares
siguen disponibles solo por categoría (`/creational/*`, `/structural/*`,
`/behavioral/*` y `/utility/*`), por lo que rutas internas como `/core` no forman
parte de la API. Con un bundler moderno no necesitas imports granulares para
optimizar el bundle: los barrels son tree-shakeable.

## Limitaciones conocidas

- **Clave por defecto de `@Memoize`/`@CachedFor`** (`JSON.stringify`): lanza con argumentos circulares, colisiona con funciones/`Symbol` y es sensible al orden de propiedades. Escapes: la opción `key` o `@MemoizeByRef`.
- **`@Cloneable`, `@Adapt` e `@IterableOver`** añaden miembros en runtime que el sistema de tipos no puede ver (limitación de los decoradores TC39): usa los type helpers `WithClone<T>`, `Adapted<T, M>` y `WithIterator<T, I>`.
- **`@Fallback`** no puede cruzar el tipo del respaldo con el retorno del método (las factorías fijan sus genéricos antes de ver el método); pasa el genérico explícito `@Fallback<T>(valor)` para validar el valor.
- **`@Flyweight`** retiene sus instancias para siempre (es la esencia del patrón): úsalo con argumentos de cardinalidad acotada.
- **Herencia con `@Singleton`**: una base decorada y una derivada no decorada reciben instancias distintas. Las llamadas posteriores a la derivada reutilizan su instancia, pero su constructor sigue ejecutándose por la semántica de JavaScript y puede mutar campos propios.
- **`Container`**: sólo admite providers síncronos `useValue`, `useClass` y `useFactory`, con scope `singleton` o `transient`. Los ciclos síncronos se rechazan con `CircularDependencyError`; no hay scopes, providers async, contenedores hijo, disposal ni unregister.
- **Pipelines funcionales homogéneas**: `pipe` exige que todos los operadores conserven el mismo receiver, tupla de argumentos y tipo de resultado. `@Mutex` y `@Semaphore` todavía no forman parte de la API funcional; usa `definePolicy` para componer las cuatro capas de resiliencia estables.

## Licencia

[ISC](./LICENSE) © Enrique
