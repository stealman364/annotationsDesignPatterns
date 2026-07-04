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
    target: (this: This, payload: unknown) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, payload: unknown) => Return>,
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
