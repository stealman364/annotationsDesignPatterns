---
sidebar_position: 5
---

# Políticas reutilizables con `definePolicy`

`definePolicy` agrupa los mismos operadores funcionales de resiliencia en una configuración **inmutable y validada**, que puedes reutilizar en múltiples pipelines o extender en nuevas políticas derivadas.

## Importación

```ts
import { definePolicy } from 'annotations-design-patterns/policy';
import { pipe } from 'annotations-design-patterns/pipe';
```

## Sintaxis básica

```ts
const profilePolicy = definePolicy<Receiver, Args, Return>({
  fallback: { value: defaultValue },
  circuitBreaker: { failures: 3, resetMs: 5_000 },
  retry: { attempts: 3, delayMs: 100, idempotent: true },
  timeout: { ms: 1_000 },
});
```

**Solo activas las capas que necesitas.** Las que faltan o `false` se desactivan.

## Orden por defecto

Las capas se ejecutan en este orden (de afuera hacia adentro):

1. **fallback** — más externo, atrapa y retorna valor
2. **circuitBreaker** — frena tras fallos
3. **retry** — reintenta
4. **timeout** — más interno (limita tiempo)

Es el orden más lógico para resiliencia: si todo falla, el fallback lo atrapa.

## Ejemplo completo

```ts
const profilePolicy = definePolicy<object, readonly [id: string], string>({
  fallback: { value: 'unavailable' },
  circuitBreaker: { failures: 3, resetMs: 5_000 },
  retry: { attempts: 3, delayMs: 100, idempotent: true },
  timeout: { ms: 1_000 },
});

const loadProfile = pipe(
  async (id: string) => fetchProfile(id),
  profilePolicy.operator(),
);

// Úsalo
const profile = await loadProfile.call({}, '42');
```

## Extender una política

Usa `.extend()` para crear una nueva política con opciones sobrescritas:

```ts
const stricterPolicy = profilePolicy.extend({
  retry: { attempts: 5, delayMs: 50, idempotent: true },
  timeout: { ms: 500 },
});

const strictLoad = pipe(fetchProfile, stricterPolicy.operator());
```

La política original **no cambia** — `.extend()` retorna una nueva.

## Validación

`definePolicy` valida la configuración **antes de la primera invocación**:

- **`retry` exige `idempotent: true`** — las politicas de reintento sin garantía de idempotencia se rechazan con `InvalidPolicyError`.
- **Combinaciones peligrosas se detectan** — p. ej. una política que no puede garantizar correctitud lanza error al compilarla, no al ejecutarla.

## Capas disponibles

- `fallback: { value: T | () => T }` — Valor o función que retorna respaldo
- `circuitBreaker: { failures: number, resetMs: number }` — Abre tras N fallos consecutivos
- `retry: { attempts: number, delayMs?: number, backoffFactor?: number, idempotent: boolean }` — Reintentos con backoff
- `timeout: { ms: number }` — Límite de tiempo

Todas son opcionales. Pasa `false` para desactivar una capa específica:

```ts
const noRetry = profilePolicy.extend({ retry: false });
```

## Métodos de PolicyDefinition

### `operator()`

Retorna un operador funcional para usar en `pipe`:

```ts
const pipeline = pipe(method, policy.operator());
```

### `extend(overrides)`

Retorna una nueva política con cambios:

```ts
const derived = policy.extend({ retry: { attempts: 5, idempotent: true } });
```

### `describe()` (avanzado)

Genera una descripción textual de la política (útil para logs):

```ts
console.log(policy.describe());
// "Fallback('unavailable') → CircuitBreaker(3/5000ms) → Retry(3x) → Timeout(1000ms)"
```

## Para tipos y opciones avanzadas

Consulta la [Referencia de policy](/docs/api/policy).
