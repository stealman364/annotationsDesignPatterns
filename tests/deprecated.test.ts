import { afterEach, describe, expect, it, vi } from 'vitest';
import { Deprecated } from '../src/patterns/utility/deprecated';

describe('@Deprecated', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('avisa por console.warn solo la primera vez y el método sigue funcionando', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    class Legacy {
      @Deprecated('usa newMethod()')
      oldMethod(): string {
        return 'ok';
      }
    }

    const l = new Legacy();
    expect(l.oldMethod()).toBe('ok');
    expect(l.oldMethod()).toBe('ok');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[deprecated] oldMethod: usa newMethod()');
  });

  it('usa un mensaje por defecto si no se indica ninguno', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    class Legacy {
      @Deprecated()
      oldMethod(): void {}
    }

    new Legacy().oldMethod();
    expect(warn).toHaveBeenCalledWith('[deprecated] oldMethod: este método está obsoleto');
  });
});
