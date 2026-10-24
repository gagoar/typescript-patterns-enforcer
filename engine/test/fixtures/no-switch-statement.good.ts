const ROLE_LABELS = { admin: "Admin" } as const satisfies Record<string, string>;
export function describeRole(role: string): string {
  return ROLE_LABELS[role] ?? "Guest";
}
