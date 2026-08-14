/**
 * Convierte la clase en un singleton: todas las llamadas a `new` devuelven
 * la misma instancia. Los argumentos de construcciones posteriores a la
 * primera se ignoran.
 *
 * @example
 * ```ts
 * @Singleton
 * class Database {
 *   connect() { ... }
 * }
 * new Database() === new Database(); // true
 * ```
 */
export function Singleton<T extends new (...args: never[]) => object>(
  target: T,
  context: ClassDecoratorContext<T>,
): T {
  if (context.kind !== 'class') {
    throw new TypeError('@Singleton solo puede aplicarse a una clase');
  }
  const instances = new WeakMap<object, InstanceType<T>>();
  return new Proxy(target, {
    construct(original, args, newTarget) {
      const constructor = newTarget as object;
      const singleton =
        instances.get(constructor) ??
        (Reflect.construct(original, args, newTarget) as InstanceType<T>);
      instances.set(constructor, singleton);
      return singleton;
    },
  });
}
