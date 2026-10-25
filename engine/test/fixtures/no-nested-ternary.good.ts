const STATUS_LABELS = { active: "Active", paused: "Paused" } as const satisfies Record<string, string>;
export function describeStatus(status: string): string {
  return STATUS_LABELS[status] ?? "Unknown";
}
