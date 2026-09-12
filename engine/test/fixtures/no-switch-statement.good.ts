const ROLE_LABELS: Record<string, string> = { admin: "Admin" };
export function describeRole(role: string): string {
  return ROLE_LABELS[role] ?? "Guest";
}
