import { describe, expect, expectTypeOf, it } from 'vitest';
import { builderFor, type Builder } from '../src/patterns/creational/builder';

class User {
  name = '';
  age = 0;
  email = '';
}

describe('builderFor', () => {
  it('construye el objeto con los valores encadenados', () => {
    const user = builderFor(User).withName('Ana').withAge(30).withEmail('ana@example.com').build();

    expect(user).toBeInstanceOf(User);
    expect(user).toMatchObject({ name: 'Ana', age: 30, email: 'ana@example.com' });
  });

  it('las propiedades no establecidas conservan su valor por defecto', () => {
    const user = builderFor(User).withName('Bob').build();

    expect(user.name).toBe('Bob');
    expect(user.age).toBe(0);
  });

  it('cada builder es independiente', () => {
    const a = builderFor(User).withName('A').build();
    const b = builderFor(User).withName('B').build();

    expect(a.name).toBe('A');
    expect(b.name).toBe('B');
  });

  it('lanza ante métodos que no existen', () => {
    const builder = builderFor(User) as unknown as Record<string, () => unknown>;
    expect(() => builder['withSalary']!()).not.toThrow();
    expect(() => builder['delete']!()).toThrow(TypeError);
  });

  it('los tipos del builder son fluidos y estrictos', () => {
    const builder = builderFor(User);
    expectTypeOf(builder.withName).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(builder.withAge).parameter(0).toEqualTypeOf<number>();
    expectTypeOf(builder.build()).toEqualTypeOf<User>();
    expectTypeOf(builder.withName('x')).toEqualTypeOf<Builder<User>>();
  });
});
