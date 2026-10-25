export const read = (files: ReadonlyMap<string, string>, path: string): string => files.get(path) ?? "";
export const statusOf = (error: { readonly status?: number }): number => error.status ?? 0;
