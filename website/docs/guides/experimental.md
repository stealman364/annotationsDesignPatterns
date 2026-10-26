---
sidebar_position: 9
---

# Experimental: `switchOverlap` y `hedge`

Dos operadores bajo investigación que **no son APIs estables**. Úsalos solo si sabes qué haces y acepta que su comportamiento o firma pueden cambiar en versiones futuras.

## `switchOverlap`

Deduplicación con cambio de canal cuando falla una operación.

```ts
import { switchOverlap } from 'annotations-design-patterns/experimental';

const load = pipe(
  fetchData,
  switchOverlap({ key: ({ args }) => args[0], backoffMs: 100 }),
);
```

**Comportamiento:**
- Primera llamada inicia la operación
- Llamadas posteriores con la misma clave esperan
- Si falla, los waiters se activan y pueden reintentar independientemente (cambio de canal)

**Por qué experimental:**
- La semántica de "cambio" vs "fallos independientes" no está totalmente validada en producción
- Pueden haber edge cases con timeouts y backoff

## `hedge` (Hedged requests)

Lanza múltiples solicitudes en paralelo y retorna la primera exitosa.

```ts
import { hedge } from 'annotations-design-patterns/experimental';

const fastFetch = pipe(
  fetch,
  hedge({ delayBeforeHedgeMs: 100, maxHedges: 2 }),
);
```

**Comportamiento:**
- Primera llamada se ejecuta inmediatamente
- Si no termina en `delayBeforeHedgeMs`, se lanza una segunda copia
- Retorna la primera que termina exitosamente
- Cancela las demás

**Por qué experimental:**
- El uso de cancellations (`AbortSignal`) está en evolución
- Validación en escenarios reales aún en curso
- Puede ser costoso para operaciones pesadas

## Alternativa estable

Para la mayoría de casos de producción, **usa `overlap` con `mode: 'share'`** o `definePolicy` con las capas estables:

```ts
// Estable: comparte resultado sin cancelaciones complejas
const safeFetch = pipe(
  fetch,
  overlap({ mode: 'share', key: ({ args }) => args[0] }),
);

// O con política:
const policy = definePolicy({ retry: { attempts: 3, idempotent: true } });
const load = pipe(fetch, policy.operator());
```

## Ubicación en la codebase

Ambos operadores viven en `/api/experimental`:

```ts
import type { SwitchOverlap, Hedge } from 'annotations-design-patterns/experimental';
```

Para documentación completa (aunque sujeta a cambios), consulta la [Referencia de experimental](/docs/api/experimental).

## Reporte de problemas

Si encuentras comportamientos inesperados, repórtalo en GitHub — la API y semántica están en revisión activa.
