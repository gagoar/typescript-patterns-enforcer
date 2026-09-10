interface Options {
  retries?: number;
}
export function withDefaults(options: Options): Options {
  return { retries: 1, ...options };
}
