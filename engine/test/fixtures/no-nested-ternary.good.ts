const STATUS_LABELS: Record<string, string> = { active: "Active", paused: "Paused" };
export function describeStatus(status: string): string {
  return STATUS_LABELS[status] ?? "Unknown";
}
