// must run before any downstream read — a negative value corrupts the index
export function guardFirst(value: number): number {
  return value + 1;
}
