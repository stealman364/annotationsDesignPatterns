import { describe, expect, it } from 'vitest';
import { Validate } from '../src/patterns/utility/validate';

describe('@Validate', () => {
  it('deja pasar los argumentos válidos', () => {
    class Account {
      balance = 0;

      @Validate((amount: number) => amount > 0 || 'el importe debe ser positivo')
      deposit(amount: number): void {
        this.balance += amount;
      }
    }

    const account = new Account();
    account.deposit(50);
    expect(account.balance).toBe(50);
  });

  it('lanza TypeError con el motivo y no ejecuta el método', () => {
    class Account {
      balance = 0;

      @Validate((amount: number) => amount > 0 || 'el importe debe ser positivo')
      deposit(amount: number): void {
        this.balance += amount;
      }
    }

    const account = new Account();
    expect(() => account.deposit(-5)).toThrow(
      'Argumentos inválidos en deposit: el importe debe ser positivo',
    );
    expect(account.balance).toBe(0);
  });

  it('usa un mensaje genérico cuando el guard devuelve false', () => {
    class Calc {
      @Validate((n: number) => n >= 0)
      sqrt(n: number): number {
        return Math.sqrt(n);
      }
    }

    expect(() => new Calc().sqrt(-1)).toThrow('Argumentos inválidos en sqrt: la validación falló');
  });

  it('valida varios argumentos a la vez', () => {
    class Range {
      @Validate((min: number, max: number) => min <= max || 'min no puede ser mayor que max')
      set(min: number, max: number): [number, number] {
        return [min, max];
      }
    }

    expect(new Range().set(1, 5)).toEqual([1, 5]);
    expect(() => new Range().set(9, 2)).toThrow('min no puede ser mayor que max');
  });
});
