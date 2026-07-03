/**
 * Guard de validación: devuelve `true` si los argumentos son válidos,
 * `false` (mensaje genérico) o un string con el motivo si no lo son.
 */
export type Guard<Args extends unknown[]> = (...args: Args) => boolean | string;

/**
 * Valida los argumentos antes de ejecutar el método: si el guard no
 * devuelve `true`, lanza `TypeError` con el motivo y el método NO se
 * ejecuta (precondiciones, diseño por contrato).
 *
 * @example
 * ```ts
 * class Account {
 *   @Validate((amount: number) => amount > 0 || 'el importe debe ser positivo')
 *   deposit(amount: number): void { ... }
 * }
 * ```
 */
export function Validate<Args extends unknown[]>(guard: Guard<Args>) {
  return function <This, Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Return>,
  ): (this: This, ...args: Args) => Return {
    if (context.kind !== 'method') {
      throw new TypeError('@Validate solo puede aplicarse a un método');
    }
    const methodName = String(context.name);
    return function (this: This, ...args: Args): Return {
      const verdict = guard(...args);
      if (verdict !== true) {
        const reason = typeof verdict === 'string' ? verdict : 'la validación falló';
        throw new TypeError(`Argumentos inválidos en ${methodName}: ${reason}`);
      }
      return target.call(this, ...args);
    };
  };
}
