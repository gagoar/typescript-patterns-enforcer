import { readFileSync } from "node:fs";
import { runChecks, type Violation } from "./registry";

const EXIT_OK = 0; // informational only, or "not our file" / "couldn't run"
const EXIT_BLOCK = 2; // per the PostToolUse hook contract: stderr fed back to Claude
const TS_FILE = /\.tsx?$/;

interface HookPayload {
  readonly tool_input?: { readonly file_path?: string };
}

function format(filePath: string, violations: readonly Violation[]): string {
  const lines = violations.map(
    (v) => `  L${v.line}:${v.column}  ${v.ruleId}  ${v.text}  → ${v.pointer}`,
  );
  return [
    `ts-patterns: ${violations.length} mechanical violation(s) in ${filePath}:`,
    ...lines,
    "Fix these to satisfy the TypeScript patterns before continuing.",
    "",
  ].join("\n");
}

function main(): void {
  const raw = readFileSync(0, "utf8"); // fd 0 = stdin, the hook's JSON payload
  const payload = JSON.parse(raw) as HookPayload;
  const filePath = payload.tool_input?.file_path;
  if (!filePath || !TS_FILE.test(filePath)) {
    process.exit(EXIT_OK);
  }

  let code: string;
  try {
    // PostToolUse fires after the edit lands — read the post-edit content
    // fresh from disk rather than trusting tool_result.
    code = readFileSync(filePath, "utf8");
  } catch {
    process.exit(EXIT_OK);
  }

  const violations = runChecks(code, filePath);
  if (violations.length === 0) {
    process.exit(EXIT_OK);
  }
  process.stderr.write(format(filePath, violations));
  process.exit(EXIT_BLOCK);
}

main();
