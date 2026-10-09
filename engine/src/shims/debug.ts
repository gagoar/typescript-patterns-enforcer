// Build-time replacement for the `debug` package (see build.mjs `alias`).
//
// The real package lists every variable in the process environment at load
// time to collect `DEBUG_*` settings. This engine never turns on debug
// logging, and it runs on every Edit/Write, so it should not walk the user's
// environment. Every logger here is a disabled no-op.
// Same call surface the bundled ESLint / typescript-eslint code uses:
// `createDebug(ns)`, `.enabled`, `.extend`, `.enable`, `.disable`, `.formatters`.

interface Debugger {
  (...args: readonly unknown[]): void;
  readonly namespace: string;
  readonly enabled: false;
  readonly useColors: false;
  extend: (suffix: string) => Debugger;
  destroy: () => boolean;
}

interface CreateDebug {
  (namespace: string): Debugger;
  readonly enabled: (namespace: string) => false;
  readonly enable: (namespaces: string) => void;
  readonly disable: () => string;
  readonly formatters: Readonly<Record<string, never>>;
}

function createDebugger(namespace: string): Debugger {
  const logger: Debugger = Object.assign((): void => undefined, {
    namespace,
    enabled: false as const,
    useColors: false as const,
    extend: (suffix: string): Debugger => createDebugger(`${namespace}:${suffix}`),
    destroy: (): boolean => false,
  });
  return logger;
}

const createDebug: CreateDebug = Object.assign(createDebugger, {
  enabled: (): false => false,
  enable: (): void => undefined,
  disable: (): string => "",
  formatters: {},
});

export = createDebug;
