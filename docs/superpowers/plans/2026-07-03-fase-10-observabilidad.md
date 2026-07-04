# Fase 10: Observabilidad — @Log, @Measure, @On — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN. Antes de empezar, invoca las skills
> `typescript-best-practices` y `test-driven-development`. Al terminar, invoca `verify`.
> Prerrequisito: Fase 9 completada (`npm test` con 148 tests en verde).
> Marca los checkboxes editando la línea existente (`- [ ]` → `- [x]`).

**Goal:** Tres decoradores de observabilidad: `@Log` (registra llamada, argumentos, éxito/error y duración), `@Measure` (entrega métricas de duración a un callback) y `@On` (auto-suscribe un método a un `Subject` al construir la instancia — el complemento de `@Emits`).

**Architecture:** `@Log` y `@Measure` van en `src/patterns/utility/` y soportan métodos síncronos y asíncronos (si el resultado es una Promise, el log/medición se emite al resolver o rechazar). `@On` va en `src/patterns/behavioral/` con import SOLO de tipo desde `./observer` (cero acoplamiento en runtime) y usa `context.addInitializer` como `@Bind`.

**Tech Stack:** TypeScript 5 (decoradores TC39), vitest.

---

### Task 1: @Log

**Files:**
- Create: `src/patterns/utility/log.ts`
- Modify: `src/index.ts`
- Test: `tests/log.test.ts`

- [x] **Step 1: Escribir los tests que fallan**

Crea `tests/log.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Log } from '../src/patterns/utility/log';

describe('@Log', () => {
  it('registra la llamada con argumentos y el éxito con duración', () => {
    const lines: string[] = [];

    class Greeter {
      @Log({ logger: (m) => lines.push(m) })
      greet(name: string): string {
        return `Hola, ${name}`;
      }
    }

    expect(new Greeter().greet('Ana')).toBe('Hola, Ana');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('→ greet("Ana")');
    expect(lines[1]).toMatch(/^← greet ✓ \d+ ms$/);
  });

  it('registra el error con duración y lo propaga', () => {
    const lines: string[] = [];

    class Job {
      @Log({ logger: (m) => lines.push(m) })
      run(): void {
        throw new Error('boom');
      }
    }

    expect(() => new Job().run()).toThrow('boom');
    expect(lines[1]).toMatch(/^← run ✗ \d+ ms: Error: boom$/);
  });

  it('soporta métodos async (el log final llega tras resolver)', async () => {
    const lines: string[] = [];

    class Api {
      @Log({ logger: (m) => lines.push(m) })
      async fetch(id: number): Promise<string> {
        return `dato-${id}`;
      }
    }

    await expect(new Api().fetch(7)).resolves.toBe('dato-7');
    expect(lines[0]).toBe('→ fetch(7)');
    expect(lines[1]).toMatch(/^← fetch ✓ \d+ ms$/);
  });

  it('label sustituye el nombre y los argumentos no serializables no rompen', () => {
    const lines: string[] = [];

    class Svc {
      @Log({ logger: (m) => lines.push(m), label: 'Svc.process' })
      process(fn: () => void): number {
        void fn;
        return 1;
      }
    }

    expect(new Svc().process(() => {})).toBe(1);
    expect(lines[0]).toMatch(/^→ Svc\.process\(/);
  });
});
```

- [x] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/log.test.ts`
Expected: FAIL — no existe `src/patterns/utility/log.ts`.

- [x] **Step 3: Implementación**

Crea `src/patterns/utility/log.ts`:

```ts
export interface LogOptions {
  /** Destino de los mensajes. Por defecto `console.log`. */
  logger?: (message: string) => void;
  /** Etiqueta del método en los mensajes. Por defecto su nombre. */
  label?: string;
}

function formatArg(arg: unknown): string {
  try {
    return JSON.stringify(arg) ?? String(arg);
  } catch {
    return String(arg);
  }
}

/**
 * Registra cada llamada al método: entrada con argumentos, y salida con
 * éxito (✓) o error (✗) y duración en ms. Si el método devuelve una
 * Promise, el mensaje de salida se emite al resolver o rechazar. Los
 * errores se propagan intactos.
 *
 * @example
 * ```ts
 * class Api {
 *   @Log() // console.log por defecto
 *   fetchUser(id: string): User { ... }
 *
 *   @Log({ logger: (m) => miLogger.info(m), label: 'Api.criticalPath' })
 *   critical(): void { ... }
 * }
 * ```
 */
export function Log({ logger = console.log, label }: LogOptions = {}) {
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Log solo puede aplicarse a un método');
    }
    const name = label ?? String(context.name);
    return function (this: This, ...args: Args): Return {
      logger(`→ ${name}(${args.map(formatArg).join(', ')})`);
      const start = Date.now();
      try {
        const result = target.call(this, ...args);
        if (result instanceof Promise) {
          return result.then(
            (value: unknown) => {
              logger(`← ${name} ✓ ${Date.now() - start} ms`);
              return value;
            },
            (error: unknown) => {
              logger(`← ${name} ✗ ${Date.now() - start} ms: ${String(error)}`);
              throw error;
            },
          ) as Return;
        }
        logger(`← ${name} ✓ ${Date.now() - start} ms`);
        return result;
      } catch (error) {
        logger(`← ${name} ✗ ${Date.now() - start} ms: ${String(error)}`);
        throw error;
      }
    };
  };
}
```

- [x] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/log.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { Log, type LogOptions } from './patterns/utility/log';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Log"
```

### Task 2: @Measure

**Files:**
- Create: `src/patterns/utility/measure.ts`
- Modify: `src/index.ts`
- Test: `tests/measure.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `tests/measure.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Measure, type MeasureReport } from '../src/patterns/utility/measure';

describe('@Measure', () => {
  it('reporta método, duración y éxito', () => {
    const reports: MeasureReport[] = [];

    class Calc {
      @Measure((r) => reports.push(r))
      add(a: number, b: number): number {
        return a + b;
      }
    }

    expect(new Calc().add(2, 3)).toBe(5);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ method: 'add', ok: true });
    expect(reports[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reporta ok: false cuando el método lanza y propaga el error', () => {
    const reports: MeasureReport[] = [];

    class Job {
      @Measure((r) => reports.push(r))
      run(): void {
        throw new Error('boom');
      }
    }

    expect(() => new Job().run()).toThrow('boom');
    expect(reports[0]).toMatchObject({ method: 'run', ok: false });
  });

  it('mide métodos async hasta que resuelven o rechazan', async () => {
    const reports: MeasureReport[] = [];

    class Api {
      @Measure((r) => reports.push(r))
      async ok(): Promise<number> {
        return 1;
      }

      @Measure((r) => reports.push(r))
      async bad(): Promise<number> {
        throw new Error('x');
      }
    }

    await expect(new Api().ok()).resolves.toBe(1);
    await expect(new Api().bad()).rejects.toThrow('x');
    expect(reports.map((r) => [r.method, r.ok])).toEqual([
      ['ok', true],
      ['bad', false],
    ]);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/measure.test.ts`
Expected: FAIL — no existe `src/patterns/utility/measure.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/utility/measure.ts`:

```ts
/** Métrica de una ejecución del método medido. */
export interface MeasureReport {
  method: string;
  durationMs: number;
  ok: boolean;
}

/**
 * Mide la duración de cada ejecución del método y la entrega al callback
 * (para métricas, histogramas, APM…). Si el método devuelve una Promise,
 * mide hasta que resuelve o rechaza. Los errores se propagan intactos.
 *
 * @example
 * ```ts
 * class Api {
 *   @Measure((r) => metrics.histogram('api.fetch', r.durationMs, { ok: r.ok }))
 *   async fetch(id: string): Promise<Data> { ... }
 * }
 * ```
 */
export function Measure(onMeasure: (report: MeasureReport) => void) {
  return function <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Measure solo puede aplicarse a un método');
    }
    const method = String(context.name);
    return function (this: This, ...args: Args): Return {
      const start = Date.now();
      const report = (ok: boolean): void => {
        onMeasure({ method, durationMs: Date.now() - start, ok });
      };
      try {
        const result = target.call(this, ...args);
        if (result instanceof Promise) {
          return result.then(
            (value: unknown) => {
              report(true);
              return value;
            },
            (error: unknown) => {
              report(false);
              throw error;
            },
          ) as Return;
        }
        report(true);
        return result;
      } catch (error) {
        report(false);
        throw error;
      }
    };
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/measure.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Exportar, suite completa y commit**

En `src/index.ts`, añade al final del bloque `// Utilitarios de método`:

```ts
export { Measure, type MeasureReport } from './patterns/utility/measure';
```

Run: `npm test` — Expected: PASS.
Run: `npm run typecheck` — Expected: sin errores.

```bash
git add -A
git commit -m "feat: decorador @Measure"
```

### Task 3: @On

**Files:**
- Create: `src/patterns/behavioral/on.ts`
- Modify: `src/index.ts`
- Test: `tests/on.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crea `tests/on.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Subject } from '../src/patterns/behavioral/observer';
import { On } from '../src/patterns/behavioral/on';

describe('@On', () => {
  it('suscribe el método al construir la instancia, con this correcto', () => {
    const bus = new Subject();
    const received: string[] = [];

    class Audit {
      prefix = 'audit:';

      @On(bus, 'user:created')
      onUser(payload: unknown): void {
        received.push(`${this.prefix}${String(payload)}`);
      }
    }

    bus.emit('user:created', 'antes'); // sin instancias: nadie escucha
    new Audit();
    bus.emit('user:created', 'Ana');

    expect(received).toEqual(['audit:Ana']);
  });

  it('cada instancia se suscribe por separado', () => {
    const bus = new Subject();
    let calls = 0;

    class Listener {
      @On(bus, 'tick')
      onTick(): void {
        calls++;
      }
    }

    new Listener();
    new Listener();
    bus.emit('tick', null);
    expect(calls).toBe(2);
  });

  it('un método puede escuchar varios eventos con decoradores apilados', () => {
    const bus = new Subject();
    const events: unknown[] = [];

    class Recorder {
      @On(bus, 'a')
      @On(bus, 'b')
      record(payload: unknown): void {
        events.push(payload);
      }
    }

    new Recorder();
    bus.emit('a', 1);
    bus.emit('b', 2);
    expect(events).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run tests/on.test.ts`
Expected: FAIL — no existe `src/patterns/behavioral/on.ts`.

- [ ] **Step 3: Implementación**

Crea `src/patterns/behavioral/on.ts`:

```ts
import type { Subject } from './observer';

/**
 * Auto-suscribe el método al evento del `Subject` al construir cada
 * instancia (complemento de @Emits). El método recibe el payload del
 * evento y conserva su `this`. Apilable para escuchar varios eventos.
 *
 * Nota: la suscripción vive tanto como el Subject — las instancias no se
 * dan de baja automáticamente; si el Subject sobrevive a las instancias,
 * las retendrá.
 *
 * @example
 * ```ts
 * const bus = new Subject();
 *
 * class Audit {
 *   @On(bus, 'user:created')
 *   onUserCreated(user: unknown): void { ... }
 * }
 * new Audit(); // ya está escuchando
 * ```
 */
export function On(subject: Subject<Record<string, unknown>>, event: string) {
  return function <This, Return>(
    target: (this: This, payload: never) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, payload: never) => Return>,
  ): void {
    if (context.kind !== 'method') {
      throw new TypeError('@On solo puede aplicarse a un método');
    }
    context.addInitializer(function (this: This) {
      subject.on(event, (payload) => {
        (target as (this: This, payload: unknown) => Return).call(this, payload);
      });
    });
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run tests/on.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Exportar, suite completa, lint, build y commit**

En `src/index.ts`, añade al final del bloque `// De comportamiento`:

```ts
export { On } from './patterns/behavioral/on';
```

Run: `npm test` — Expected: PASS (158 tests).
Run: `npm run typecheck` — Expected: sin errores.
Run: `npm run format` — aplica el formato.
Run: `npm run lint` — Expected: sin errores.
Run: `npm run build` — Expected: sin errores.

- [ ] **Step 6: Invocar la skill `verify` y después commitear**

```bash
git add -A
git commit -m "feat: decorador @On (auto-suscripcion a Subject)"
```

## Criterio de salida de la Fase 10

- `npm test` (158 tests), `npm run typecheck`, `npm run lint`, `npm run format:check`
  y `npm run build` en verde.
- Exports nuevos: `Log`/`LogOptions`, `Measure`/`MeasureReport`, `On`.
- Todo commiteado.
