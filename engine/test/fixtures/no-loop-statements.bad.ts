export function matchedIds(rules: { id: string; matched: boolean }[]): string[] {
  const result: string[] = [];
  for (const rule of rules) {
    if (rule.matched) result.push(rule.id);
  }
  return result;
}
