interface Options {
  retries?: number;
}
export function withDefaults(options: Options): Options {
  options.retries ??= 1;
  return options;
}
