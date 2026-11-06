import type { Subject } from './observer';

/**
 * Auto-suscribe el método al evento del `Subject` al construir cada
 * instancia (complemento de @Emits). El método recibe el payload del
 * evento y conserva su `this`. Apilable para escuchar varios eventos.
 * Un Subject tipado comprueba tanto el nombre como el payload del listener.
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
export function On<Events extends object, Key extends keyof Events & string>(
  subject: Subject<Events>,
  event: Key,
): <This, Return>(
  target: (this: This, payload: Events[Key]) => Return,
  context: ClassMethodDecoratorContext<This>,
) => void;
export function On<
  Bus extends Subject<Record<string, unknown>>,
  Key extends Parameters<Bus['emit']>[0],
>(
  subject: Bus,
  event: Key,
): <This, Payload, Return>(
  target: (this: This, payload: Payload) => Return,
  context: ClassMethodDecoratorContext<This> &
    (Bus['on'] extends (event: Key, listener: (payload: Payload) => Return) => unknown
      ? unknown
      : never),
) => void;
export function On(subject: Subject<Record<string, unknown>>, event: string) {
  return function <This, Payload, Return>(
    target: (this: This, payload: Payload) => Return,
    context: ClassMethodDecoratorContext<This>,
  ): void {
    if (context.kind !== 'method') {
      throw new TypeError('@On solo puede aplicarse a un método');
    }
    context.addInitializer(function (this: This) {
      subject.on(event, (payload) => {
        target.call(this, payload as Payload);
      });
    });
  };
}
