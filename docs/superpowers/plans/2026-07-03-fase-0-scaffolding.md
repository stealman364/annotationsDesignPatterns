# Fase 0: Scaffolding — Plan de implementación

> **Para agentes de IA:** Ejecuta los pasos EN ORDEN, marcando cada checkbox `- [ ]`.
> Antes de empezar, invoca la skill `typescript-best-practices`. Al terminar la última
> tarea, invoca la skill `verify`. No uses `experimentalDecorators`.

**Goal:** Dejar el proyecto listo para desarrollar: TypeScript 5 estricto, build con tsup (ESM+CJS+tipos), tests con vitest, y un smoke test que demuestra que los decoradores TC39 funcionan en el toolchain.

**Architecture:** Paquete npm único. Código en `src/`, tests en `tests/`, build a `dist/`. Subpath exports (`"./*"`) para imports granulares y `sideEffects: false` para tree-shaking.

**Tech Stack:** TypeScript 5+, tsup, vitest. Cero dependencias de runtime.

---

### Task 1: package.json y dependencias

**Files:**
- Modify: `package.json`
- Create: `.gitignore`

- [x] **Step 1: Reemplazar package.json completo**

Sobrescribe `package.json` con exactamente esto (sin `devDependencies`: las añadirá npm en el siguiente paso):

```json
{
  "name": "annotations-design-patterns",
  "version": "0.1.0",
  "description": "Patrones de diseño como decoradores TypeScript estándar (TC39)",
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./*": {
      "import": { "types": "./dist/patterns/*.d.ts", "default": "./dist/patterns/*.js" },
      "require": { "types": "./dist/patterns/*.d.cts", "default": "./dist/patterns/*.cjs" }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "author": "",
  "license": "ISC"
}
```

- [x] **Step 2: Instalar devDependencies**

Run: `npm install -D typescript tsup vitest`
Expected: termina sin errores; npm añade la sección `devDependencies` al `package.json` con las últimas versiones y crea `node_modules/` y `package-lock.json`. No edites esa sección a mano.

- [x] **Step 3: Crear .gitignore**

```gitignore
node_modules/
dist/
```

### Task 2: tsconfig.json

**Files:**
- Create: `tsconfig.json`

- [x] **Step 1: Crear tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "tests"]
}
```

Nota: `"DOM"` está en `lib` solo para tener los tipos de `setTimeout` sin depender de
`@types/node`. NO añadas `experimentalDecorators`: los decoradores TC39 funcionan sin flags.

- [x] **Step 2: Verificar que compila (aún sin archivos)**

Run: `npx tsc --noEmit`
Expected: error "No inputs were found" (normal: todavía no hay archivos `.ts`). Cualquier otro error es un problema real.

### Task 3: tsup.config.ts

**Files:**
- Create: `tsup.config.ts`

- [x] **Step 1: Crear tsup.config.ts**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/patterns/*.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2022',
});
```

### Task 4: Smoke test de decoradores TC39 (TDD)

Este test de-riesga el toolchain entero: si vitest o tsup no soportan decoradores TC39,
falla aquí y no en mitad de la Fase 1.

**Files:**
- Create: `src/index.ts`
- Create: `tests/smoke.test.ts`

- [x] **Step 1: Escribir el test que falla**

Crea `tests/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { LIB_NAME } from '../src/index';

describe('toolchain', () => {
  it('exporta el nombre de la librería', () => {
    expect(LIB_NAME).toBe('annotations-design-patterns');
  });

  it('soporta decoradores TC39 de clase', () => {
    let decorated = false;
    function Marker<T extends new (...args: any[]) => object>(
      target: T,
      context: ClassDecoratorContext<T>
    ): T {
      decorated = context.kind === 'class';
      return target;
    }

    @Marker
    class Sample {}

    expect(new Sample()).toBeInstanceOf(Sample);
    expect(decorated).toBe(true);
  });
});
```

- [x] **Step 2: Ejecutar el test y verificar que falla**

Run: `npm test`
Expected: FAIL — no existe `src/index.ts` (error de import).

- [x] **Step 3: Implementación mínima**

Crea `src/index.ts`:

```ts
export const LIB_NAME = 'annotations-design-patterns';
```

- [x] **Step 4: Ejecutar tests y typecheck en verde**

Run: `npm test`
Expected: PASS (2 tests).

Run: `npm run typecheck`
Expected: sin errores.

- [x] **Step 5: Verificar que el build funciona**

Run: `npm run build`
Expected: crea `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` sin errores.

- [x] **Step 6: Invocar la skill `verify` y después commitear**

```bash
git add -A
git commit -m "chore: scaffolding TypeScript + tsup + vitest con soporte de decoradores TC39"
```

## Criterio de salida de la Fase 0

- `npm test`, `npm run typecheck` y `npm run build` en verde.
- El smoke test demuestra decoradores TC39 funcionando.
- Todo commiteado. La Fase 1 puede empezar.
