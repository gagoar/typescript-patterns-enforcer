import type { Violation } from "./registry";

// One line per violation, shared by the edit hook and the Stop hook so both read the same.
export const violationLines = (violations: readonly Violation[]): readonly string[] =>
  violations.map((v) => `  L${v.line}:${v.column}  ${v.ruleId}  ${v.text}  → ${v.pointer}`);
