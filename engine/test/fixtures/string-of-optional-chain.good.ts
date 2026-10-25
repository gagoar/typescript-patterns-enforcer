export const first = (match: RegExpExecArray | null): string => {
  const captured = match?.[1];
  if (captured === undefined) throw new Error("no match");
  return captured;
};
