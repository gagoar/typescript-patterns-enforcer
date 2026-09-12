export function describeRole(role: string): string {
  switch (role) {
    case "admin":
      return "Admin";
    default:
      return "Guest";
  }
}
