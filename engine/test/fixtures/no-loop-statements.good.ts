export function matchedIds(rules: { id: string; matched: boolean }[]): string[] {
  return rules.filter((rule) => rule.matched).map((rule) => rule.id);
}
