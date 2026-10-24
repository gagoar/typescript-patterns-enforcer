export const read = (files: ReadonlyMap<string, string>, path: string): string => {
  const text = files.get(path);
  if (text === undefined) throw new Error(`unreadable: ${path}`);
  return text;
};
export const next = (counts: Readonly<Record<string, number>>, key: string): number => (counts[key] ?? 0) + 1;
export const label = (name: string | undefined): string => `name: ${name ?? ""}`;
