import { describe, expect, it } from 'vitest';
import { Intercept } from '../src/patterns/structural/intercept';

describe('@Intercept', () => {
  it('el interceptor puede observar la llamada y delegar con proceed()', () => {
    const log: string[] = [];

    class Api {
      @Intercept<Api, [string], string>((invocation) => {
        log.push(`antes de ${invocation.methodName}(${invocation.args[0]})`);
        const result = invocation.proceed();
        log.push(`después: ${result}`);
        return result;
      })
      greet(name: string): string {
        return `Hola, ${name}`;
      }
    }

    expect(new Api().greet('Ana')).toBe('Hola, Ana');
    expect(log).toEqual(['antes de greet(Ana)', 'después: Hola, Ana']);
  });

  it('el interceptor puede cortocircuitar sin llamar al método original', () => {
    let executed = false;

    class Guarded {
      @Intercept<Guarded, [], string>(() => 'bloqueado')
      secret(): string {
        executed = true;
        return 'dato sensible';
      }
    }

    expect(new Guarded().secret()).toBe('bloqueado');
    expect(executed).toBe(false);
  });

  it('el interceptor puede modificar los argumentos', () => {
    class Math2 {
      @Intercept<Math2, [number], number>((invocation) => {
        invocation.args[0] = Math.abs(invocation.args[0]);
        return invocation.proceed();
      })
      sqrt(n: number): number {
        return Math.sqrt(n);
      }
    }

    expect(new Math2().sqrt(-9)).toBe(3);
  });
});
