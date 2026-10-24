const DEFAULT_LIMIT = 42;
export const getLimit = (): number => DEFAULT_LIMIT;
export const MAX_BYTES = 16 * 1024 * 1024;
export const HTTP_STATUS = { ok: 200, notFound: 404, nested: { gone: 410 } } as const satisfies Record<string, unknown>;
