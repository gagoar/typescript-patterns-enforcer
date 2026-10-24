export function guard(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export const log = (message: string): void => {
  process.stdout.write(message);
};
