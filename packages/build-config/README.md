# @relay/build-config

Shared build configurations for Relay Platform packages.

## Installation

```bash
pnpm add -D @relay/build-config
```

## Usage

### tsup Configuration

```typescript
// tsup.config.ts
import { createTsupConfig } from '@relay/build-config/tsup';

export default createTsupConfig();
```

With custom options:

```typescript
import { createTsupConfig } from '@relay/build-config/tsup';

export default createTsupConfig({
  entry: ['src/index.ts', 'src/middleware.ts'],
  external: ['hono'],
});
```

### Available tsup Factories

#### `createTsupConfig(options?)`

Basic configuration for TypeScript packages.

```typescript
import { createTsupConfig } from '@relay/build-config/tsup';

export default createTsupConfig({
  entry: ['src/index.ts'],
});
```

#### `createMultiEntryTsupConfig(entries, options?)`

For packages with multiple entry points.

```typescript
import { createMultiEntryTsupConfig } from '@relay/build-config/tsup';

export default createMultiEntryTsupConfig([
  'src/index.ts',
  'src/auth/index.ts',
  'src/services/index.ts',
]);
```

#### `createReactTsupConfig(options?)`

For packages with React components.

```typescript
import { createReactTsupConfig } from '@relay/build-config/tsup';

export default createReactTsupConfig({
  entry: ['src/index.ts'],
});
```

#### `createCliTsupConfig(cliEntry?, options?)`

For CLI packages with shebang banner.

```typescript
import { createCliTsupConfig } from '@relay/build-config/tsup';

export default createCliTsupConfig('src/cli.ts');
```

### vitest Configuration

```typescript
// vitest.config.ts
import { createVitestConfig } from '@relay/build-config/vitest';

export default createVitestConfig();
```

### Available vitest Factories

#### `createVitestConfig(options?)`

Basic configuration for Node.js tests.

```typescript
import { createVitestConfig } from '@relay/build-config/vitest';

export default createVitestConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
  },
});
```

#### `createReactVitestConfig(options?)`

For React/browser testing with jsdom.

```typescript
import { createReactVitestConfig } from '@relay/build-config/vitest';

export default createReactVitestConfig();
```

#### `createIntegrationVitestConfig(options?)`

For integration tests with longer timeouts.

```typescript
import { createIntegrationVitestConfig } from '@relay/build-config/vitest';

export default createIntegrationVitestConfig();
```

## Default Configurations

### tsup Defaults

```javascript
{
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  splitting: false,
  outDir: 'dist',
}
```

### vitest Defaults

```javascript
{
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    testTimeout: 10000,
  },
}
```

## License

MIT
