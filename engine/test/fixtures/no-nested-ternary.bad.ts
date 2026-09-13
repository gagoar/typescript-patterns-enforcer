export function describeStatus(status: string): string {
  return status === "active" ? "Active" : status === "paused" ? "Paused" : "Unknown";
}
