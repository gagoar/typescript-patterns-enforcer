// <release>-rc.<n>, n without leading zeros. Matches "v1.2.0-rc.10" → ("v1.2.0", "10"); rejects "v1.2.0-rc.0" and "v1.2.0-rc1".
// https://regex101.com/?flavor=javascript&regex=%5E%28.%2B%29-rc%5C.%28%5B1-9%5D%5Cd%2A%29%24&flags=gm&testString=v1.2.0-rc.10%0Av1.2.0-rc.0%0Av1.2.0-rc1
export const RC_PATTERN = /^(.+)-rc\.([1-9]\d*)$/;

export function ratio(a: number, b: number): number {
  return a / b;
}

export function slug(input: string): string {
  // Runs of whitespace collapse to one dash: "a  b" → "a-b"; "ab" is unchanged.
  // https://regex101.com/?flavor=javascript&regex=%5Cs%2B&flags=g&testString=a%20%20b%0Aab
  return input.replace(/\s+/g, "-");
}

/**
 * A bare major-only version tag. Matches "v12"; rejects "v1.2" and "12".
 * https://regex101.com/?flavor=javascript&regex=%5Ev%5Cd%2B%24&flags=gm&testString=v12%0Av1.2%0A12
 */
export const MAJOR_TAG = new RegExp("^v\\d+$");
