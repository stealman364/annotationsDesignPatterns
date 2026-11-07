---
sidebar_position: 9
---

# APIs experimentales

Estos operadores son opcionales y pueden cambiar en futuras versiones. Antes de usarlos en producción, revisa cómo gestionan la concurrencia y la cancelación.

## `switchOverlap`

`switchOverlap` aplica una política de «gana la llamada más reciente» a llamadas simultáneas con la misma clave. Una llamada nueva rechaza el resultado de la anterior con `OverlapSupersededError` e inicia su propio trabajo.

```ts
import { switchOverlap } from 'annotations-design-patterns/experimental';
import { pipe } from 'annotations-design-patterns/pipe';

interface Data {
  readonly value: string;
}

declare function fetchData(id: string): Promise<Data>;

const load = pipe(
  fetchData,
  switchOverlap<object, readonly [string], Data>({
    key: ({ args }) => args[0],
  }),
);
```

Al sustituir una llamada, se rechaza el resultado que esperaba su consumidor, pero el trabajo subyacente continúa. JavaScript no puede detenerlo salvo que la propia operación coopere con la cancelación. Este operador no pone llamadas en cola ni deduplica sus resultados.

## `hedge`

`hedge` inicia la operación de inmediato y, tras `delayMs`, lanza una copia si para entonces ninguna llamada ha tenido éxito. Devuelve el primer resultado satisfactorio. La operación debe ser idempotente, ya que ambas llamadas pueden realizar trabajo. El operador no cancela la llamada perdedora: esta puede continuar después de que se resuelva la promesa devuelta. Si ambas llamadas fallan, la promesa devuelta se rechaza.

```ts
import { hedge } from 'annotations-design-patterns/experimental';
import { pipe } from 'annotations-design-patterns/pipe';

interface Data {
  readonly value: string;
}

declare function fetchData(id: string): Promise<Data>;

const fastFetch = pipe(
  fetchData,
  hedge<object, readonly [string], Data>({ delayMs: 100, idempotent: true }),
);
```

`delayMs` debe ser un número finito no negativo. La API no ofrece una opción `maxHedges`; esta implementación lanza como máximo una copia adicional.

## Nuevas APIs experimentales en 2.3

La versión candidata 2.3 añade cancelación compartida experimental para `memoize`, `cachedFor` y `overlap` en modo `share`, mediante `cancelWhenUnused`. Cuando el último consumidor interesado se retira, la operación compartida recibe una señal de cancelación. El trabajo subyacente solo se detiene si la atiende; la expulsión o invalidación de una entrada de caché no cuenta como retirada de consumidores.

`observeOperation` registra el resultado y la duración visibles en su posición de la tubería. Los datos de invocación se incluyen solo si se solicitan. La observación corresponde al resultado del consumidor, que puede terminar antes que el trabajo compartido del backend.

`asyncCachedFor` usa un proveedor asíncrono que declara capacidad TTL, una clave, un espacio de nombres, una versión de esquema, un codec, una política de fallos y un plazo de I/O. El plazo limita cuánto espera el consumidor; no garantiza que se detenga una petición al proveedor ya iniciada. `VersionedMemoryStore` es una implementación local de referencia para compare-and-set, no un servicio de coordinación distribuida.

Consulta la [guía de migración a 2.3](../migration/2.3.md) para conocer el estado de la versión, sus garantías y otros límites. La [referencia de la API experimental](/docs/api/experimental) contiene las firmas exportadas.

## Alternativas estables

Para llamadas dentro del proceso que deban compartir un resultado en vez de sustituirse, usa el operador estable `overlap` con `mode: 'share'`:

```ts
import { overlap } from 'annotations-design-patterns/operators';
import { pipe } from 'annotations-design-patterns/pipe';

interface Data {
  readonly value: string;
}

declare function fetchData(id: string): Promise<Data>;

const safeFetch = pipe(
  fetchData,
  overlap<object, readonly [string], Data>({
    mode: 'share',
    key: ({ args }) => args[0],
  }),
);
```

Para reintentos y fallback, usa la API estable `definePolicy` de `annotations-design-patterns/policy`.

## Informar de problemas

Si encuentras un comportamiento inesperado, abre un issue con la versión del paquete y una reproducción mínima.
