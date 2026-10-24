export function guard(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
export const assertPresent = (value: unknown): void => {
  if (!value) throw new Error("missing");
};
