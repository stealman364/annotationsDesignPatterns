/**
 * Patrón Flyweight: comparte instancias por combinación de argumentos del
 * constructor (clave `JSON.stringify(args)`). `new Color('red')` devuelve
 * siempre el mismo objeto para los mismos argumentos. Pensado para objetos
 * de valor inmutables que se repiten mucho.
 *
 * @example
 * ```ts
 * @Flyweight
 * class Color {
 *   constructor(public name: string) {}
 * }
 * new Color('red') === new Color('red'); // true
 * ```
 */
export function Flyweight<T extends new (...args: any[]) => object>(
  target: T,
  context: ClassDecoratorContext<T>
): T {
  if (context.kind !== 'class') {
    throw new TypeError('@Flyweight solo puede aplicarse a una clase');
  }
  const instances = new Map<string, InstanceType<T>>();
  return new Proxy(target, {
    construct(original, args, newTarget) {
      const key = JSON.stringify(args);
      let instance = instances.get(key);
      if (!instance) {
        instance = Reflect.construct(original, args, newTarget) as InstanceType<T>;
        instances.set(key, instance);
      }
      return instance;
    },
  });
}
