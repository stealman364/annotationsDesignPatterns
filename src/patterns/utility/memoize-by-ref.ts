interface CacheNode<Return> {
  hasResult: boolean;
  result: Return | undefined;
  primitives: Map<unknown, CacheNode<Return>> | undefined;
  objects: WeakMap<object, CacheNode<Return>> | undefined;
}

function createNode<Return>(): CacheNode<Return> {
  return { hasResult: false, result: undefined, primitives: undefined, objects: undefined };
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

/**
 * Como @Memoize pero comparando los argumentos por IDENTIDAD (referencia),
 * sin serialización: cada nivel de un trie interno indexa un argumento —
 * los primitivos en un `Map` (SameValueZero: `NaN` funciona) y los
 * objetos/funciones en un `WeakMap`, de modo que las entradas se liberan
 * solas cuando el objeto argumento es recolectado.
 *
 * Semántica distinta a @Memoize: la MISMA referencia acierta la cache, pero
 * dos literales estructuralmente iguales (`{a:1}` y `{a:1}`) son entradas
 * DISTINTAS. Ideal para métodos que reciben entidades o funciones; inútil si
 * cada llamada construye el argumento de cero.
 *
 * Ventajas frente a la clave `JSON.stringify` de @Memoize: los argumentos
 * circulares no lanzan, las funciones y `Symbol` no colisionan y el orden de
 * propiedades es irrelevante.
 *
 * @example
 * ```ts
 * class Renderer {
 *   @MemoizeByRef
 *   layout(document: Document): Layout { ... } // misma entidad → cache
 * }
 * ```
 */
export function MemoizeByRef<This, Args extends unknown[], Return>(
  target: (this: This, ...args: Args) => Return,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
): (this: This, ...args: Args) => Return {
  if (context.kind !== 'method') {
    throw new TypeError('@MemoizeByRef solo puede aplicarse a un método');
  }
  const roots = new WeakMap<object, CacheNode<Return>>();
  return function (this: This, ...args: Args): Return {
    const self = this as object;
    let node = roots.get(self);
    if (!node) {
      node = createNode<Return>();
      roots.set(self, node);
    }
    for (const arg of args) {
      if (isObjectLike(arg)) {
        node.objects ??= new WeakMap<object, CacheNode<Return>>();
        let child = node.objects.get(arg);
        if (!child) {
          child = createNode<Return>();
          node.objects.set(arg, child);
        }
        node = child;
      } else {
        node.primitives ??= new Map<unknown, CacheNode<Return>>();
        let child = node.primitives.get(arg);
        if (!child) {
          child = createNode<Return>();
          node.primitives.set(arg, child);
        }
        node = child;
      }
    }
    if (node.hasResult) {
      return node.result as Return;
    }
    const result = target.call(this, ...args);
    node.hasResult = true;
    node.result = result;
    return result;
  };
}
