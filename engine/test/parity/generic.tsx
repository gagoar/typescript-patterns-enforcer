const id = <T extends object>(value: T) => value;
export const pair = <A extends string, B>(a: A, b: B) => [a, b];
export const wait = (ms: number) => ms + 42;
export { id };
