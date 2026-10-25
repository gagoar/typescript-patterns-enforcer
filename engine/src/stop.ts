import { readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { runChecks } from "./registry";
import { violationLines } from "./report";

// The edit hook only sees files written by the Edit/Write tools. A file written through a
// shell heredoc or a script is invisible to it, so at Stop this walks the working directory
// for .ts/.tsx files modified since the session's transcript was created and checks those.
// It reads files and lists directories only: no git, no child process, no writes.
// Advisory: it reports through `systemMessage` and exits 0, so it can never trap a session.

const EXIT_OK = 0;
// Matches "src/a.ts" and "App.tsx"; rejects "a.d.ts", "notes.md" and "a.ts.bak".
// https://regex101.com/?flavor=javascript&regex=%5E%28%3F%21.%2A%5C.d%5C.tsx%3F%24%29.%2A%5C.tsx%3F%24&flags=gm&testString=src%2Fa.ts%0AApp.tsx%0Aa.d.ts%0Anotes.md%0Aa.ts.bak
// (the link carries the m flag only so the tester tries each example line)
const TS_FILE = /^(?!.*\.d\.tsx?$).*\.tsx?$/;
const SKIPPED_DIRS: ReadonlySet<string> = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", ".next", ".turbo"]);
const MAX_DEPTH = 8;

interface StopPayload {
  readonly cwd?: string;
  readonly transcript_path?: string;
  readonly stop_hook_active?: boolean;
}

// Absent when the transcript or the clock fact cannot be read; the hook then stays silent.
function sessionStart(transcriptPath: string | undefined): number | undefined {
  if (!transcriptPath) return undefined;
  try {
    const { birthtimeMs, ctimeMs } = statSync(transcriptPath);
    return birthtimeMs || ctimeMs;
  } catch {
    return undefined;
  }
}

function entriesOf(dir: string): readonly Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function modifiedSince(file: string, since: number): boolean {
  try {
    return statSync(file).mtimeMs >= since;
  } catch {
    return false;
  }
}

// Symlinks are neither files nor directories to a Dirent, so they are never followed.
function tsFilesUnder(dir: string, depth: number): readonly string[] {
  if (depth > MAX_DEPTH) return [];
  return entriesOf(dir).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : tsFilesUnder(path, depth + 1);
    return entry.isFile() && TS_FILE.test(entry.name) ? [path] : [];
  });
}

function reportFor(file: string): readonly string[] {
  try {
    const violations = runChecks(readFileSync(file, "utf8"), file);
    return violations.length ? [`${file}:`, ...violationLines(violations)] : [];
  } catch {
    return [];
  }
}

function main(): void {
  const payload = JSON.parse(readFileSync(0, "utf8")) as StopPayload;
  const since = sessionStart(payload.transcript_path);
  if (payload.stop_hook_active || since === undefined) process.exit(EXIT_OK);
  const root = payload.cwd ?? process.cwd();
  const lines = tsFilesUnder(root, 0)
    .filter((file) => modifiedSince(file, since))
    .flatMap(reportFor);
  if (!lines.length) process.exit(EXIT_OK);
  const message = [
    "ts-patterns: mechanical violations in TypeScript files changed this session (the edit hook does not see files written through a shell):",
    ...lines,
  ].join("\n");
  process.stdout.write(JSON.stringify({ systemMessage: message }));
  process.exit(EXIT_OK);
}

main();
